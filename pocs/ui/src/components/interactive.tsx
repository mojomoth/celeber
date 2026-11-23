'use client';
/**
 * 상호작용 컴포넌트: 이미지 선택 그리드, 확인 다이얼로그, 탭, 파일 선택 버튼.
 */
import clsx from 'clsx';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './basic';
import { Icon, type IconName } from './icons';

/* ------------------------------------------------------------------ ImagePickerGrid */

export interface PickerItem {
  id: string;
  src: string;
  alt: string;
  /** 썸네일 아래 캡션 (예: 출처, 이름) */
  caption?: ReactNode;
  /** 선택 불가 (분석 불가 등) */
  disabled?: boolean;
  /** 썸네일 위 짧은 사유 (예: '역광') */
  reason?: string;
}

/** 같은 비율 썸네일 그리드 + 선택 테두리 + 체크 (ColorMo 06 패턴) */
export function ImagePickerGrid({
  items,
  selectedIds,
  onToggle,
  columns = 3,
  aspect = '3 / 4',
  label,
}: {
  items: PickerItem[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  columns?: number;
  aspect?: string;
  /** 접근성 그룹 라벨 */
  label?: string;
}) {
  return (
    <div className="cb-picker" role="group" aria-label={label} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {items.map((it) => {
        const sel = selectedIds.includes(it.id);
        return (
          <div key={it.id}>
            <button
              type="button"
              className={clsx('cb-picker__item', sel && 'cb-picker__item--selected')}
              style={{ aspectRatio: aspect }}
              onClick={() => onToggle(it.id)}
              disabled={it.disabled}
              aria-pressed={sel}
              aria-label={`${it.alt}${it.reason ? ` (${it.reason})` : ''}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.src} alt="" loading="lazy" />
              <span className="cb-picker__check">{sel ? <Icon name="check" size={14} strokeWidth={2.6} /> : null}</span>
              {it.reason ? <span className="cb-picker__reason">{it.reason}</span> : null}
            </button>
            {it.caption ? <div className="cb-picker__caption">{it.caption}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ ConfirmDialog */

/** 실행 전 확인 (초기화 등). items로 지워지는 사진/진단 정보를 나열 */
export function ConfirmDialog({
  open,
  title,
  description,
  items,
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  items?: ReactNode[];
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  const variant: ButtonVariant = danger ? 'danger' : 'primary';
  return (
    <div className="cb-dialog-backdrop" onClick={onCancel}>
      <div className="cb-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <h2 id={titleId} className="cb-dialog__title">
          {title}
        </h2>
        {description ? <p className="cb-body cb-muted">{description}</p> : null}
        {items?.length ? (
          <ul className="cb-list" style={{ color: danger ? 'var(--cb-danger)' : undefined }}>
            {items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        ) : null}
        <div className="cb-dialog__actions">
          <button ref={cancelRef} type="button" className="cb-btn cb-btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */

export function Tabs<T extends string>({ items, value, onChange, label }: { items: { value: T; label: ReactNode; icon?: IconName }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="cb-tabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button key={it.value} type="button" role="tab" className="cb-tab" aria-selected={it.value === value} onClick={() => onChange(it.value)}>
          {it.icon ? <Icon name={it.icon} size={16} style={{ verticalAlign: -3, marginRight: 4 }} /> : null}
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ FileButton */

/** 파일 선택 버튼 (사진 업로드) */
export function FileButton({
  onFile,
  children = '사진 업로드',
  variant = 'secondary',
  accept = 'image/*',
  block,
  capture,
}: {
  onFile: (file: File) => void;
  children?: ReactNode;
  variant?: ButtonVariant;
  accept?: string;
  block?: boolean;
  /** 모바일에서 카메라 바로 열기 ('user' | 'environment') */
  capture?: 'user' | 'environment';
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant={variant} icon="upload" block={block} onClick={() => ref.current?.click()}>
        {children}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        className="cb-visually-hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}
