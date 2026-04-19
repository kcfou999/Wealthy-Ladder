import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const viewport: Viewport = {
  themeColor: '#0f172a',
};

export const metadata: Metadata = {
  title: '財富與收入百分位計算機',
  description:
    '計算你的收入與淨資產在台灣、先進經濟體、全球的百分位排名。資料來源：DGBAS 2023、OECD 2023、Credit Suisse 2023。',
  openGraph: {
    title: '財富與收入百分位計算機',
    description: '計算你的收入與淨資產在台灣、先進經濟體、全球的百分位排名',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '財富與收入百分位計算機',
    description: '計算你的收入與淨資產在台灣、先進經濟體、全球的百分位排名',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${geist.variable} bg-slate-900`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
