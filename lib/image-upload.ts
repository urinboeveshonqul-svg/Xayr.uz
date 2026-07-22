import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared client-side upload helpers for every Supabase Storage upload surface
 * (campaign create, KYC verification, completion reports, campaign updates).
 *
 * Why this module exists: the buckets enforce `allowed_mime_types` +
 * `file_size_limit` server-side (supabase/storage-bucket-limits.sql, #56). The
 * original call sites derived the extension with `file.name.split('.').pop()`,
 * set no Content-Type, and had no timeout — so an Android photo captured in
 * HEIC/HEIF (Samsung/Pixel default) or handed back with an empty `File.type`
 * failed the server MIME check and surfaced only a generic error. These helpers
 * fix the extension/Content-Type derivation, add an upload timeout, and turn the
 * raw Supabase StorageError into a specific, translatable reason.
 */

// Image MIME types the image-only buckets accept — mirrors the allow-list in
// supabase/storage-bucket-limits.sql (campaign-images / profile-photos /
// verification-documents). HEIC/HEIF are intentionally absent: browsers cannot
// render them in <img>, so we reject them with a clear message instead.
export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'] as const;

// MIME → canonical extension, and the reverse, used to derive a sane extension
// and Content-Type when the browser/OS gives us an unreliable filename or type.
// Includes the document types the campaign-reports bucket also accepts.
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

const EXT_TO_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_TO_EXT).map(([mime, ext]) => [ext, mime])
);

// A stalled upload on a weak mobile connection would otherwise spin forever.
export const UPLOAD_TIMEOUT_MS = 45_000;

export type UploadFailure =
  | 'too_large'
  | 'unsupported_format'
  | 'timeout'
  | 'sign_in_again'
  | 'permission_denied'
  | 'unknown';

export class UploadError extends Error {
  code: UploadFailure;
  constructor(code: UploadFailure, message: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

export function isAcceptedImageMime(mime: string): boolean {
  return (IMAGE_MIME as readonly string[]).includes(mime);
}

/**
 * Derive a file extension. Android content providers frequently hand back a
 * `File` whose `name` has no extension (a content:// display name), for which
 * `split('.').pop()` returns the whole name — so prefer a real dotted extension
 * only when it looks like one, then fall back to the MIME type, then `fallback`.
 */
export function fileExtension(file: File, fallback = 'jpg'): string {
  const dot = file.name.lastIndexOf('.');
  if (dot > 0 && dot < file.name.length - 1) {
    const ext = file.name.slice(dot + 1).toLowerCase();
    if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
  }
  return MIME_TO_EXT[file.type] ?? fallback;
}

/**
 * Client-side pre-check for an image input, mirroring the bucket rules so an
 * oversized or wrong-format file is rejected instantly with a specific reason.
 * MIME is only rejected when the browser actually reported one — some Android
 * providers give an empty `type` for a valid JPEG, which is validated server-side.
 */
export function imageRejectReason(file: File, maxBytes: number): 'too_large' | 'unsupported_format' | null {
  if (file.size > maxBytes) return 'too_large';
  if (file.type && !isAcceptedImageMime(file.type)) return 'unsupported_format';
  return null;
}

// Map a Supabase StorageError (or a network/abort failure) onto a UploadFailure.
// StorageApiError carries an HTTP `status`; the message text is server-provided.
export function classifyStorageError(error: unknown): UploadError {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : undefined;
  const raw = error instanceof Error ? error.message : String(error);
  const msg = raw.toLowerCase();

  if (status === 413 || msg.includes('maximum allowed size') || msg.includes('too large') || msg.includes('payload too large')) {
    return new UploadError('too_large', raw);
  }
  if (status === 415 || msg.includes('mime') || msg.includes('not supported') || msg.includes('invalid_mime')) {
    return new UploadError('unsupported_format', raw);
  }
  if (status === 401 || msg.includes('jwt') || msg.includes('token is expired') || msg.includes('unauthorized')) {
    return new UploadError('sign_in_again', raw);
  }
  if (status === 403 || msg.includes('row-level security') || msg.includes('violates') || msg.includes('permission') || msg.includes('forbidden')) {
    return new UploadError('permission_denied', raw);
  }
  if (msg.includes('abort') || msg.includes('timeout') || msg.includes('timed out') || msg.includes('network') || msg.includes('failed to fetch')) {
    return new UploadError('timeout', raw);
  }
  return new UploadError('unknown', raw);
}

/** i18n key (under `toasts.*`) for a caught upload failure. */
export function uploadErrorKey(err: unknown): string {
  const code = err instanceof UploadError ? err.code : 'unknown';
  switch (code) {
    case 'too_large':
      return 'toasts.imageSize5mb';
    case 'unsupported_format':
      return 'toasts.imageUnsupportedFormat';
    case 'timeout':
      return 'toasts.imageUploadTimeout';
    case 'sign_in_again':
      return 'toasts.imageSignInAgain';
    case 'permission_denied':
      return 'toasts.imageStoragePermission';
    default:
      return 'toasts.imageUploadFailed';
  }
}

// Minimal, permanent diagnostic — one concise line so the exact reason for an
// upload failure (Supabase status/code + the file's MIME/size) is recoverable
// from the console / error tracker without dumping the whole response.
function logUploadFailure(bucket: string, file: File, err: UploadError, rawError: unknown): void {
  const status =
    rawError && typeof rawError === 'object' && 'status' in rawError
      ? (rawError as { status?: number }).status
      : undefined;
  // eslint-disable-next-line no-console
  console.error('[image-upload] failed', {
    bucket,
    code: err.code,
    status: status ?? '(n/a)',
    message: err.message,
    mime: file.type || '(empty)',
    sizeKB: Math.round(file.size / 1024),
  });
}

/**
 * Upload a file to a Storage bucket with the Android-hardening applied: an
 * explicit Content-Type (so an empty `File.type` is not stored as octet-stream
 * and rejected), and a timeout race (supabase-js 2.45 has no AbortSignal on
 * `upload()`). Throws a classified {@link UploadError} on failure; the caller
 * derives the public URL or keeps the storage path as it needs.
 */
export async function uploadToStorage(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  file: File,
  options: { upsert?: boolean } = {}
): Promise<void> {
  const ext = fileExtension(file);
  const contentType = file.type || EXT_TO_MIME[ext] || 'application/octet-stream';

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new UploadError('timeout', `upload exceeded ${UPLOAD_TIMEOUT_MS}ms`)),
      UPLOAD_TIMEOUT_MS
    );
  });

  try {
    const result = await Promise.race([
      supabase.storage.from(bucket).upload(path, file, { ...options, contentType }),
      timeout,
    ]);
    if (result.error) {
      const err = classifyStorageError(result.error);
      logUploadFailure(bucket, file, err, result.error);
      throw err;
    }
  } catch (e) {
    if (e instanceof UploadError) {
      if (e.code === 'timeout') logUploadFailure(bucket, file, e, null);
      throw e;
    }
    const err = classifyStorageError(e);
    logUploadFailure(bucket, file, err, e);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
