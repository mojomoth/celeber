import type { CSSProperties, ReactNode } from 'react';
import s from './ui.module.css';

/**
 * 사진 위로 올라오는 시트 (04 추천 의상색, 05 인물 시트). 반경 24.
 * - bg: 'paper'(#F6F4F0) | 'white'
 * - overlap: 위 요소와 겹치는 높이 px (04: 28, 05: 24)
 * - corners: 'all' | 'top' (05는 위 모서리만 둥글다)
 * 안쪽 여백은 화면이 className/style로 정한다.
 */
export function Sheet({ children, bg = 'paper', overlap = 0, corners = 'all', className, style }: { children: ReactNode; bg?: 'paper' | 'white'; overlap?: number; corners?: 'all' | 'top'; className?: string; style?: CSSProperties }) {
  return (
    <section
      className={[s.sheet, corners === 'top' ? s.sheetTop : '', className].filter(Boolean).join(' ')}
      style={{ marginTop: overlap ? -overlap : undefined, background: bg === 'paper' ? 'var(--paper)' : 'var(--bg)', ...style }}
    >
      {children}
    </section>
  );
}

/** 종이색 둥근 카드 (반경 16): 03 피부색, 05 팔레트 비교, 06 내 퍼스널컬러. 여백은 화면이 정한다. */
export function Card({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={[s.card, className].filter(Boolean).join(' ')} style={style}>
      {children}
    </div>
  );
}

/** 섹션 제목 21/700. 아래 여백은 화면이 정한다. */
export function SectionTitle({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <h2 className={['t-h2', className].filter(Boolean).join(' ')} style={style}>
      {children}
    </h2>
  );
}
