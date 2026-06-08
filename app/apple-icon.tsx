import { ImageResponse } from 'next/og';

// Apple touch / home-screen icon. Generated as a real PNG at build time so iOS
// renders it reliably (iOS applies its own rounded-corner mask to the square).
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#059669',
        }}
      >
        <svg width="116" height="116" viewBox="0 0 96 96" fill="none">
          <path
            d="M24 24 L42 42 M72 72 L54 54 M72 24 L54 42 M24 72 L42 54"
            stroke="#ffffff"
            strokeWidth="13"
            strokeLinecap="butt"
          />
        </svg>
      </div>
    ),
    size
  );
}
