'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';

// Public site key — safe to expose to the browser (Cloudflare's design).
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Kept in sync with TURNSTILE_FAILED_MESSAGE in lib/security/turnstile.ts (that
// module is server-only, so the literal is duplicated rather than imported).
const FAILED_MESSAGE = 'Security verification failed. Please try again.';
// Hard cap so the loading state ALWAYS clears, even if the Cloudflare script
// never fires onload/onerror on a flaky (mobile) network — prevents an infinite
// "loading" spinner.
const LOAD_TIMEOUT_MS = 12000;

/**
 * True when Turnstile is configured (a site key is present). Forms use this to
 * gate submission: when enabled, a request must carry a token. When NOT
 * configured the widget is hidden and the server verifier fails open, so forms
 * must behave exactly as before. Safe to call on the client (reads NEXT_PUBLIC).
 */
export function isTurnstileEnabled(): boolean {
  return Boolean(SITE_KEY);
}

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    __turnstileLoading?: Promise<void>;
  }
}

/** Load the Turnstile script exactly once (idempotent across all widgets). */
function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileLoading) return window.__turnstileLoading;
  window.__turnstileLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('turnstile-script-failed'));
    document.head.appendChild(s);
  });
  return window.__turnstileLoading;
}

export interface TurnstileHandle {
  /** Reset the widget so a fresh single-use token can be issued (e.g. after a failed submit). */
  reset: () => void;
}

interface TurnstileProps {
  /** Called with the token on success, or null on expire/error/reset. */
  onVerify: (token: string | null) => void;
  className?: string;
  theme?: 'auto' | 'light' | 'dark';
}

type WidgetStatus = 'loading' | 'ready' | 'error';

/**
 * Cloudflare Turnstile widget with loading + error states.
 *
 * Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not configured (the
 * server verifier then fails open), so local/dev setups keep working. SSR-safe:
 * it's a client component, the container is always present in the DOM, and the
 * initial 'loading' state hydrates identically on server and client.
 */
export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { onVerify, className, theme = 'auto' },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Keep the latest callback without re-rendering the widget.
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  const [status, setStatus] = useState<WidgetStatus>('loading');
  // Bumping this re-runs the render effect (used by the manual "retry" button).
  const [renderNonce, setRenderNonce] = useState(0);

  const reset = useCallback(() => {
    if (window.turnstile && widgetId.current) {
      window.turnstile.reset(widgetId.current);
      onVerifyRef.current(null);
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let active = true;
    setStatus('loading');

    // Failsafe: never let the widget sit in 'loading' forever.
    const timeoutId = setTimeout(() => {
      if (active) setStatus((s) => (s === 'ready' ? s : 'error'));
    }, LOAD_TIMEOUT_MS);

    loadScript()
      .then(() => {
        const el = containerRef.current;
        const api = window.turnstile;
        if (!active || !el || !api) {
          if (active && !api) setStatus('error');
          return;
        }
        // Clear any prior widget before (re-)rendering into the container.
        if (widgetId.current) {
          try {
            api.remove(widgetId.current);
          } catch {
            /* ignore */
          }
          widgetId.current = null;
        }
        el.innerHTML = '';
        try {
          widgetId.current = api.render(el, {
            sitekey: SITE_KEY,
            theme,
            callback: (token: string) => onVerifyRef.current(token),
            'expired-callback': () => onVerifyRef.current(null),
            'error-callback': () => {
              onVerifyRef.current(null);
              if (active) setStatus('error');
            },
          });
          if (active) setStatus('ready');
        } catch {
          if (active) setStatus('error');
        }
      })
      .catch(() => {
        // Script blocked/failed — show the error state; the server still decides
        // (fails open when the secret is unset, blocks when configured + no token).
        if (active) setStatus('error');
      });

    return () => {
      active = false;
      clearTimeout(timeoutId);
      if (window.turnstile && widgetId.current) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* ignore */
        }
        widgetId.current = null;
      }
    };
  }, [theme, renderNonce]);

  if (!SITE_KEY) return null;

  return (
    <div className={className}>
      {/* The widget mounts here; the container must always exist in the DOM. */}
      <div ref={containerRef} aria-busy={status === 'loading'} />

      {status === 'loading' && (
        <p className="mt-1 text-xs text-gray-400" role="status">
          Verifying you&apos;re human…
        </p>
      )}

      {status === 'error' && (
        <div className="mt-1 flex items-center gap-2" role="alert">
          <p className="text-xs text-red-500">{FAILED_MESSAGE}</p>
          <button
            type="button"
            onClick={() => setRenderNonce((n) => n + 1)}
            className="text-xs font-semibold text-brand-600 hover:underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
});
