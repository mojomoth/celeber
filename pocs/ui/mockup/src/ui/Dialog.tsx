'use client';

import { useId, type ReactNode } from 'react';
import { BottomSheet } from './BottomSheet';
import { ButtonPair } from './Button';
import s from './ui.module.css';

/**
 * 확인 다이얼로그 (하단 시트형). 시안에 없는 상태라 v4 요소(시트 반경 24 + 버튼 페어)로 만든다.
 * danger: 확인 버튼을 위험색으로 (06 분석 정보 초기화). Esc·바깥 누르기로 닫힌다.
 */
export function Dialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = '취소',
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      className={s.dialog}
      // 되돌릴 수 없는 동작이 많으므로 취소 버튼(마지막)에 초점을 둔다
      initialFocus={(p) => {
        const buttons = p.querySelectorAll<HTMLElement>('button');
        return buttons[buttons.length - 1];
      }}
    >
      <h2 id={titleId} className={s.dialogTitle}>
        {title}
      </h2>
      {children ? <div className={`${s.dialogBody} t-body`}>{children}</div> : null}
      <ButtonPair danger={danger} primary={{ label: confirmLabel, onClick: onConfirm }} secondary={{ label: cancelLabel, onClick: onClose }} />
    </BottomSheet>
  );
}
