import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '財富與收入百分位計算機';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0f172a',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '80px 80px 60px 88px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          position: 'relative',
        }}
      >
        {/* Left accent bar */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: 8, height: '100%', background: '#1d4ed8' }} />

        {/* Title */}
        <div style={{ color: '#f1f5f9', fontSize: 54, fontWeight: 600, marginBottom: 12, display: 'flex' }}>
          財富與收入百分位計算機
        </div>
        <div style={{ color: '#60a5fa', fontSize: 28, marginBottom: 48, display: 'flex' }}>
          Wealth &amp; Income Percentile Calculator
        </div>

        {/* Description */}
        <div style={{ color: '#64748b', fontSize: 24, marginBottom: 'auto', display: 'flex' }}>
          計算你的收入與淨資產在台灣、先進經濟體、全球的百分位排名
        </div>

        {/* Region tags + source */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 16 }}>
            {['台灣', '先進經濟體', '全球'].map((label) => (
              <div
                key={label}
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 12,
                  padding: '8px 24px',
                  color: '#94a3b8',
                  fontSize: 22,
                  display: 'flex',
                }}
              >
                {label}
              </div>
            ))}
          </div>
          <div style={{ color: '#1e293b', fontSize: 16, display: 'flex' }}>
            DGBAS 2023 · OECD 2023 · Credit Suisse 2023
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
