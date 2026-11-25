'use client';
/**
 * 인물 후보 목록 (사진 + 이름 + 설명 + 근거 + 선택 버튼).
 * 후보는 이름 검색/역이미지 검색 텍스트/사진 속 글자에서 온 것이며, 얼굴 유사도가 아니다.
 */
import clsx from 'clsx';
import { Button } from '@celeber/ui';
import { withBase } from '../lib/api';
import { candidateKey } from '../lib/names';
import type { CandidateItem } from '../lib/types';
import { CelebAvatar } from './CelebAvatar';
import s from './search-celeb.module.css';

const SOURCE_LABEL: Record<CandidateItem['source'], string> = {
  'name-search': '이름 검색',
  'reverse-image': '역이미지 검색',
  'photo-text': '사진 속 글자',
  mock: '데모',
};

export interface CandidateListProps {
  items: CandidateItem[];
  apiBase?: string;
  onSelect: (item: CandidateItem) => void;
  /** 선택 중인 후보 키 (candidateKey: 이름+설명. 동명이인을 구분해 버튼 로딩) */
  busyKey?: string | null;
  /** 근거(evidence) 표시 */
  showEvidence?: boolean;
  selectLabel?: string;
}

export function CandidateList({ items, apiBase = '', onSelect, busyKey, showEvidence = true, selectLabel = '선택' }: CandidateListProps) {
  return (
    <ul className={s.rows}>
      {items.map((c) => {
        const key = candidateKey(c);
        const label = c.description ? `${c.name}(${c.description})` : c.name;
        return (
        <li key={key} className={s.row}>
          <button type="button" className={s.rowMain} onClick={() => onSelect(c)} disabled={!!busyKey}>
            <CelebAvatar src={withBase(apiBase, c.thumbnailUrl)} name={c.name} />
            <span className={s.rowText}>
              <span className={s.name} style={{ display: 'block' }}>
                {c.name}
                {c.nameEn && c.nameEn !== c.name ? <span style={{ fontWeight: 500, color: 'var(--cb-text-2)' }}> {c.nameEn}</span> : null}
              </span>
              <span className={s.sub} style={{ display: 'block' }}>
                <span className={clsx(s.tag, c.saved && s.tagIris)}>{c.saved ? '저장됨' : SOURCE_LABEL[c.source]}</span>
                {c.description ?? ''}
              </span>
              {showEvidence && c.evidence.length ? <span className={s.evidence} style={{ display: 'block' }}>{c.evidence.slice(0, 2).join(' · ')}</span> : null}
            </span>
          </button>
          {c.thumbnailSourceUrl ? (
            <a className={s.source} href={c.thumbnailSourceUrl} target="_blank" rel="noopener noreferrer nofollow" aria-label={`${c.name} 사진 출처`}>사진 출처</a>
          ) : null}
          <Button size="sm" variant={c.celebId ? 'secondary' : 'primary'} onClick={() => onSelect(c)} loading={busyKey === key} disabled={!!busyKey && busyKey !== key} aria-label={`${label} ${selectLabel}`}>
            {c.celebId ? '열기' : selectLabel}
          </Button>
        </li>
        );
      })}
    </ul>
  );
}
