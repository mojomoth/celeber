/**
 * 리포트/시각화 컴포넌트: 리포트 행, 스와치(원형·의류·원단·넥타이·헤어), 원형 게이지,
 * 웜/쿨 그라데이션 바, 축 막대, 레이더 차트, 나란히 비교 바.
 */
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';

/* ------------------------------------------------------------------ 리포트 행 */

/** 한 행 = 관찰 항목 + 한 줄 결론 (DESIGN.md 리포트 규칙) */
export function ReportRow({ icon, label, value, note }: { icon?: IconName; label: ReactNode; value: ReactNode; note?: ReactNode }) {
  return (
    <div className={clsx('cb-report-row', !icon && 'cb-report-row--noicon')}>
      {icon ? (
        <span className="cb-report-row__icon">
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <span className="cb-report-row__label">{label}</span>
      <span className="cb-report-row__value">{value}</span>
      {note ? <span className="cb-report-row__note">{note}</span> : null}
    </div>
  );
}
export function ReportTable({ children }: { children: ReactNode }) {
  return <div className="cb-report-table">{children}</div>;
}

/* ------------------------------------------------------------------ 스와치 */

export type SwatchShape = 'circle' | 'square' | 'shirt' | 'blouse' | 'knit' | 'tee' | 'fabric' | 'suit' | 'jacket' | 'coat' | 'tie' | 'scarf' | 'hair' | 'dress';

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** 의류/원단/헤어 형태 SVG (색은 hex) */
export function SwatchShapeSvg({ hex, shape, size }: { hex: string; shape: SwatchShape; size: number }) {
  const stroke = 'rgba(37,34,43,0.22)';
  const dark = shade(hex, -0.12);
  const light = shade(hex, 0.1);
  const common = { width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true } as const;
  switch (shape) {
    case 'shirt':
    case 'blouse':
      return (
        <svg {...common}>
          <path d="M16 6l-10 6 3 9 5-2v23h20V19l5 2 3-9-10-6-4 3h-8z" fill={hex} stroke={stroke} />
          <path d="M20 6l4 7 4-7" fill={light} stroke={stroke} />
          <path d="M24 13v29" stroke={dark} strokeWidth="1" />
          {[18, 24, 30, 36].map((y) => (
            <circle key={y} cx="25.5" cy={y} r="0.9" fill={dark} />
          ))}
        </svg>
      );
    case 'tee':
    case 'knit':
      return (
        <svg {...common}>
          <path d="M16 7l-10 6 3 8 5-2v23h20V19l5 2 3-8-10-6c-1 3-4 5-8 5s-7-2-8-5z" fill={hex} stroke={stroke} />
          {shape === 'knit' ? <path d="M14 38h20M14 35h20" stroke={dark} strokeWidth="0.8" /> : null}
        </svg>
      );
    case 'suit':
    case 'jacket':
    case 'coat':
      return (
        <svg {...common}>
          <path d="M15 6l-9 6 2 30h32l2-30-9-6-5 4h-8z" fill={hex} stroke={stroke} />
          <path d="M19 6l5 16 5-16" fill="#F8F6F0" stroke={stroke} />
          <path d="M19 6l-3 8 5 3 3 5M29 6l3 8-5 3-3 5" fill={dark} stroke={stroke} />
          <circle cx="24" cy="30" r="1" fill={shade(hex, -0.3)} />
        </svg>
      );
    case 'dress':
      return (
        <svg {...common}>
          <path d="M18 5h12l-2 10 8 28H12l8-28z" fill={hex} stroke={stroke} />
        </svg>
      );
    case 'tie':
      return (
        <svg {...common}>
          <path d="M20 5h8l-2 6 5 24-7 8-7-8 5-24z" fill={hex} stroke={stroke} />
          <path d="M22 17l6 6M21 25l7 7" stroke={dark} strokeWidth="1.2" />
        </svg>
      );
    case 'scarf':
      return (
        <svg {...common}>
          <path d="M8 10c8-4 24-4 32 0l-4 8c-8-3-16-3-24 0z" fill={hex} stroke={stroke} />
          <path d="M14 17l-3 24 7-2 4-21M34 17l3 24-7-2-4-21" fill={dark} stroke={stroke} />
        </svg>
      );
    case 'fabric':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="40" height="40" rx="6" fill={hex} stroke={stroke} />
          {[10, 16, 22, 28, 34, 40].map((v) => (
            <path key={v} d={`M4 ${v}L${v} 4`} stroke={light} strokeWidth="0.8" opacity="0.6" />
          ))}
          <path d="M8 44L44 8" stroke={dark} strokeWidth="0.8" opacity="0.5" />
        </svg>
      );
    case 'hair':
      return (
        <svg {...common}>
          <defs>
            <radialGradient id={`hg-${hex.slice(1)}`} cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor={light} />
              <stop offset="1" stopColor={dark} />
            </radialGradient>
          </defs>
          <circle cx="24" cy="24" r="21" fill={`url(#hg-${hex.slice(1)})`} stroke={stroke} />
          <path d="M12 14c6 4 10 12 10 24M20 9c5 5 8 14 8 28M30 9c3 6 5 13 4 26" stroke={shade(hex, 0.18)} strokeWidth="0.9" fill="none" opacity="0.7" />
        </svg>
      );
    default:
      return null;
  }
}

/** 원형 견본 + 색 이름 (같은 크기 유지) */
export function Swatch({
  hex,
  name,
  size = 48,
  shape = 'circle',
  selected,
  showHex,
  caption,
}: {
  hex: string;
  name?: ReactNode;
  size?: number;
  shape?: SwatchShape;
  selected?: boolean;
  showHex?: boolean;
  caption?: ReactNode;
}) {
  const isBasic = shape === 'circle' || shape === 'square';
  return (
    <span className={clsx('cb-swatch', selected && 'cb-swatch--selected')} style={{ width: Math.max(size, 56) }}>
      <span
        className={clsx('cb-swatch__chip', shape === 'square' && 'cb-swatch__chip--square', !isBasic && 'cb-swatch__chip--shape')}
        style={{ width: size, height: size, background: hex }}
        role="img"
        aria-label={typeof name === 'string' ? `${name} ${hex}` : hex}
      >
        {!isBasic ? <SwatchShapeSvg hex={hex} shape={shape} size={size} /> : null}
      </span>
      {name ? <span className="cb-swatch__name">{name}</span> : null}
      {showHex ? <span className="cb-swatch__hex">{hex.toUpperCase()}</span> : null}
      {caption ? <span className="cb-swatch__hex">{caption}</span> : null}
    </span>
  );
}

/** 같은 크기 스와치 그리드 */
export function SwatchRow({
  items,
  size = 48,
  shape = 'circle',
  columns,
  showHex,
}: {
  items: { hex: string; name?: string; shape?: SwatchShape; selected?: boolean; caption?: ReactNode }[];
  size?: number;
  shape?: SwatchShape;
  /** 기본: 자동 (최소 64px 열) */
  columns?: number;
  showHex?: boolean;
}) {
  return (
    <div className="cb-swatch-row" style={{ gridTemplateColumns: columns ? `repeat(${columns}, minmax(0, 1fr))` : 'repeat(auto-fill, minmax(64px, 1fr))' }}>
      {items.map((it, i) => (
        <Swatch key={`${it.hex}-${i}`} hex={it.hex} name={it.name} size={size} shape={it.shape ?? shape} selected={it.selected} showHex={showHex} caption={it.caption} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ 게이지/바 */

/** 원형 게이지 (분석 신뢰도 등) */
export function Gauge({ value, label, size = 96, color = 'var(--cb-ink)', track = 'var(--cb-line)' }: { value: number; label?: ReactNode; size?: number; color?: string; track?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="cb-gauge">
      <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${Math.round(v)}%`}>
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 50 50)" />
        <text x="50" y="56" textAnchor="middle" fontSize="20" fontWeight="800" fill="currentColor">
          {Math.round(v)}%
        </text>
      </svg>
      {label ? <div className="cb-caption" style={{ fontWeight: 700 }}>{label}</div> : null}
    </div>
  );
}

/** 그라데이션 바 + 위치 마커 (0..1) */
export function GradientBar({ colors, marker, height = 14 }: { colors: string[]; marker?: number; height?: number }) {
  return (
    <div className="cb-gradient-bar" style={{ background: `linear-gradient(90deg, ${colors.join(', ')})`, height }}>
      {marker !== undefined ? <span className="cb-gradient-bar__marker" style={{ left: `${Math.max(0, Math.min(1, marker)) * 100}%` }} /> : null}
    </div>
  );
}

/** ③ 웜톤 vs 쿨톤: 두 퍼센트 + 각 그라데이션 바 (색 + 텍스트로 비교) */
export function WarmCoolBars({
  warmPercent,
  coolPercent,
  warmColors,
  coolColors,
  warmMarker,
  coolMarker,
}: {
  warmPercent: number;
  coolPercent: number;
  warmColors: string[];
  coolColors: string[];
  warmMarker?: number;
  coolMarker?: number;
}) {
  return (
    <div className="cb-warmcool">
      <div>
        <div className="cb-warmcool__label" style={{ color: '#B5651D' }}>
          웜톤 가능성
        </div>
        <div className="cb-warmcool__pct" style={{ color: '#C46A2B' }}>
          {Math.round(warmPercent)}%
        </div>
        <GradientBar colors={warmColors} marker={warmMarker} />
      </div>
      <div>
        <div className="cb-warmcool__label" style={{ color: 'var(--cb-iris-deep)' }}>
          쿨톤 가능성
        </div>
        <div className="cb-warmcool__pct" style={{ color: 'var(--cb-iris-deep)' }}>
          {Math.round(coolPercent)}%
        </div>
        <GradientBar colors={coolColors} marker={coolMarker} />
      </div>
    </div>
  );
}

/** 축 막대: 명도·채도·대비 등 0..100 + 양끝 라벨. compare가 있으면 두 번째 점(연예인 등) 표시 */
export function AxisBars({
  axes,
  color = 'var(--cb-ink)',
  compareColor = 'var(--cb-coral)',
}: {
  axes: { key: string; label: string; value: number; compare?: number; poles?: [string, string] }[];
  color?: string;
  compareColor?: string;
}) {
  return (
    <div className="cb-axis">
      {axes.map((a) => (
        <div key={a.key} className="cb-axis__row">
          <span className="cb-axis__label">{a.label}</span>
          <span className="cb-axis__track" role="img" aria-label={`${a.label} ${Math.round(a.value)}${a.compare !== undefined ? `, 비교 ${Math.round(a.compare)}` : ''}`}>
            {a.compare === undefined ? <span className="cb-axis__fill" style={{ width: `${a.value}%`, background: color }} /> : null}
            <span className="cb-axis__dot" style={{ left: `${a.value}%`, background: color }} />
            {a.compare !== undefined ? <span className="cb-axis__dot" style={{ left: `${a.compare}%`, background: compareColor }} /> : null}
          </span>
          {a.poles ? (
            <span className="cb-axis__poles">
              <span>{a.poles[0]}</span>
              <span>{a.poles[1]}</span>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** 레이더 차트 (축 3개 이상, 값 0..100). 갭 시각화/특징 축 차트 */
export function RadarChart({
  axes,
  series,
  size = 260,
}: {
  axes: string[];
  series: { label: string; values: number[]; color: string }[];
  size?: number;
}) {
  const n = axes.length;
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2 - 36;
  const pt = (i: number, v: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + Math.cos(ang) * R * (v / 100), cy + Math.sin(ang) * R * (v / 100)] as const;
  };
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`레이더 차트: ${series.map((s) => s.label).join(', ')}`}>
        {[25, 50, 75, 100].map((lv) => (
          <polygon key={lv} points={axes.map((_, i) => pt(i, lv).join(',')).join(' ')} fill="none" stroke="var(--cb-line)" />
        ))}
        {axes.map((a, i) => {
          const [x, y] = pt(i, 100);
          const [lx, ly] = pt(i, 122);
          return (
            <g key={a}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--cb-line)" />
              <text x={lx} y={ly} fontSize="11" textAnchor="middle" dominantBaseline="middle" fill="var(--cb-text-2)">
                {a}
              </text>
            </g>
          );
        })}
        {series.map((s) => (
          <polygon key={s.label} points={s.values.map((v, i) => pt(i, v).join(',')).join(' ')} fill={s.color} fillOpacity="0.16" stroke={s.color} strokeWidth="2" />
        ))}
      </svg>
      <div className="cb-legend" style={{ justifyContent: 'center' }}>
        {series.map((s) => (
          <span key={s.label}>
            <span className="cb-legend__dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 나란히 비교 바 (나 vs 연예인) */
export function CompareBars({
  rows,
  aLabel = '나',
  bLabel = '추구미',
  aColor = 'var(--cb-ink)',
  bColor = 'var(--cb-coral)',
}: {
  rows: { key: string; label: string; a: number; b: number; comment?: ReactNode }[];
  aLabel?: string;
  bLabel?: string;
  aColor?: string;
  bColor?: string;
}) {
  return (
    <div className="cb-stack-sm">
      <div className="cb-legend">
        <span>
          <span className="cb-legend__dot" style={{ background: aColor }} />
          {aLabel}
        </span>
        <span>
          <span className="cb-legend__dot" style={{ background: bColor }} />
          {bLabel}
        </span>
      </div>
      {rows.map((r) => (
        <div key={r.key}>
          <div className="cb-row" style={{ justifyContent: 'space-between' }}>
            <span className="cb-axis__label">{r.label}</span>
            <span className="cb-caption cb-muted">
              {Math.round(r.a)} → {Math.round(r.b)}
            </span>
          </div>
          <div style={{ display: 'grid', gap: 3, marginTop: 4 }}>
            <span className="cb-axis__track">
              <span className="cb-axis__fill" style={{ width: `${r.a}%`, background: aColor }} />
            </span>
            <span className="cb-axis__track">
              <span className="cb-axis__fill" style={{ width: `${r.b}%`, background: bColor }} />
            </span>
          </div>
          {r.comment ? <div className="cb-caption cb-muted" style={{ marginTop: 4 }}>{r.comment}</div> : null}
        </div>
      ))}
    </div>
  );
}
