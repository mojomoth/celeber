'use client';
/**
 * 원본 룩 ↔ 내 팔레트 적용 (레퍼런스 05 '원본 룩 / 내 팔레트 적용').
 * 같은 사진·조명·구도에서 옷 영역(아이템 box) 안의 원래 옷 색 픽셀만 내 치환색으로 옮긴다(recolorRegion).
 * 얼굴·배경은 건드리지 않는다. 박스가 없는 아이템은 스와치로만 보여준다.
 */
import { useEffect, useRef, useState } from 'react';
import type { ColorSubstitution, OutfitItem } from '@celeber/core/contracts';
import { findItemForSubstitution } from '../lib/palette-map';
import { recolorRegion } from '../lib/recolor';
import s from './guide.module.css';

export interface LookRecolorProps {
  /** 연예인 사진 URL (/api/uploads/<id>) */
  src: string;
  items: OutfitItem[];
  substitutions: ColorSubstitution[];
  celebName: string;
  /** 원본 캡션 (예: '아이보리 니트 · 차콜 팬츠') */
  originalCaption?: string;
  maxEdge?: number;
}

export function LookRecolor({ src, items, substitutions, celebName, originalCaption, maxEdge = 720 }: LookRecolorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<{ status: 'loading' | 'ok' | 'error'; applied: string[]; skipped: string[] }>({ status: 'loading', applied: [], skipped: [] });

  useEffect(() => {
    let alive = true;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!alive) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return setState({ status: 'error', applied: [], skipped: [] });
      ctx.drawImage(img, 0, 0, w, h);
      const applied: string[] = [];
      const skipped: string[] = [];
      try {
        const data = ctx.getImageData(0, 0, w, h);
        for (const sub of substitutions) {
          if (sub.keepOriginal) continue;
          const it = findItemForSubstitution(items, sub);
          if (!it?.box) {
            skipped.push(sub.itemName);
            continue;
          }
          const r = recolorRegion(data.data, w, h, it.box, sub.celebColor.hex, sub.myColor.hex);
          (r.changed > 0 ? applied : skipped).push(sub.itemName);
        }
        ctx.putImageData(data, 0, 0);
        setState({ status: 'ok', applied, skipped });
      } catch {
        setState({ status: 'error', applied: [], skipped: [] });
      }
    };
    img.onerror = () => alive && setState({ status: 'error', applied: [], skipped: [] });
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src, items, substitutions, maxEdge]);

  const changed = substitutions.filter((x) => !x.keepOriginal);
  const myCaption = changed.length ? changed.map((x) => `${x.myColor.name} ${x.itemName}`).slice(0, 2).join(' · ') : '바꿀 색 없음';

  return (
    <div>
      <div className={s.compare}>
        <div className={s.compareCol}>
          <div className={s.compareFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`${celebName} 원본 룩`} />
            <span className={s.compareLabel}>{celebName}</span>
          </div>
          <div className={s.compareCap}>
            원본 룩<span>{originalCaption || '사진 속 코디'}</span>
          </div>
        </div>
        <div className={s.compareCol}>
          <div className={s.compareFrame}>
            <canvas ref={canvasRef} role="img" aria-label="내 팔레트 색으로 바꾼 룩" />
            <span className={s.compareLabel}>나</span>
          </div>
          <div className={s.compareCap}>
            내 팔레트 적용<span>{myCaption}</span>
          </div>
        </div>
      </div>
      <p className="cb-caption cb-muted" style={{ marginTop: 8 }}>
        {state.status === 'error'
          ? '이 사진에서는 색 바꾸기 미리보기를 만들지 못했습니다. 아래 색 치환표를 참고하세요.'
          : `옷 영역의 색만 바꾼 시뮬레이션입니다. 조명·구도·얼굴은 그대로입니다.${state.skipped.length ? ` 위치를 찾지 못한 아이템(${state.skipped.join(', ')})은 표로만 보여줍니다.` : ''}`}
      </p>
    </div>
  );
}
