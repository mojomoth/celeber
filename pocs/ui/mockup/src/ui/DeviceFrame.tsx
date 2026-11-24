'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * 데스크톱(>500px): mockup-iphone.png 프레임 안 화면 구멍에 앱을 넣고 그 안에서 스크롤한다.
 * 모바일: 래퍼가 아무 제약도 걸지 않아 문서가 그대로 스크롤된다. 배치 규칙은 src/ui/base.css.
 * 프레임 안 스크롤은 Next가 초기화하지 않으므로 경로가 바뀔 때 맨 위로 올린다.
 */
export function DeviceFrame({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="device">
      <div className="device__screen">
        <div ref={scroller} className="device__scroll" id="app-scroll">
          {children}
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="device__bezel" src="/frame/mockup-iphone.png" alt="" aria-hidden />
    </div>
  );
}
