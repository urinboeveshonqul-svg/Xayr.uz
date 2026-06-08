import type { MetadataRoute } from 'next';

// Web App Manifest. Next.js auto-injects <link rel="manifest"> into every page.
// Icons point at the vector favicon (any) and the generated PNG (maskable).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Xayr — Xayriya platformasi',
    short_name: 'Xayr',
    description: 'Ishonchli xayriya va jamoaviy moliyalashtirish platformasi.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#059669',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
