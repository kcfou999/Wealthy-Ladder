'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import debounce from 'lodash/debounce';
import {
  ComposedChart,
  BarChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  Cell,
} from 'recharts';
import { calculatePR, inversePR } from '@/lib/calcEngine';
import rawData from '@/data/mock_data.json';
import type {
  AllRegionsData,
  AgeBracket,
  Region,
  DistributionData,
  MetricType,
} from '@/types/distribution';

const data = rawData as AllRegionsData;
const DEFAULT_RATE = 32;

const DATA_BRACKETS: AgeBracket[] = [
  '20-24', '25-29', '30-34', '35-39', '40-44',
  '45-49', '50-54', '55-59', '60-64',
];
const GLOBAL_REGIONS: Region[] = ['Taiwan', 'Advanced_Economies', 'Global'];
const ASIA_REGIONS: Region[] = ['Hong_Kong', 'Singapore', 'Japan'];
const ALL_REGIONS: Region[] = [...GLOBAL_REGIONS, ...ASIA_REGIONS];

type Lang = 'zh' | 'en';
type ComparisonMode = 'same-age' | 'all-ages';
type ExplorerMetric = MetricType;
type ShareStatus = 'idle' | 'downloaded' | 'copied';
type PRResults = Record<Region, { income: number; netWorth: number }>;

// ── Curve shapes ──────────────────────────────────────────────────────────────

function logNormalPDF(x: number, mu: number, sigma: number): number {
  if (x <= 0) return 0;
  return (
    (1 / (x * sigma * Math.sqrt(2 * Math.PI))) *
    Math.exp(-0.5 * ((Math.log(x) - mu) / sigma) ** 2)
  );
}

const INCOME_CURVE = Array.from({ length: 100 }, (_, i) => ({
  x: i + 1,
  y: logNormalPDF(i + 1, 4.05, 0.7),
}));

const NETWORTH_CURVE = Array.from({ length: 100 }, (_, i) => ({
  x: i + 1,
  y: logNormalPDF(i + 1, 4.0, 1.0),
}));

// ── Animated number hook ──────────────────────────────────────────────────────

function useAnimatedValue(target: number, duration = 500): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const startTime = performance.now();

    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (target - from) * ease);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = target;
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtTWD(v: number): string {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}億`;
  if (v >= 10_000_000) return `${(v / 10_000_000).toFixed(1)}千萬`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}k`;
  return v === 0 ? '0' : Math.round(v).toString();
}

function fmtUSD(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `$${Math.round(v / 1000)}k`;
  return v === 0 ? '$0' : `$${Math.round(v)}`;
}

// ── Formatted number input ────────────────────────────────────────────────────

interface NumericInputProps {
  value: number;
  onChange: (n: number) => void;
  step?: number;
}

function NumericInput({ value, onChange, step = 10000 }: NumericInputProps) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const formatted = value === 0 ? '0' : value.toLocaleString('en-US');

  function handleFocus() {
    setRaw(value === 0 ? '' : value.toString());
    setFocused(true);
  }

  function handleBlur() {
    const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    onChange(isNaN(n) || n < 0 ? 0 : n);
    setFocused(false);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRaw(e.target.value.replace(/[^0-9]/g, ''));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') { e.preventDefault(); onChange(value + step); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(0, value - step)); }
    else if (e.key === 'Enter') { inputRef.current?.blur(); }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={focused ? raw : formatted}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={inputCls}
    />
  );
}

// ── Info Tooltip ──────────────────────────────────────────────────────────────

function InfoTooltip({ lang }: { lang: Lang }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        onClick={() => setOpen((v) => !v)}
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-600 text-[9px] text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-300"
        aria-label={lang === 'zh' ? '百分位說明' : 'What is percentile rank?'}
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-600 bg-slate-900 p-3.5 text-[11px] leading-relaxed text-slate-300 shadow-2xl">
          {lang === 'zh' ? (
            <>
              <p className="mb-1.5 font-medium text-slate-200">什麼是百分位排名？</p>
              <p>
                百分位排名（PR）代表你的數值<span className="text-blue-300">高於多少比例的人</span>。
                例如 PR&nbsp;80 表示你高於對照組中 80% 的人，也就是前 20%。
              </p>
              <p className="mt-1.5 text-slate-500">數值範圍：0 ～ 99.99。</p>
            </>
          ) : (
            <>
              <p className="mb-1.5 font-medium text-slate-200">What is percentile rank?</p>
              <p>
                Percentile rank (PR) shows <span className="text-blue-300">what share of people you rank above</span>.
                A score of 80 means you&apos;re above 80% of the comparison group — the top 20%.
              </p>
              <p className="mt-1.5 text-slate-500">Scale: 0 to 99.99.</p>
            </>
          )}
        </div>
      )}
    </span>
  );
}

