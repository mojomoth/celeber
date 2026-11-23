'use client';
/**
 * 대표·최근·평소 3개 탭 전신 사진 그리드.
 * 같은 비율(3:4) 썸네일, 출처 링크, 선택 표시(테두리+체크), 분석 불가 사유 표시.
 * 이미지는 모두 서버 캐시(/api/uploads/<id>)로 표시한다 (외부 핫링크 없음).
 */
import { useState } from 'react';
import type { CelebImage, CelebImageCategory } from '@celeber/core/contracts';
import { AnalyzingOverlay, EmptyState, Icon, ImagePickerGrid, MockBadge, Notice, Tabs, type PickerItem } from '@celeber/ui';
import { withBase } from '../lib/api';
import { shortReason, sourceLabel, visibleImages } from '../lib/filter';
import { CATEGORY_HINT, CATEGORY_LABEL, CATEGORY_ORDER } from '../lib/queries';
import s from './search-celeb.module.css';

export interface CelebGalleryProps {
  images: Record<CelebImageCategory, CelebImage[]>;
  category: CelebImageCategory;
  onCategoryChange: (c: CelebImageCategory) => void;
  selectedIds: string[];
  onToggle: (image: CelebImage) => void;
  apiBase?: string;
  /** 카테고리별 수집 중 */
  loading?: Partial<Record<CelebImageCategory, boolean>>;
  /** 다시 검색 (선택하지 않은 사진 교체) */
  onRefresh?: (c: CelebImageCategory) => void;
  /** 카테고리별 안내 (수집 결과 notices) */
  notices?: Partial<Record<CelebImageCategory, string[]>>;
  columns?: number;
}

export function CelebGallery({ images, category, onCategoryChange, selectedIds, onToggle, apiBase = '', loading = {}, onRefresh, notices = {}, columns = 3 }: CelebGalleryProps) {
  const [fullBodyOnly, setFullBodyOnly] = useState(true);
  const all = images[category] ?? [];
  const list = visibleImages(all, fullBodyOnly);
  const hidden = all.length - list.length;
  const busy = !!loading[category];
  const isMock = all.some((i) => i.isMock);

  const items: PickerItem[] = list
    .filter((im) => im.cached)
    .map((im) => {
      const label = sourceLabel(im);
      const href = im.provider === 'mock' ? undefined : (im.pageUrl ?? im.sourceUrl);
      return {
        id: im.id,
        src: withBase(apiBase, im.cached?.url) as string,
        alt: im.sourceTitle ?? `${CATEGORY_LABEL[im.category]} 사진`,
        reason: shortReason(im),
        disabled: im.analyzable === false && !selectedIds.includes(im.id),
        caption: href ? (
          <a className={s.source} href={href} target="_blank" rel="noopener noreferrer nofollow" title={im.sourceTitle}>
            {label}
          </a>
        ) : (
          <span className={s.source}>{label}</span>
        ),
      };
    });
  const byId = new Map(all.map((im) => [im.id, im]));

  return (
    <div>
      <Tabs
        label="룩 종류"
        value={category}
        onChange={onCategoryChange}
        items={CATEGORY_ORDER.map((c) => ({ value: c, label: `${CATEGORY_LABEL[c]}${images[c]?.length ? ` ${visibleImages(images[c], fullBodyOnly).length}` : ''}` }))}
      />
      <div className={s.toolbar}>
        <span className="cb-caption cb-muted">{CATEGORY_HINT[category]}</span>
        {isMock ? <MockBadge /> : null}
      </div>
      <div className={s.toolbar} style={{ marginTop: 0 }}>
        <label className={s.toggle}>
          <input type="checkbox" checked={fullBodyOnly} onChange={(e) => setFullBodyOnly(e.target.checked)} />
          전신만 보기{hidden > 0 ? ` (${hidden}장 숨김)` : ''}
        </label>
        {onRefresh ? (
          <button type="button" className={s.linkBtn} onClick={() => onRefresh(category)} disabled={busy}>
            <Icon name="refresh" size={16} />
            다시 검색
          </button>
        ) : null}
      </div>
      {(notices[category] ?? []).map((n) => (
        <div key={n} style={{ marginBottom: 8 }}>
          <Notice>{n}</Notice>
        </div>
      ))}
      <div className={s.galleryArea}>
        {items.length ? (
          <ImagePickerGrid
            label={`${CATEGORY_LABEL[category]} 사진`}
            items={items}
            selectedIds={selectedIds}
            columns={columns}
            aspect="3 / 4"
            onToggle={(id) => {
              const im = byId.get(id);
              if (im) onToggle(im);
            }}
          />
        ) : busy ? (
          <div className={s.skeleton} aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} />
            ))}
          </div>
        ) : (
          <EmptyState title="표시할 사진이 없습니다" description={hidden ? '전신만 보기를 끄면 다른 사진도 볼 수 있습니다.' : '다시 검색하거나 다른 탭을 확인해 주세요.'} />
        )}
        {busy ? <AnalyzingOverlay message="전신 사진을 모으는 중" sub="검색 → 서버 저장 → 전신 여부 확인" /> : null}
      </div>
    </div>
  );
}
