import type { CSSProperties, ReactNode } from 'react';
import type { NavKey } from '@/lib/routes';
import { BottomNav } from './BottomNav';
import s from './ui.module.css';

type Tone = 'light' | 'dark';

/**
 * 화면 루트. 모든 화면은 이것으로 감싼다.
 * - tone: 'light' 흰 바탕·잉크 글자, 'dark' 카메라 바탕(#0B0A0D)·흰 글자 (상태 표시줄·홈 인디케이터 색도 따라간다)
 * - nav: 하단 내비 활성 탭. 주면 내비와 끝 여백(시안 pad-nav 132)을 함께 둔다. 없으면 내비 없음
 * - immersive: 상태 표시줄 자리(--safe-top)를 비우지 않고 내용이 화면 맨 위부터 깔린다 (01 랜딩)
 */
export function Screen({
  children,
  tone = 'light',
  nav,
  immersive = false,
  className,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  nav?: NavKey;
  immersive?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <main className={[s.screen, tone === 'dark' ? s.screenDark : '', className].filter(Boolean).join(' ')} style={style}>
      <StatusBar tone={immersive ? 'dark' : tone} transparent={immersive || tone === 'dark'} />
      {immersive ? null : <div className={s.safeTop} aria-hidden />}
      {children}
      {nav ? (
        <>
          <div className={s.navPad} aria-hidden />
          <BottomNav active={nav} />
        </>
      ) : null}
      <div className={[s.homeInd, tone === 'dark' || immersive ? s.homeIndDark : ''].join(' ')} aria-hidden />
    </main>
  );
}

// 9:41 표시줄은 데스크톱 프레임과 ?chrome=sim 에서만 보인다. 실기기에서는 OS 표시줄 뒤 배경만 칠한다.
function StatusBar({ tone, transparent }: { tone: Tone; transparent: boolean }) {
  return (
    <div className={[s.status, tone === 'dark' ? s.statusDark : '', transparent ? '' : s.statusLight].join(' ')} aria-hidden>
      <div className={s.statusInner}>
        <span>9:41</span>
        <span className={s.statusSys}>
          <svg width="19" height="12" viewBox="0 0 19 12">
            <rect x="0" y="8" width="3.2" height="4" rx="1" />
            <rect x="5" y="5.5" width="3.2" height="6.5" rx="1" />
            <rect x="10" y="3" width="3.2" height="9" rx="1" />
            <rect x="15" y="0" width="3.2" height="12" rx="1" />
          </svg>
          <svg width="17" height="12" viewBox="0 0 17 12">
            <path d="M8.5 2.3c2.4 0 4.6.9 6.2 2.5l1.2-1.2A10.4 10.4 0 008.5.6 10.4 10.4 0 001.1 3.6l1.2 1.2A8.7 8.7 0 018.5 2.3zm0 3.4c1.5 0 2.8.6 3.8 1.5l1.2-1.2A7 7 0 008.5 4a7 7 0 00-5 2l1.2 1.2c1-.9 2.3-1.5 3.8-1.5zm0 3.4c.6 0 1.1.2 1.5.6L8.5 11.2 7 9.7c.4-.4.9-.6 1.5-.6z" />
          </svg>
          <svg width="27" height="13" viewBox="0 0 27 13">
            <rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4" />
            <rect x="2" y="2" width="20" height="9" rx="2.2" />
            <path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" opacity=".45" />
          </svg>
        </span>
      </div>
    </div>
  );
}