// ── PR computation ─────────────────────────────────────────────────────────────

function computeResults(
  age: AgeBracket,
  income: number,
  netWorth: number,
  mode: ComparisonMode,
  twdRate: number
): PRResults | null {
  const bracket: AgeBracket = mode === 'all-ages' ? 'all' : age;
  const out: Partial<PRResults> = {};

  for (const region of ALL_REGIONS) {
    const bd = data[region]?.[bracket];
    if (!bd) return null;

    const isTWD = region === 'Taiwan';
    const incVal = isTWD ? income : income / twdRate;
    const nwVal = isTWD ? netWorth : netWorth / twdRate;

    out[region] = {
      income: calculatePR(incVal, bd.Annual_Income),
      netWorth: calculatePR(nwVal, bd.Net_Worth),
    };
  }
  return out as PRResults;
}

// ── Share image generator ─────────────────────────────────────────────────────

async function generateShareImage(
  results: PRResults,
  age: AgeBracket,
  mode: ComparisonMode,
  lang: Lang,
  host: string
): Promise<Blob> {
  const W = 640, H = 360;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  const font = (size: number, weight = 400) =>
    `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1d4ed8';
  ctx.fillRect(0, 0, 4, H);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = font(17, 600);
  ctx.fillText(lang === 'zh' ? '財富與收入百分位計算機' : 'Wealth & Income Percentile Calculator', 28, 42);

  ctx.fillStyle = '#64748b';
  ctx.font = font(12);
  const sub = mode === 'same-age'
    ? (lang === 'zh' ? `${age} 歲 · 同年齡層比較` : `Age ${age} · Same Age Group`)
    : (lang === 'zh' ? `${age} 歲 · 全體比較` : `Age ${age} · All Ages`);
  ctx.fillText(sub, 28, 62);

  const sep = (y: number) => {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(28, y); ctx.lineTo(W - 28, y); ctx.stroke();
  };
  sep(76);

  const regionLabels = lang === 'zh' ? ['台灣', '先進經濟體', '全球'] : ['Taiwan', 'Adv. Econ.', 'Global'];
  const cols = [28, 232, 436];

  const drawRow = (sectionLabel: string, prValues: number[], yBase: number) => {
    ctx.fillStyle = '#475569';
    ctx.font = font(9, 600);
    ctx.fillText(sectionLabel.toUpperCase(), 28, yBase + 14);

    prValues.forEach((pr, i) => {
      const x = cols[i];
      ctx.fillStyle = '#475569';
      ctx.font = font(10);
      ctx.fillText(regionLabels[i], x, yBase + 34);
      ctx.fillStyle = '#60a5fa';
      ctx.font = font(34, 300);
      ctx.fillText(pr.toFixed(1), x, yBase + 72);
      ctx.fillStyle = '#94a3b8';
      ctx.font = font(11);
      ctx.fillText(
        lang === 'zh' ? `前 ${(100 - pr).toFixed(1)}%` : `Top ${(100 - pr).toFixed(1)}%`,
        x, yBase + 90
      );
    });
  };

  drawRow(
    lang === 'zh' ? '年收入排名' : 'Annual Income Rank',
    [results.Taiwan.income, results.Advanced_Economies.income, results.Global.income],
    86
  );
  sep(190);
  drawRow(
    lang === 'zh' ? '淨資產排名' : 'Net Worth Rank',
    [results.Taiwan.netWorth, results.Advanced_Economies.netWorth, results.Global.netWorth],
    200
  );
  sep(302);

  ctx.fillStyle = '#334155';
  ctx.font = font(10);
  ctx.fillText(host, 28, 322);
  ctx.fillStyle = '#1e293b';
  ctx.font = font(9);
  ctx.fillText(
    lang === 'zh' ? '資料：DGBAS 2023 · OECD 2023 · Credit Suisse 2023' : 'Data: DGBAS 2023 · OECD 2023 · Credit Suisse 2023',
    28, 340
  );

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KPICardProps {
  regionLabel: string;
  metricType: 'income' | 'networth';
  pr: number;
  distribution: DistributionData;
  isTWD: boolean;
  twdRate: number;
  lang: Lang;
}

function KPICard({ regionLabel, metricType, pr, distribution, isTWD, twdRate, lang }: KPICardProps) {
  const animatedPr = useAnimatedValue(pr);
  const xMark = Math.max(1, Math.round(animatedPr));
  const curve = metricType === 'income' ? INCOME_CURVE : NETWORTH_CURVE;
  const fmt = isTWD ? fmtTWD : fmtUSD;
  const topPct = (100 - animatedPr).toFixed(1);

  const anchors = [
    { label: 'P25', value: distribution.p25 },
    { label: 'P50', value: distribution.p50 },
    { label: 'P75', value: distribution.p75 },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800 p-5">
      <p className="text-[10px] uppercase tracking-[0.15em] text-slate-400">{regionLabel}</p>

      <div className="flex items-baseline gap-2">
        <span className="tabular-nums text-[2.5rem] font-light leading-none text-blue-400">
          {animatedPr.toFixed(1)}
        </span>
        <span className="text-xs text-slate-500">/ 100</span>
        <span className="ml-auto rounded-md bg-slate-700/60 px-2 py-0.5 text-xs text-slate-300">
          {lang === 'zh' ? `前 ${topPct}%` : `Top ${topPct}%`}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={68}>
        <ComposedChart data={curve} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="x" hide domain={[1, 100]} type="number" />
          <YAxis hide />
          <Area
            type="monotone"
            dataKey="y"
            stroke="#60a5fa"
            strokeWidth={1.5}
            fill="#1e3a5f"
            fillOpacity={0.55}
            dot={false}
            isAnimationActive={false}
          />
          {[25, 50, 75].map((p) => (
            <ReferenceLine key={p} x={p} stroke="#334155" strokeWidth={1} />
          ))}
          <ReferenceLine x={xMark} stroke="#e2e8f0" strokeWidth={1.5} strokeDasharray="4 3" />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex justify-between border-t border-slate-700/60 pt-2">
        {anchors.map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
            <span className="tabular-nums text-[11px] text-slate-300">{fmt(value)}</span>
            {!isTWD && (
              <span className="tabular-nums text-[9px] text-slate-600">
                ≈{fmtTWD(value * twdRate)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Distribution Explorer ─────────────────────────────────────────────────────

function DistributionExplorer({ defaultAge, lang, twdRate }: { defaultAge: AgeBracket; lang: Lang; twdRate: number }) {
  const [age, setAge] = useState<AgeBracket>(defaultAge);
  const [metric, setMetric] = useState<ExplorerMetric>('Annual_Income');
  const [region, setRegion] = useState<Region>('Taiwan');

  useEffect(() => { setAge(defaultAge); }, [defaultAge]);

  const regionLabels: Record<Region, string> = {
    Taiwan: lang === 'zh' ? '台灣' : 'Taiwan',
    Advanced_Economies: lang === 'zh' ? '先進經濟體' : 'Advanced Economies',
    Global: lang === 'zh' ? '全球' : 'Global',
    Hong_Kong: lang === 'zh' ? '香港' : 'Hong Kong',
    Singapore: lang === 'zh' ? '新加坡' : 'Singapore',
    Japan: lang === 'zh' ? '日本' : 'Japan',
  };

  const bd = data[region]?.[age];
  const dist: DistributionData | undefined = bd?.[metric];
  const isTWD = region === 'Taiwan';
  const fmt = isTWD ? fmtTWD : fmtUSD;
  const currency = isTWD ? 'TWD' : 'USD';

  const chartData = dist
    ? [
        { label: 'P10', pct: 10, value: dist.p10 },
        { label: 'P25', pct: 25, value: dist.p25 },
        { label: 'P50', pct: 50, value: dist.p50 },
        { label: 'P75', pct: 75, value: dist.p75 },
        { label: 'P90', pct: 90, value: dist.p90 },
        { label: 'P95', pct: 95, value: dist.p95 },
        { label: 'P99', pct: 99, value: dist.p99 },
      ]
    : [];

  const barColors = ['#1e3a5f', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];
  const metricLabel = metric === 'Annual_Income'
    ? (lang === 'zh' ? '年收入' : 'Annual Income')
    : (lang === 'zh' ? '淨資產' : 'Net Worth');

  return (
    <section className="mt-14">
      <h2 className="mb-4 text-[10px] uppercase tracking-[0.15em] text-slate-500">
        {lang === 'zh' ? '分布探索' : 'Distribution Explorer'}
      </h2>

      <div className="mb-5 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {ALL_REGIONS.map((r) => (
              <button key={r} onClick={() => setRegion(r)}
                className={`px-3 py-1.5 text-xs transition-colors ${region === r ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                {regionLabels[r]}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {(['Annual_Income', 'Net_Worth'] as ExplorerMetric[]).map((m) => (
              <button key={m} onClick={() => setMetric(m)}
                className={`px-3 py-1.5 text-xs transition-colors ${metric === m ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                {m === 'Annual_Income' ? (lang === 'zh' ? '年收入' : 'Annual Income') : (lang === 'zh' ? '淨資產' : 'Net Worth')}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <div className="flex min-w-max">
            {DATA_BRACKETS.map((b) => (
              <button key={b} onClick={() => setAge(b)}
                className={`px-3 py-1.5 text-xs transition-colors ${age === b ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                {b}
              </button>
            ))}
          </div>
        </div>
      </div>

      {dist ? (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
          <p className="mb-1 text-xs text-slate-400">
            {metricLabel} — {lang === 'zh' ? `${age} 歲` : `Age ${age}`} — {regionLabels[region]}
          </p>
          <p className="mb-4 text-[11px] text-slate-600">
            {lang === 'zh'
              ? `數值單位：${currency}${!isTWD ? `（1 USD ≈ ${twdRate} TWD）` : ''}。游標移至長條可查看詳情。`
              : `Values in ${currency}${!isTWD ? ` (1 USD ≈ ${twdRate} TWD)` : ''}. Hover bars for details.`}
          </p>

          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 16, right: 8, bottom: 0, left: 8 }}>
              <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as { label: string; value: number; pct: number };
                  return (
                    <div className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs">
                      <p className="font-medium text-slate-200">
                        {d.label} — {lang === 'zh' ? `第 ${d.pct} 百分位` : `${d.pct}th percentile`}
                      </p>
                      <p className="text-blue-300">{fmt(d.value)} {currency}</p>
                      {!isTWD && (
                        <p className="text-slate-500">≈ {fmtTWD(d.value * twdRate)} TWD</p>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chartData.map((entry, i) => <Cell key={entry.label} fill={barColors[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-1 grid grid-cols-7 gap-1 text-center">
            {chartData.map((d) => (
              <span key={d.label} className="tabular-nums text-[10px] text-blue-300">{fmt(d.value)}</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{lang === 'zh' ? '此選項暫無數據' : 'No data for this selection.'}</p>
      )}
    </section>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm ' +
  'text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none ' +
  'focus:ring-1 focus:ring-blue-500';

const labelCls = 'mb-1 block text-[10px] uppercase tracking-[0.15em] text-slate-400';

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function PRDashboard() {
  const [lang, setLang] = useState<Lang>('zh');
  const [age, setAge] = useState<AgeBracket>('30-34');
  const [income, setIncome] = useState<number>(600000);
  const [netWorth, setNetWorth] = useState<number>(2500000);
  const [mode, setMode] = useState<ComparisonMode>('same-age');
  const [results, setResults] = useState<PRResults | null>(null);
  const [noData, setNoData] = useState(false);
  const [shareStatus, setShareStatus] = useState<ShareStatus>('idle');
  const [targetPR, setTargetPR] = useState(90);
  const [reverseMode, setReverseMode] = useState<ComparisonMode>('same-age');

  const [twdRate, setTwdRate] = useState(DEFAULT_RATE);
  const [rateLive, setRateLive] = useState(false);

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then((r) => r.json())
      .then((d) => {
        const rate = d?.rates?.TWD;
        if (typeof rate === 'number' && rate > 20 && rate < 50) {
          setTwdRate(parseFloat(rate.toFixed(1)));
          setRateLive(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ageParam = params.get('age') as AgeBracket | null;
    const incomeParam = params.get('income');
    const nwParam = params.get('nw');
    const modeParam = params.get('mode') as ComparisonMode | null;
    const langParam = params.get('lang') as Lang | null;

    if (ageParam && DATA_BRACKETS.includes(ageParam)) setAge(ageParam);
    if (incomeParam) { const n = parseInt(incomeParam, 10); if (!isNaN(n)) setIncome(n); }
    if (nwParam) { const n = parseInt(nwParam, 10); if (!isNaN(n)) setNetWorth(n); }
    if (modeParam === 'same-age' || modeParam === 'all-ages') setMode(modeParam);
    if (langParam === 'zh' || langParam === 'en') setLang(langParam);
  }, []);

  const debouncedCompute = useMemo(
    () =>
      debounce((a: AgeBracket, inc: number, nw: number, m: ComparisonMode, rate: number) => {
        const r = computeResults(a, inc, nw, m, rate);
        if (r) { setResults(r); setNoData(false); }
        else setNoData(true);
      }, 300),
    []
  );

  useEffect(() => {
    debouncedCompute(age, income, netWorth, mode, twdRate);
    return () => debouncedCompute.cancel();
  }, [age, income, netWorth, mode, twdRate, debouncedCompute]);

  async function handleShare() {
    const params = new URLSearchParams({ age, income: income.toString(), nw: netWorth.toString(), mode, lang });
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', url);

    if (!results) return;

    try {
      const blob = await generateShareImage(results, age, mode, lang, window.location.host);
      const file = new File([blob], 'wealth-rank.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: lang === 'zh' ? '我的財富百分位排名' : 'My Wealth Percentile Rank', url });
        return;
      }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'wealth-rank.png';
      a.click();
      URL.revokeObjectURL(a.href);
      setShareStatus('downloaded');
      setTimeout(() => setShareStatus('idle'), 2500);
      return;
    } catch {
      // Share cancelled
    }

    navigator.clipboard.writeText(url).catch(() => {});
    setShareStatus('copied');
    setTimeout(() => setShareStatus('idle'), 2500);
  }

  const activeBracket: AgeBracket = mode === 'all-ages' ? 'all' : age;
  const modeLabel = mode === 'same-age'
    ? (lang === 'zh' ? `對比 ${age} 歲` : `vs. age ${age}`)
    : (lang === 'zh' ? '對比全體' : 'vs. all ages');

  const regionLabels: Record<Region, string> = {
    Taiwan: lang === 'zh' ? '台灣' : 'Taiwan',
    Advanced_Economies: lang === 'zh' ? '先進經濟體' : 'Advanced Economies',
    Global: lang === 'zh' ? '全球' : 'Global',
    Hong_Kong: lang === 'zh' ? '香港' : 'Hong Kong',
    Singapore: lang === 'zh' ? '新加坡' : 'Singapore',
    Japan: lang === 'zh' ? '日本' : 'Japan',
  };

  const shareLabel =
    shareStatus === 'downloaded' ? (lang === 'zh' ? '已下載' : 'Downloaded') :
    shareStatus === 'copied'     ? (lang === 'zh' ? '已複製' : 'Copied') :
    (lang === 'zh' ? '分享' : 'Share');

  const renderKPIRow = (regions: Region[], metric: 'income' | 'networth') =>
    regions.map((region) => {
      if (!results) return null;
      const metricKey: MetricType = metric === 'income' ? 'Annual_Income' : 'Net_Worth';
      const dist = data[region]?.[activeBracket]?.[metricKey];
      if (!dist) return null;
      return (
        <KPICard
          key={region}
          regionLabel={regionLabels[region]}
          metricType={metric}
          pr={results[region][metric === 'income' ? 'income' : 'netWorth']}
          distribution={dist}
          isTWD={region === 'Taiwan'}
          twdRate={twdRate}
          lang={lang}
        />
      );
    });

  return (
    <main className="mx-auto min-h-screen max-w-5xl bg-slate-900 px-4 py-10 text-slate-100 sm:px-6 sm:py-14">
      {/* Header */}
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-light tracking-wide text-slate-100">
            {lang === 'zh' ? '財富與收入百分位計算機' : 'Wealth & Income Percentile Calculator'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {lang === 'zh' ? '台灣 · 先進經濟體 · 全球 · 亞洲同儕' : 'Taiwan · Advanced Economies · Global · Asia Peers'}
          </p>
        </div>
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-slate-700">
          {(['zh', 'en'] as Lang[]).map((l) => (
            <button key={l} onClick={() => setLang(l)}
              className={`px-3 py-1.5 text-xs transition-colors ${lang === l ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
              {l === 'zh' ? '中文' : 'EN'}
            </button>
          ))}
        </div>
      </header>

      {/* Inputs */}
      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={labelCls}>{lang === 'zh' ? '年齡層' : 'Age Bracket'}</label>
          <select value={age} onChange={(e) => setAge(e.target.value as AgeBracket)} className={inputCls}>
            {DATA_BRACKETS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>{lang === 'zh' ? '年收入（台幣）' : 'Annual Income (TWD)'}</label>
          <NumericInput value={income} onChange={setIncome} step={10000} />
        </div>
        <div>
          <label className={labelCls}>{lang === 'zh' ? '淨資產（台幣）' : 'Net Worth (TWD)'}</label>
          <NumericInput value={netWorth} onChange={setNetWorth} step={100000} />
        </div>
      </section>

      {/* Controls row */}
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500">
          {lang === 'zh' ? '比較對象' : 'Compare against'}
        </span>
        <div className="flex overflow-hidden rounded-lg border border-slate-700">
          {(['same-age', 'all-ages'] as ComparisonMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-xs transition-colors ${mode === m ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
              {m === 'same-age' ? (lang === 'zh' ? '同年齡層' : 'Same Age Group') : (lang === 'zh' ? '全體' : 'All Ages')}
            </button>
          ))}
        </div>

        <button onClick={handleShare}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-4 py-1.5 text-xs transition-colors hover:text-slate-200">
          <span className={shareStatus !== 'idle' ? 'text-green-400' : 'text-slate-400'}>{shareLabel}</span>
        </button>
      </div>

      {noData && (
        <p className="mb-8 rounded-lg border border-amber-700 bg-amber-950 px-4 py-3 text-sm text-amber-300">
          {lang === 'zh' ? '此選項暫無數據' : 'No data for this selection.'}
        </p>
      )}

      {results && (
        <>
          {/* Annual Income */}
          <section className="mb-10">
            <h2 className="mb-4 flex items-center text-[10px] uppercase tracking-[0.15em] text-slate-500">
              {lang === 'zh' ? '年收入排名' : 'Annual Income Rank'}
              <span className="ml-2 normal-case text-slate-600">— {modeLabel}</span>
              <InfoTooltip lang={lang} />
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {renderKPIRow(GLOBAL_REGIONS, 'income')}
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-slate-600">
              {lang === 'zh' ? '亞洲同儕' : 'Asia Peers'}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {renderKPIRow(ASIA_REGIONS, 'income')}
            </div>
          </section>

          {/* Net Worth */}
          <section className="mb-10">
            <h2 className="mb-4 flex items-center text-[10px] uppercase tracking-[0.15em] text-slate-500">
              {lang === 'zh' ? '淨資產排名' : 'Net Worth Rank'}
              <span className="ml-2 normal-case text-slate-600">— {modeLabel}</span>
              <InfoTooltip lang={lang} />
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {renderKPIRow(GLOBAL_REGIONS, 'networth')}
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.15em] text-slate-600">
              {lang === 'zh' ? '亞洲同儕' : 'Asia Peers'}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {renderKPIRow(ASIA_REGIONS, 'networth')}
            </div>
          </section>

          {/* Reverse Lookup */}
          <section className="mb-10">
            <h2 className="mb-4 text-[10px] uppercase tracking-[0.15em] text-slate-500">
              {lang === 'zh' ? '反向查詢' : 'What You Need'}
              <span className="ml-2 normal-case text-slate-600">
                — {lang === 'zh' ? `達到前 ${100 - targetPR}%` : `To reach Top ${100 - targetPR}%`}
              </span>
            </h2>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.15em] text-slate-500">
                {lang === 'zh' ? '比較對象' : 'Compare against'}
              </span>
              <div className="flex overflow-hidden rounded-lg border border-slate-700">
                {(['same-age', 'all-ages'] as ComparisonMode[]).map((m) => (
                  <button key={m} onClick={() => setReverseMode(m)}
                    className={`px-3 py-1.5 text-xs transition-colors ${reverseMode === m ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
                    {m === 'same-age' ? (lang === 'zh' ? '同年齡層' : 'Same Age') : (lang === 'zh' ? '全體' : 'All Ages')}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5 flex items-center gap-4">
              <input
                type="range" min={1} max={99} step={1}
                value={targetPR}
                onChange={(e) => setTargetPR(parseInt(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-blue-500"
              />
              <span className="w-36 shrink-0 text-right text-sm tabular-nums text-slate-300">
                {lang === 'zh' ? `第 ${targetPR} 百分位` : `${targetPR}th percentile`}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { metricKey: 'Annual_Income' as MetricType, label: lang === 'zh' ? '年收入需求' : 'Income Required' },
                { metricKey: 'Net_Worth' as MetricType, label: lang === 'zh' ? '淨資產需求' : 'Net Worth Required' },
              ].map(({ metricKey, label }) => {
                const reverseBracket: AgeBracket = reverseMode === 'all-ages' ? 'all' : age;
                return (
                  <div key={metricKey} className="rounded-xl border border-slate-700 bg-slate-800 p-5">
                    <p className="mb-3 text-[10px] uppercase tracking-[0.15em] text-slate-400">{label}</p>
                    {ALL_REGIONS.map((region) => {
                      const dist = data[region]?.[reverseBracket]?.[metricKey];
                      if (!dist) return null;
                      const raw = inversePR(targetPR, dist);
                      const isTWD = region === 'Taiwan';
                      const display = isTWD
                        ? `${fmtTWD(raw)} TWD`
                        : `${fmtUSD(raw)} USD`;
                      const twdHint = !isTWD ? ` ≈ ${fmtTWD(raw * twdRate)} TWD` : '';
                      return (
                        <div key={region} className="flex items-center justify-between border-b border-slate-700/40 py-1.5 last:border-0">
                          <span className="text-xs text-slate-400">{regionLabels[region]}</span>
                          <span className="tabular-nums text-xs text-blue-300">
                            {display}
                            {twdHint && <span className="ml-1.5 text-[10px] text-slate-600">{twdHint}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* Distribution Explorer */}
      <DistributionExplorer defaultAge={age} lang={lang} twdRate={twdRate} />

      {/* Footer */}
      <footer className="mt-16 border-t border-slate-800 pb-10 pt-6">
        <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-slate-600">
          {lang === 'zh' ? '資料來源與說明' : 'Data Source & Accuracy'}
        </p>
        {lang === 'zh' ? (
          <p className="text-[11px] leading-relaxed text-slate-500">
            台灣收入數據來自<span className="text-slate-400">行政院主計總處薪資中位數及分布統計 2023</span>（受雇員工）。
            台灣財富數據來自<span className="text-slate-400">主計總處家庭財富調查 2022</span>（家庭十分位：P10 = 143萬、P50 = 894萬、P90 = 3,391萬台幣），
            原始為<span className="text-slate-400">家戶單位</span>，已依平均家庭人口數（約 2.5 人）換算為<span className="text-slate-400">個人估計值</span>，此換算屬近似值。
            先進經濟體來自<span className="text-slate-400">OECD 2023</span>。全球來自<span className="text-slate-400">瑞士信貸全球財富報告 2023</span>及世界銀行（USD）。
            香港、新加坡、日本數據來自各地統計局及<span className="text-slate-400">Credit Suisse 2023</span>（USD，近似值）。
            所有數值僅供相對排名參考。
            匯率：1 USD = {twdRate} TWD
            {rateLive ? <span className="ml-1 text-green-600">（即時）</span> : <span className="ml-1 text-slate-600">（靜態估算）</span>}。
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-500">
            Taiwan income from <span className="text-slate-400">DGBAS 薪資中位數及分布統計 2023</span> (employed workers).
            Taiwan wealth from <span className="text-slate-400">DGBAS household wealth survey 2022</span> (P10 = NT$1.43M, P50 = NT$8.94M, P90 = NT$33.91M),
            scaled ÷2.5 (avg. household size) to approximate <span className="text-slate-400">per-individual figures</span>.
            Advanced Economies from <span className="text-slate-400">OECD 2023</span>.
            Global from <span className="text-slate-400">Credit Suisse Global Wealth Report 2023</span> &amp; World Bank (USD).
            HK, SG, JP from national statistics agencies &amp; <span className="text-slate-400">Credit Suisse 2023</span> (USD, approximate).
            All values are approximations for relative benchmarking only.
            Exchange rate: 1 USD = {twdRate} TWD
            {rateLive ? <span className="ml-1 text-green-600">(live)</span> : <span className="ml-1 text-slate-600">(static fallback)</span>}.
          </p>
        )}
      </footer>
    </main>
  );
}
