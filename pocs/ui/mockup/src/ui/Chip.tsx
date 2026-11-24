import { Fragment } from 'react';
import s from './ui.module.css';

/**
 * 상태 칩 (02 조명 상태). items를 세로 구분선으로 잇는다. dot: 맨 앞 6px 상태 점 색.
 * tone='dark'는 카메라 화면용 반투명 흰 바탕, 'light'는 종이색 바탕.
 */
export function Chip({ items, dot, tone = 'dark', className }: { items: string[]; dot?: string; tone?: 'dark' | 'light'; className?: string }) {
  return (
    <span className={[s.chip, tone === 'dark' ? s.chipDark : s.chipLight, className].filter(Boolean).join(' ')}>
      {dot ? <span className={s.chipDot} style={{ background: dot }} aria-hidden /> : null}
      {items.map((t, i) => (
        <Fragment key={t}>
          {i > 0 ? <span className={s.chipSep} aria-hidden /> : null}
          {t}
        </Fragment>
      ))}
    </span>
  );
}

/** 아웃라인 태그 묶음 (04 첫인상 키워드): 높이 30, 1px 선, 간격 6 */
export function Tags({ items, className }: { items: string[]; className?: string }) {
  return (
    <div className={[s.tags, className].filter(Boolean).join(' ')}>
      {items.map((t) => (
        <span key={t} className={s.tag}>
          {t}
        </span>
      ))}
    </div>
  );
}
