'use client';
/**
 * 사진 + 아이템 핫스팟(번호 점 + 선택 시 영역 테두리). 점을 누르면 onSelect.
 */
import type { OutfitItem } from '@celeber/core/contracts';
import { OUTFIT_CATEGORY_LABEL_KO } from '@celeber/core/contracts';

export function HotspotPhoto({
  src,
  alt,
  items,
  active,
  onSelect,
  label = '분석한 사진',
  aspect,
}: {
  src: string;
  alt: string;
  items: OutfitItem[];
  active: number | null;
  onSelect: (i: number | null) => void;
  label?: string;
  /** 'w / h' (원본 비율 유지 권장) */
  aspect?: string;
}) {
  const a = active !== null ? items[active] : undefined;
  return (
    <div className="cb-photo" style={{ aspectRatio: aspect ?? '3 / 4' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} style={{ objectFit: 'contain', background: 'var(--cb-paper)' }} />
      {a?.box ? (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: `${a.box.x * 100}%`,
            top: `${a.box.y * 100}%`,
            width: `${a.box.w * 100}%`,
            height: `${a.box.h * 100}%`,
            border: '2px solid var(--cb-ivory)',
            boxShadow: '0 0 0 1px rgba(37,34,43,0.6), 0 0 0 9999px rgba(37,34,43,0.28)',
            borderRadius: 10,
            pointerEvents: 'none',
            transition: 'all 160ms ease',
          }}
        />
      ) : null}
      {items.map((it, i) =>
        it.box ? (
          <button
            key={`${it.category}-${i}`}
            type="button"
            onClick={() => onSelect(active === i ? null : i)}
            aria-label={`${i + 1}. ${OUTFIT_CATEGORY_LABEL_KO[it.category]} ${it.name}, ${it.color.name}`}
            aria-pressed={active === i}
            style={{
              position: 'absolute',
              left: `calc(${(it.box.x + it.box.w / 2) * 100}% - 22px)`,
              top: `calc(${(it.box.y + it.box.h / 2) * 100}% - 22px)`,
              width: 44,
              height: 44,
              border: 0,
              padding: 0,
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: it.color.hex,
                border: `2px solid ${active === i ? 'var(--cb-iris)' : 'var(--cb-ivory)'}`,
                boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                color: contrastText(it.color.hex),
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i + 1}
            </span>
          </button>
        ) : null,
      )}
      {label ? <span className="cb-photo__label">{label}</span> : null}
    </div>
  );
}

/** 배경 hex 위에 읽히는 글자색 */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#25222B' : '#FFFDF8';
}
