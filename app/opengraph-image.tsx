import { ImageResponse } from 'next/og';

// Site-wide default social preview — used for the homepage and any route without
// its own opengraph-image (campaigns have their own dynamic one). Latin-only text
// so it renders reliably with Satori's built-in font, no remote fetch.
export const runtime = 'nodejs';
export const alt = 'Xayr — xayriya platformasi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '36px',
          fontFamily: 'sans-serif',
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 55%, #10b981 100%)',
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '24px',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
              <path
                d="M24 24 L42 42 M72 72 L54 54 M72 24 L54 42 M24 72 L42 54"
                stroke="#059669"
                strokeWidth="13"
                strokeLinecap="butt"
              />
            </svg>
          </div>
          <div style={{ fontSize: '92px', fontWeight: 700, letterSpacing: '-2px' }}>Xayr</div>
        </div>
        <div style={{ fontSize: '36px', opacity: 0.95 }}>Ishonchli xayriya platformasi</div>
      </div>
    ),
    { ...size }
  );
}
