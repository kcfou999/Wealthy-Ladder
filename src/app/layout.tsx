import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });

export const metadata: Metadata = {
  title: 'Wealth & Income Percentile Calculator',
  description:
    'Calculate where your income and net worth rank relative to Taiwan, Advanced Economies, and Global benchmarks.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} bg-slate-900`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
