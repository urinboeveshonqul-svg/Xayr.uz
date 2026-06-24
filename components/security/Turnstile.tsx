'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';

// Public site key — safe to expose to the browser (Cloudflare's design).
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

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

/**
 * Cloudflare Turnstile widget. Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY
 * is not configured (the server verifier then fails open), so local/dev setups
 * keep working without keys.
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

  const reset = useCallback(() => {
    if (window.turnstile && widgetId.current) {
      window.turnstile.reset(widgetId.current);
      onVerifyRef.current(null);
    }
  }, []);

  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => {
    if (!SITE_KEY) return; // not configured → nothing to render
    let cancelled = false;

    loadScript()
      .then(() => {
        const el = containerRef.current;
        const api = window.turnstile;
        if (cancelled || !el || !api || widgetId.current) return;
        widgetId.current = api.render(el, {
          sitekey: SITE_KEY,
          theme,
          callback: (token: string) => onVerifyRef.current(token),
          'expired-callback': () => onVerifyRef.current(null),
          'error-callback': () => onVerifyRef.current(null),
        });
      })
      .catch(() => {
        // Script blocked/failed — leave token null; the server decides (fails
        // open when the secret is unset, blocks when configured + no token).
      });

    return () => {
      cancelled = true;
      if (window.turnstile && widgetId.current) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* ignore */
        }
        widgetId.current = null;
      }
    };
  }, [theme]);

  if (!SITE_KEY) return null;
  return <div ref={containerRef} className={className} />;
});
