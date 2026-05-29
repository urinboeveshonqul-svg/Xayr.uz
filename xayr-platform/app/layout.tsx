import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'react-hot-toast';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: "Xayr — O'zbekiston Xayriya Platformasi",
  description:
    "O'zbekistondagi eng ishonchli xayriya platformasi. Kampaniya yarating, xayriya qiling va o'zgarish yarating.",
  keywords: ['xayriya', 'crowdfunding', 'uzbekistan', 'kampaniya', 'yordam'],
  openGraph: {
    title: "Xayr — O'zbekiston Xayriya Platformasi",
    description: "Sevganlaringizga yordam bering, muhim sabablarga hissa qo'shing.",
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1f2937',
              color: '#fff',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: '600',
            },
            success: { style: { background: '#16a34a' } },
            error: { style: { background: '#dc2626' } },
          }}
        />
      </body>
    </html>
  );
}
