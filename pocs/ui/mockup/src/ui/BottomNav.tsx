import Link from 'next/link';
import { NAV_TABS, type NavKey } from '@/lib/routes';
import { Icon } from './Icon';
import s from './ui.module.css';

/** H&M식 플로팅 pill 내비 4칸. Screen에 nav를 주면 자동으로 붙으므로 화면에서 직접 쓸 일은 없다. */
export function BottomNav({ active }: { active: NavKey }) {
  return (
    <div className={s.navWrap}>
      <nav className={s.nav} aria-label="주 메뉴">
        {NAV_TABS.map((t) => {
          const on = t.key === active;
          return (
            <Link key={t.key} href={t.href} className={[s.tab, on ? s.tabOn : ''].join(' ')} aria-current={on ? 'page' : undefined}>
              <Icon name={t.icon} size={22} stroke={1.6} />
              <span className={s.tabLabel}>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
