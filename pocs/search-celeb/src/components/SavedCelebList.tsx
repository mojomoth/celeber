'use client';
/** 저장한 인물 / 최근 찾은 인물 목록 + 삭제(확인 단계) */
import { useState } from 'react';
import { ConfirmDialog, EmptyState, Icon } from '@celeber/ui';
import { withBase } from '../lib/api';
import type { CelebSummary } from '../lib/types';
import { CelebAvatar } from './CelebAvatar';
import s from './search-celeb.module.css';

export interface SavedCelebListProps {
  items: CelebSummary[];
  apiBase?: string;
  onOpen: (celebId: string) => void;
  /** 없으면 삭제 버튼을 숨긴다 */
  onDelete?: (celebId: string) => Promise<void> | void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function SavedCelebList({ items, apiBase = '', onOpen, onDelete, emptyTitle = '저장한 인물이 없습니다', emptyDescription = '인물을 찾은 뒤 저장하면 여기에 모입니다.' }: SavedCelebListProps) {
  const [target, setTarget] = useState<CelebSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  if (!items.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <>
      <ul className={s.rows}>
        {items.map(({ celeb, imageCount, selectedCount }) => (
          <li key={celeb.id} className={s.row}>
            <button type="button" className={s.rowMain} onClick={() => onOpen(celeb.id)}>
              <CelebAvatar src={withBase(apiBase, celeb.thumbnail?.url)} name={celeb.name} size={48} />
              <span className={s.rowText}>
                <span className={s.name} style={{ display: 'block' }}>
                  {celeb.name}
                </span>
                <span className={s.sub} style={{ display: 'block' }}>
                  {[celeb.description, `사진 ${imageCount}장`, selectedCount ? `선택 ${selectedCount}장` : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <Icon name="chevron-right" size={18} style={{ color: 'var(--cb-text-2)' }} />
            </button>
            {celeb.thumbnailSourceUrl ? (
              <a className={s.source} href={celeb.thumbnailSourceUrl} target="_blank" rel="noopener noreferrer nofollow" aria-label={`${celeb.name} 사진 출처`}>사진 출처</a>
            ) : null}
            {onDelete ? (
              <button type="button" className="cb-icon-btn" aria-label={`${celeb.name} 삭제`} onClick={() => setTarget({ celeb, imageCount, selectedCount })}>
                <Icon name="trash" size={18} />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!target}
        danger
        title={`${target?.celeb.name ?? ''} 기록을 지울까요?`}
        description="아래 정보가 이 앱의 기록에서 지워집니다. 다시 검색하면 새로 모을 수 있습니다."
        items={target ? ['인물 정보와 저장 표시', `수집한 사진 기록 ${target.imageCount}장${target.selectedCount ? ` (선택 ${target.selectedCount}장 포함)` : ''}`] : []}
        confirmLabel="지우기"
        loading={deleting}
        onCancel={() => setTarget(null)}
        onConfirm={async () => {
          if (!target || !onDelete) return;
          setDeleting(true);
          try {
            await onDelete(target.celeb.id);
          } finally {
            setDeleting(false);
            setTarget(null);
          }
        }}
      />
    </>
  );
}
