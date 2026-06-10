'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Camera, Trash2, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_DIM = 512; // longest side after resize

/**
 * Downscale + recompress in the browser (canvas → webp) so large phone photos
 * become small, web-optimized avatars before upload. Aspect ratio preserved;
 * square display is handled by object-cover. Falls back to the original file
 * if the browser lacks createImageBitmap/toBlob.
 */
async function processImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), 'image/webp', 0.85)
    );
  } catch {
    return file;
  }
}

export function AvatarUpload({
  userId,
  initialUrl,
  name,
}: {
  userId: string;
  initialUrl: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);

  const onPick = async (file: File) => {
    if (!TYPES.includes(file.type)) {
      toast.error('Faqat JPG, PNG yoki WEBP rasm yuklang');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Rasm hajmi 5MB dan oshmasligi kerak');
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const blob = await processImage(file);

      // Fixed per-user path: updates overwrite the same object (upsert needs
      // both the insert and update own-folder storage policies).
      const path = `${userId}/avatar`;
      const { error: upErr } = await supabase.storage
        .from('profile-photos')
        .upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' });
      if (upErr) {
        toast.error(upErr.message);
        return;
      }

      // Cache-buster: the path never changes, so version the URL.
      const { data } = supabase.storage.from('profile-photos').getPublicUrl(path);
      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

      const { error: dbErr } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
      if (dbErr) {
        toast.error(dbErr.message);
        return;
      }

      setUrl(publicUrl);
      toast.success('Profil rasmi yangilandi');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Profil rasmini o'chirmoqchimisiz?")) return;
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.storage.from('profile-photos').remove([`${userId}/avatar`]);
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: null })
        .eq('id', userId);
      if (error) {
        toast.error(error.message);
        return;
      }
      setUrl(null);
      toast.success("Profil rasmi o'chirildi");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-5 mb-6 flex items-center gap-4">
      <Avatar src={url} name={name} className="w-20 h-20 text-2xl" />

      <div className="flex flex-col gap-2 min-w-0">
        <label className="btn-primary px-4 py-2.5 text-sm cursor-pointer inline-flex w-fit min-h-[44px] items-center">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
          {url ? "Rasmni o'zgartirish" : 'Rasm yuklash'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = '';
            }}
          />
        </label>

        {url && (
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex w-fit items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-semibold disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" /> Rasmni o&apos;chirish
          </button>
        )}

        <p className="text-xs text-gray-400">JPG, PNG yoki WEBP · maks. 5MB</p>
      </div>
    </div>
  );
}
