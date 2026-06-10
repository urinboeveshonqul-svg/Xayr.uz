'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/** Touch-swipe handlers: swipe left → onLeft (next), right → onRight (prev). */
function useSwipe(onLeft: () => void, onRight: () => void) {
  const startX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0) onLeft();
    else onRight();
  };
  return { onTouchStart, onTouchEnd };
}

/**
 * Full-screen lightbox: keyboard (←/→/Esc), mobile swipe, counter, body-scroll
 * lock. Mounted only while open, so it costs nothing until a user zooms in.
 */
export function Lightbox({
  images,
  initialIndex = 0,
  onClose,
}: {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length]
  );
  const next = useCallback(
    () => setIndex((i) => (i + 1) % images.length),
    [images.length]
  );
  const swipe = useSwipe(next, prev);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, prev, next]);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
      {...swipe}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white"
        aria-label="Yopish"
      >
        <X className="w-7 h-7" />
      </button>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Oldingi"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Keyingi"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg select-none"
        draggable={false}
      />

      {images.length > 1 && (
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
          {index + 1} / {images.length}
        </span>
      )}
    </div>
  );
}

/**
 * Lazy-loaded thumbnail grid that opens the shared Lightbox. Optional `labels`
 * render caption chips (e.g. Avval / Keyin for before-after pairs).
 */
export function ImageGrid({
  images,
  labels,
  cols = 3,
}: {
  images: string[];
  labels?: string[];
  cols?: 2 | 3;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  const colCls = cols === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';

  return (
    <>
      <div className={`grid ${colCls} gap-3`}>
        {images.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800"
            aria-label="Rasmni kattalashtirish"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={labels?.[i] ?? ''}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
            {labels?.[i] && (
              <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-bold">
                {labels[i]}
              </span>
            )}
          </button>
        ))}
      </div>
      {open !== null && (
        <Lightbox images={images} initialIndex={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/**
 * Main campaign gallery: responsive hero viewer (next/image), thumbnail strip,
 * full-screen lightbox, and mobile swipe on the viewer itself. `overlay`
 * renders absolutely-positioned content (e.g. category/urgent badges) on top.
 */
export function Gallery({
  images,
  alt,
  priority = false,
  overlay,
}: {
  images: string[];
  alt: string;
  priority?: boolean;
  overlay?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const prev = () => setIndex((i) => (i - 1 + images.length) % images.length);
  const next = () => setIndex((i) => (i + 1) % images.length);
  const swipe = useSwipe(next, prev);

  if (images.length === 0) return null;

  return (
    <div>
      {/* Main viewer */}
      <div
        className="relative h-72 sm:h-96 bg-gray-100 dark:bg-gray-800 cursor-zoom-in"
        onClick={() => setOpen(true)}
        {...swipe}
      >
        <Image
          key={images[index]}
          src={images[index]}
          alt={alt}
          fill
          quality={80}
          className="object-cover"
          priority={priority && index === 0}
          sizes="(max-width: 1024px) 100vw, 66vw"
        />

        {images.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
              aria-label="Oldingi"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center transition-colors"
              aria-label="Keyingi"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="absolute bottom-3 right-3 px-2 py-0.5 rounded-full bg-black/50 text-white text-xs font-semibold">
              {index + 1}/{images.length}
            </span>
          </>
        )}

        {overlay}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="flex gap-2 p-3 overflow-x-auto">
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              className={`relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 ring-2 transition-all ${
                i === index ? 'ring-brand-500' : 'ring-transparent opacity-70 hover:opacity-100'
              }`}
              aria-label={`Rasm ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {open && <Lightbox images={images} initialIndex={index} onClose={() => setOpen(false)} />}
    </div>
  );
}
