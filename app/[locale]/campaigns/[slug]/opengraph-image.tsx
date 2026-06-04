import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { formatMoney, getProgress } from '@/lib/utils';

// Node runtime so we can use supabase-js + fetch a webfont at request time.
export const runtime = 'nodejs';
export const revalidate = 3600;

export const alt = 'Xayr — xayriya kampaniyasi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

type OgCampaign = {
  title: string;
  current_amount: number;
  goal_amount: number;
  donors_count: number;
};

async function getCampaign(slug: string): Promise<OgCampaign | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return null;

    const supabase = createClient(url, anon);
    const { data, error } = await supabase
      .from('campaigns')
      .select('title, current_amount, goal_amount, donors_count')
      .eq('slug', slug)
      .single();

    if (error || !data) return null;
    return data as OgCampaign;
  } catch {
    return null;
  }
}

/**
 * Load Inter (Latin + Cyrillic) so Uzbek and Russian titles render with real
 * glyphs instead of tofu. Falls back to the built-in font if the fetch fails,
 * so the route never errors.
 */
async function loadFont(text: string): Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700 }[]> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Inter:wght@400;700&text=${encodeURIComponent(
      text
    )}`;
    // An old User-Agent makes Google serve TTF (which Satori can parse).
    const css = await (
      await fetch(api, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1)' },
      })
    ).text();

    const urls = [...css.matchAll(/src:\s*url\((.+?)\)\s*format\('(?:truetype|opentype)'\)/g)].map(
      (m) => m[1]
    );
    if (urls.length === 0) return [];

    const data = await (await fetch(urls[0])).arrayBuffer();
    return [
      { name: 'Inter', data, weight: 700 },
      { name: 'Inter', data, weight: 400 },
    ];
  } catch {
    return [];
  }
}

export default async function OgImage({ params }: Props) {
  const { slug } = await params;
  const campaign = await getCampaign(slug);

  const title = campaign?.title ?? 'Xayr';
  const raised = campaign?.current_amount ?? 0;
  const goal = campaign?.goal_amount ?? 0;
  const donors = campaign?.donors_count ?? 0;
  const progress = getProgress(raised, goal);

  const fonts = await loadFont(`${title} Xayr xayriya kampaniyasi soʻm ${formatMoney(raised)} ${formatMoney(goal)}`);
  const fontFamily = fonts.length > 0 ? 'Inter' : 'sans-serif';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          fontFamily,
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 55%, #10b981 100%)',
          color: '#ffffff',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '72px',
              height: '72px',
              borderRadius: '20px',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '40px',
            }}
          >
            💚
          </div>
          <div style={{ fontSize: '44px', fontWeight: 700, letterSpacing: '-1px' }}>Xayr</div>
        </div>

        {/* Title */}
        <div
          style={{
            display: 'flex',
            fontSize: title.length > 70 ? '56px' : '68px',
            fontWeight: 700,
            lineHeight: 1.15,
            letterSpacing: '-1.5px',
            maxWidth: '1000px',
          }}
        >
          {title.length > 110 ? `${title.slice(0, 110)}…` : title}
        </div>

        {/* Stats + progress */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              width: '100%',
              height: '20px',
              borderRadius: '999px',
              background: 'rgba(255,255,255,0.25)',
              display: 'flex',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: '999px',
                background: '#ffffff',
              }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '32px' }}>
            <div style={{ display: 'flex', fontWeight: 700 }}>
              {formatMoney(raised)} so&apos;m
            </div>
            <div style={{ display: 'flex', opacity: 0.9 }}>
              {progress}% • {donors} xayriyachi
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.length > 0 ? fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: 'normal' as const })) : undefined,
    }
  );
}
