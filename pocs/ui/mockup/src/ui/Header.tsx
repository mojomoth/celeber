import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import s from './ui.module.css';

/**
 * 헤더: 빈칸 · 제목 · 아이콘 1개 (탭 루트 화면). 뒤로 가기·로고·구분선은 두지 않는다.
 * left/right에는 IconButton이나 짧은 글자(02의 '2/4')를 넣는다. tone='dark'는 흰 글자·제목 17px.
 */
export function Header({ title, left, right, tone = 'light', className }: { title: ReactNode; left?: ReactNode; right?: ReactNode; tone?: 'light' | 'dark'; className?: string }) {
  return (
    <header className={[s.header, tone === 'dark' ? s.headerDark : '', className].filter(Boolean).join(' ')}>
      <div className={s.headerSide}>{left}</div>
      <h1 className={s.headerTitle}>{title}</h1>
      <div className={`${s.headerSide} ${s.headerSideEnd}`}>{right}</div>
    </header>
  );
}

/** 44×44 아이콘 버튼. href가 있으면 링크, 아니면 button. label은 스크린 리더용 이름. */
export function IconButton({ icon, label, href, onClick, className }: { icon: IconName; label: string; href?: string; onClick?: () => void; className?: string }) {
  const cls = [s.iconBtn, className].filter(Boolean).join(' ');
  if (href) {
    return (
      <Link href={href} className={cls} aria-label={label}>
        <Icon name={icon} />
      </Link>
    );
  }
  return (
    <button type="button" className={cls} aria-label={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}
