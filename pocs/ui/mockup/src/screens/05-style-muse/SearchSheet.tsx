'use client';

import { useState } from 'react';
import { BottomSheet, Button, Icon, Photo } from '@/ui';
import s from './search.module.css';

/**
 * 추구미 검색 시트 (목업). 이름으로 찾거나 사진을 올려 찾는다.
 * 목업 데이터에는 인물이 한 명뿐이라 이름이 맞으면 그 사람만 보여 준다.
 * 스크림·Esc·바깥 누르기 닫기는 공용 BottomSheet가 맡는다.
 */
export function SearchSheet({
  open,
  name,
  photo,
  photoCount,
  onClose,
  onPick,
  onUpload,
}: {
  open: boolean;
  name: string;
  photo: string;
  photoCount: number;
  onClose: () => void;
  onPick: () => void;
  onUpload: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim();
  const hit = !q || name.includes(q);

  return (
    <BottomSheet open={open} onClose={onClose} labelledBy="muse-search-title" className={s.panel} initialFocus={(p) => p.querySelector('input')}>
        <div className={s.head}>
          <h2 id="muse-search-title">추구미 찾기</h2>
          <button type="button" className={s.close} aria-label="닫기" onClick={onClose}>
            <Icon name="x" size={22} />
          </button>
        </div>

        <label className={s.field}>
          <Icon name="search" size={20} />
          <input type="text" enterKeyHint="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="연예인 이름" aria-label="연예인 이름" />
        </label>

        <p className={s.label}>{q ? '검색 결과' : '최근 찾은 사람'}</p>
        {hit ? (
          <button type="button" className={s.result} onClick={onPick}>
            <Photo src={photo} alt="" position="50% 20%" />
            <span>
              {name}
              <small>사진 {photoCount}장</small>
            </span>
            <Icon name="chev" size={20} stroke={1.8} className={s.chev} />
          </button>
        ) : (
          <p className={s.empty}>‘{q}’ 검색 결과가 없어요. 사진으로 찾아 보세요.</p>
        )}

        <div className={s.actions}>
          <Button
            variant="line"
            onClick={onUpload}
            label={
              <>
                <Icon name="upload" size={20} />
                사진으로 찾기
              </>
            }
          />
        </div>
    </BottomSheet>
  );
}
