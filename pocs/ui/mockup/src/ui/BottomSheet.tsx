'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import s from './ui.module.css';

/**
 * 화면 아래에서 올라오는 모달 시트 (스크림 + 위 모서리 반경 24). Esc·바깥 누르기로 닫힌다.
 * 네이티브 <dialog>는 최상위 레이어에 떠서 데스크톱 목업 프레임 밖을 덮으므로 쓰지 않는다.
 * - 열린 동안 같은 부모 아래 나머지 요소는 inert, Tab은 시트 안에서만 돈다. 닫히면 연 요소로 초점을 돌린다.
 * - initialFocus: 열릴 때 초점을 줄 요소를 패널 안에서 고른다 (기본: 패널 자신)
 * - className: 패널 안쪽 여백 등. 아래 여백(안전 영역 + 20)은 공통으로 둔다.
 */
export function BottomSheet({
  open,
  onClose,
  labelledBy,
  initialFocus,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  initialFocus?: (panel: HTMLElement) => HTMLElement | null | undefined;
  className?: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  // 부모가 다시 그려져 onClose·initialFocus가 바뀌어도 초점을 다시 옮기지 않게 ref로 들고 있는다
  const latest = useRef({ onClose, initialFocus });
  useEffect(() => {
    latest.current = { onClose, initialFocus };
  });

  useEffect(() => {
    const el = panel.current;
    const scrim = el?.parentElement;
    if (!open || !el || !scrim) return;
    // 모달인 동안 같은 화면의 나머지(헤더·본문·하단 내비)를 inert로 막고, 닫히면 연 버튼으로 초점을 돌린다
    const opener = document.activeElement as HTMLElement | null;
    const background = [...(scrim.parentElement?.children ?? [])].filter((n): n is HTMLElement => n !== scrim && n instanceof HTMLElement && !n.hidden && !n.inert);
    background.forEach((n) => (n.inert = true));
    (latest.current.initialFocus?.(el) ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current.onClose();
      if (e.key !== 'Tab') return;
      // Tab이 시트 밖(브라우저 주소창 등)으로 빠지지 않게 처음과 끝을 잇는다
      const items = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      background.forEach((n) => (n.inert = false));
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={s.sheetScrim} onClick={onClose}>
      <div ref={panel} tabIndex={-1} className={[s.sheetPanel, className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
