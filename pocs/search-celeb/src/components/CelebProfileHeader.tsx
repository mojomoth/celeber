'use client';
/** 확정한 인물 헤더: 사진 + 이름 + 설명 + 저장 토글 */
import { Button, MockBadge } from '@celeber/ui';
import type { CelebProfile } from '@celeber/core/contracts';
import { withBase } from '../lib/api';
import { CelebAvatar } from './CelebAvatar';
import s from './search-celeb.module.css';

export function CelebProfileHeader({ celeb, apiBase = '', onToggleSave, saving }: { celeb: CelebProfile; apiBase?: string; onToggleSave?: () => void; saving?: boolean }) {
  return (
    <div className={s.profile}>
      <CelebAvatar src={withBase(apiBase, celeb.thumbnail?.url)} name={celeb.name} size={72} />
      <div className={s.rowText}>
        <div className={s.profileName}>{celeb.name}</div>
        <div className={s.sub}>{[celeb.nameEn, celeb.description].filter(Boolean).join(' · ') || '인물 정보'}</div>
        {celeb.thumbnailSourceUrl ? (
          <a className={s.source} href={celeb.thumbnailSourceUrl} target="_blank" rel="noopener noreferrer nofollow">사진 출처</a>
        ) : null}
        {celeb.isMock || celeb.thumbnailProvider === 'mock' ? (
          <div style={{ marginTop: 4 }}>
            <MockBadge label={celeb.isMock ? '데모 인물' : '데모 사진'} />
          </div>
        ) : null}
      </div>
      {onToggleSave ? (
        <Button size="sm" variant={celeb.saved ? 'secondary' : 'primary'} icon={celeb.saved ? 'check' : undefined} onClick={onToggleSave} loading={saving} aria-pressed={celeb.saved}>
          {celeb.saved ? '저장됨' : '저장'}
        </Button>
      ) : null}
    </div>
  );
}
