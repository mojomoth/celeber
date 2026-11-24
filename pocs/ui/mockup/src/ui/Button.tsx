import Link from 'next/link';
import type { ReactNode } from 'react';
import s from './ui.module.css';

export type ButtonAction = {
  label: ReactNode;
  /** 링크 이동. 없으면 onClick을 쓰는 button */
  href?: string;
  onClick?: () => void;
};

/** Doji 버튼: 높이 46, 반경 8. fill=검정 채움, line=1px 아웃라인, danger=초기화 확인용 */
export function Button({ label, href, onClick, variant = 'fill', className }: ButtonAction & { variant?: 'fill' | 'line' | 'danger'; className?: string }) {
  const cls = [s.btn, variant === 'fill' ? s.btnFill : variant === 'line' ? s.btnLine : s.btnDanger, className].filter(Boolean).join(' ');
  if (href) {
    return (
      <Link href={href} className={cls}>
        {label}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {label}
    </button>
  );
}

/**
 * 버튼 페어: 왼쪽 검정 채움, 오른쪽 아웃라인, 간격 8, 좌우 20 여백, 위 32 여백(시안 .actions).
 * 화면마다 맨 아래(내비 위)에 한 번만 둔다.
 */
export function ButtonPair({ primary, secondary, className, danger = false }: { primary: ButtonAction; secondary: ButtonAction; className?: string; danger?: boolean }) {
  return (
    <div className={[s.btnRow, className].filter(Boolean).join(' ')}>
      <Button {...primary} variant={danger ? 'danger' : 'fill'} />
      <Button {...secondary} variant="line" />
    </div>
  );
}
