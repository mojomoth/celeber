import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './Icon';
import s from './ui.module.css';

/** 행 묶음: 위 1px 선. 안에 Row를 넣는다. */
export function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[s.rows, className].filter(Boolean).join(' ')}>{children}</div>;
}

/**
 * 키-값 행 (03 관찰한 특징, 04 스타일 가이드, 05 스타일링 포인트): 키 92px · 값 · 오른쪽(색 점 등).
 * - sub: 값 아래 13px 회색 보조문
 * - avoid: 키를 위험색으로 (04 피할 스타일)
 * - alignTop: 여러 줄 값일 때 위 정렬 (05)
 */
export function Row({ k, v, sub, right, avoid = false, alignTop = false }: { k: ReactNode; v: ReactNode; sub?: ReactNode; right?: ReactNode; avoid?: boolean; alignTop?: boolean }) {
  return (
    <div className={[s.row, avoid ? s.rowAvoid : '', alignTop ? s.rowTop : ''].join(' ')}>
      <span className={s.rowK}>{k}</span>
      <span className={s.rowV}>
        {v}
        {sub ? <small>{sub}</small> : null}
      </span>
      <span>{right}</span>
    </div>
  );
}

/** 이동 행 (06 다시 보기·초기화): 제목 15/500 + 보조문 + 오른쪽 셰브론. href 또는 onClick. danger는 위험색 제목. */
export function ListRow({ title, sub, href, onClick, danger = false }: { title: ReactNode; sub?: ReactNode; href?: string; onClick?: () => void; danger?: boolean }) {
  const cls = [s.listRow, danger ? s.listDanger : ''].join(' ');
  const body = (
    <>
      <span className={s.listTitle}>
        {title}
        {sub ? <small>{sub}</small> : null}
      </span>
      <Icon name="chev" size={20} stroke={1.8} className={s.chev} />
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  );
}
