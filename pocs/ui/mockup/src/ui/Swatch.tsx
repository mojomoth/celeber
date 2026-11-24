import type { CSSProperties } from 'react';
import s from './ui.module.css';

/**
 * 원형 색 견본 (ColorMo). color는 CSS background 값이라 그라디언트도 된다.
 * size: 지름 px (기본 44). selected: 흰 링 + 잉크 링. label: 아래에 11.5 글자.
 * labelTone: 'ink'(기본, 9 간격 500 ink-2) | 'muted'(6 간격 400 회색, 03 피부색 견본).
 */
export function Swatch({ color, size = 44, selected = false, label, labelTone = 'ink', className, style }: { color: string; size?: number; selected?: boolean; label?: string; labelTone?: 'ink' | 'muted'; className?: string; style?: CSSProperties }) {
  const dot = <i className={[s.sw, selected ? s.swSel : ''].join(' ')} style={{ width: size, height: size, background: color }} aria-hidden={label ? true : undefined} />;
  if (!label) return dot;
  return (
    <span className={[s.swLabeled, labelTone === 'muted' ? s.swLabelMuted : '', className].filter(Boolean).join(' ')} style={style}>
      {dot}
      {label}
    </span>
  );
}

/**
 * 작은 색 점 묶음 (행 오른쪽, 06 카드). size 기본 18.
 * overlap: 점을 겹치고 배경색 링(ring, 기본 --paper)을 두른다 (06 내 퍼스널컬러 카드).
 */
export function SwatchDots({ colors, size = 18, overlap = false, ring, className }: { colors: string[]; size?: number; overlap?: boolean; ring?: string; className?: string }) {
  return (
    <span className={[s.dots, overlap ? s.dotsOverlap : '', className].filter(Boolean).join(' ')} style={ring ? ({ '--dots-ring': ring } as CSSProperties) : undefined} aria-hidden>
      {colors.map((c, i) => (
        <i key={i} className={`${s.sw} ${s.dotSmall}`} style={{ width: size, height: size, background: c }} />
      ))}
    </span>
  );
}
