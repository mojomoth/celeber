'use client';
/**
 * ⑤ 톤 컬러 적용 예시 (얼굴 주변 비교).
 * 위: 선택한 베스트 vs 워스트를 크게 나란히 / 아래: 잘 어울리는 톤 4 · 어울리지 않는 톤 4 썸네일 (탭하면 위 비교가 바뀐다).
 */
import { useState } from 'react';
import type { PersonalColorReport } from '@celeber/core/contracts';
import { Icon, SwatchRow } from '@celeber/ui';
import { type DrapeAnchor, anchorFromFaceBox } from '../lib/drape';
import { DrapeThumb } from './DrapeThumb';

export function DrapeCompare({ report }: { report: PersonalColorReport }) {
  const d = report.draping;
  const [bi, setBi] = useState(0);
  const [wi, setWi] = useState(0);
  const anchor: DrapeAnchor | null = report.photos.drapeAnchor ?? null;
  const src = report.photos.front.url;

  if (!anchor) {
    // 얼굴 기준점이 없으면 색 견본으로만 비교
    return (
      <div className="pcr-drape">
        <div className="pcr-drape__group pcr-drape__group--ok">
          <div className="pcr-drape__label">잘 어울리는 톤 · {d.bestCaption}</div>
          <SwatchRow items={d.best.map((s) => ({ hex: s.color.hex, name: s.color.name }))} columns={4} size={44} />
        </div>
        <div className="pcr-drape__group pcr-drape__group--no">
          <div className="pcr-drape__label">어울리지 않는 톤 · {d.worstCaption}</div>
          <SwatchRow items={d.worst.map((s) => ({ hex: s.color.hex, name: s.color.name }))} columns={4} size={44} />
        </div>
      </div>
    );
  }
  const a = anchor.faceBox.w > 0 ? anchor : anchorFromFaceBox(anchor.faceBox);
  const best = d.best[bi] ?? d.best[0];
  const worst = d.worst[wi] ?? d.worst[0];
  return (
    <div className="pcr-drape">
      <div className="pcr-drape__pair">
        <div className="pcr-drape__big">
          <DrapeThumb src={src} anchor={a} hex={best.color.hex} name={best.color.name} width={300} />
          <div className="pcr-drape__name">{best.color.name}</div>
          <div className="pcr-drape__badge pcr-drape__badge--ok">
            <Icon name="check" size={16} /> 잘 어울려요
          </div>
          <div className="pcr-drape__sub">{d.bestCaption}</div>
        </div>
        <div className="pcr-drape__big">
          <DrapeThumb src={src} anchor={a} hex={worst.color.hex} name={worst.color.name} width={300} />
          <div className="pcr-drape__name">{worst.color.name}</div>
          <div className="pcr-drape__badge pcr-drape__badge--no">
            <Icon name="close" size={16} /> 피해 주세요
          </div>
          <div className="pcr-drape__sub">{d.worstCaption}</div>
        </div>
      </div>

      <div className="pcr-drape__group pcr-drape__group--ok">
        <div className="pcr-drape__label">
          잘 어울리는 톤 <span className="pcr-drape__sub">({d.bestCaption})</span>
        </div>
        <div className="pcr-drape__grid">
          {d.best.map((s, i) => (
            <button key={`${s.color.hex}-${i}`} type="button" className="pcr-drape__thumb" aria-pressed={i === bi} onClick={() => setBi(i)} aria-label={`${s.color.name} 크게 보기`}>
              <DrapeThumb src={src} anchor={a} hex={s.color.hex} name={s.color.name} width={110} />
              <span className="pcr-drape__name">{s.color.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pcr-drape__group pcr-drape__group--no">
        <div className="pcr-drape__label">
          어울리지 않는 톤 <span className="pcr-drape__sub">({d.worstCaption})</span>
        </div>
        <div className="pcr-drape__grid">
          {d.worst.map((s, i) => (
            <button key={`${s.color.hex}-${i}`} type="button" className="pcr-drape__thumb" aria-pressed={i === wi} onClick={() => setWi(i)} aria-label={`${s.color.name} 크게 보기`}>
              <DrapeThumb src={src} anchor={a} hex={s.color.hex} name={s.color.name} width={110} />
              <span className="pcr-drape__name">{s.color.name}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="pcr-drape__sub" style={{ margin: 0 }}>
        같은 정면 사진에 천의 색만 바꿔 합성한 예시입니다. 조명과 구도는 촬영한 그대로이고 얼굴 부분은 손대지 않았습니다. 목에 비치는 천 색 반사광만 약하게 시뮬레이션했습니다.
      </p>
    </div>
  );
}
