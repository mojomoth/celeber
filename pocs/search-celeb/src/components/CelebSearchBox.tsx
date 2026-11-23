'use client';
/**
 * 이름 검색 입력 + 자동완성 + 사진으로 찾기 버튼.
 * 자동완성은 /api/celeb/suggest (DB의 확정 인물, 키 없을 때 데모 인물)를 250ms 디바운스로 호출한다.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Button, FileButton, Icon } from '@celeber/ui';
import { createCelebApi, withBase } from '../lib/api';
import type { CandidateItem } from '../lib/types';
import { CelebAvatar } from './CelebAvatar';
import s from './search-celeb.module.css';
import { suggestKeyDown } from './suggest-keys';

export interface CelebSearchBoxProps {
  apiBase?: string;
  /** 검색 실행 (Enter/검색 버튼) */
  onSearch: (query: string) => void;
  /** 자동완성 항목 선택 (celebId가 있으면 바로 열기) */
  onPickSuggestion?: (item: CandidateItem) => void;
  /** 사진으로 찾기 */
  onPhoto?: (file: File) => void;
  busy?: boolean;
  initialQuery?: string;
  placeholder?: string;
}

export function CelebSearchBox({ apiBase = '', onSearch, onPickSuggestion, onPhoto, busy, initialQuery = '', placeholder = '연예인 이름 (예: 배우 이름, 그룹 멤버)' }: CelebSearchBoxProps) {
  const [q, setQ] = useState(initialQuery);
  const [items, setItems] = useState<CandidateItem[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const apiRef = useRef(createCelebApi(apiBase));
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiRef.current = createCelebApi(apiBase);
  }, [apiBase]);

  useEffect(() => {
    const query = q.trim();
    if (!query) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      apiRef.current
        .suggest(query, ctl.signal)
        .then((r) => {
          setItems(r.items);
          setActive(-1);
        })
        .catch(() => {
          /* 자동완성 실패는 무시 */
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const submit = (query = q) => {
    const v = query.trim();
    if (!v || busy) return;
    setOpen(false);
    onSearch(v);
  };

  const pick = (it: CandidateItem) => {
    setOpen(false);
    setQ(it.name);
    if (onPickSuggestion) onPickSuggestion(it);
    else submit(it.name);
  };

  const showList = open && q.trim().length > 0 && items.length > 0;

  return (
    <div>
      <form
        role="search"
        className={s.field}
        onSubmit={(e) => {
          e.preventDefault();
          if (showList && active >= 0 && items[active]) pick(items[active]);
          else submit();
        }}
      >
        <div className={s.inputWrap}>
          <Icon name="search" size={20} />
          <input
            className={s.input}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="연예인 이름 검색"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded={showList}
            role="combobox"
            placeholder={placeholder}
            value={q}
            maxLength={60}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={(e) => suggestKeyDown(e, showList, items.length, setActive, () => setOpen(false))}
          />
          {q ? (
            <button
              type="button"
              className={s.clear}
              aria-label="지우기"
              onClick={() => {
                setQ('');
                setItems([]);
              }}
            >
              <Icon name="close" size={16} />
            </button>
          ) : null}
        </div>
        {showList ? (
          <ul className={s.suggest} id={listId} role="listbox" aria-label="이름 자동완성">
            {items.map((it, i) => (
              <li key={`${it.name}-${i}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={s.suggestItem}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (blurTimer.current) clearTimeout(blurTimer.current);
                    pick(it);
                  }}
                >
                  <CelebAvatar src={withBase(apiBase, it.thumbnailUrl)} name={it.name} size={36} />
                  <span className={s.rowText}>
                    <span className={s.name} style={{ display: 'block', fontSize: 14 }}>
                      {it.name}
                    </span>
                    <span className={s.sub} style={{ display: 'block', fontSize: 12 }}>
                      {it.saved ? '저장한 인물' : it.celebId ? '찾아본 인물' : it.description ?? ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className={s.actions}>
          <Button type="submit" variant="primary" icon="search" loading={busy} disabled={!q.trim()}>
            이름으로 찾기
          </Button>
          {onPhoto ? (
            <FileButton onFile={onPhoto} accept="image/jpeg,image/png,image/webp" variant="secondary">
              사진으로 찾기
            </FileButton>
          ) : null}
        </div>
      </form>
    </div>
  );
}
