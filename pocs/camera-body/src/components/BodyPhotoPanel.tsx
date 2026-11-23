'use client';
/**
 * 사진 + 오버레이 레이어 전환(전체 / 등신 눈금 / 폭 / 관절 / 사진만). 사진 종횡비를 그대로 써서 오버레이가 어긋나지 않게 한다.
 */
import { PhotoFrame, Tabs } from '@celeber/ui';
import { useState } from 'react';
import type { BodyAnalysis } from '@celeber/core/contracts';
import { BodyOverlay, type OverlayLayers } from './BodyOverlay';

type Mode = 'all' | 'ruler' | 'widths' | 'skeleton' | 'photo';
const MODES: Record<Mode, OverlayLayers> = {
  all: { skeleton: true, ruler: true, split: true, widths: true },
  ruler: { skeleton: false, ruler: true, split: true, widths: false },
  widths: { skeleton: false, ruler: false, split: false, widths: true },
  skeleton: { skeleton: true, ruler: false, split: false, widths: false },
  photo: { skeleton: false, ruler: false, split: false, widths: false },
};

export function BodyPhotoPanel({
  analysis,
  src,
  imageSize,
  label = '전신 사진',
  showTabs = true,
  showOverlay = true,
  apiBase = '',
}: {
  analysis: BodyAnalysis;
  /** 기본: apiBase + analysis.image.url */
  src?: string;
  /** 기본: analysis.image.width/height (없으면 2:3) */
  imageSize?: { width: number; height: number };
  label?: string;
  showTabs?: boolean;
  /** false면 사진만 (측정 실패 기록에는 눈금·폭선을 그리지 않는다) */
  showOverlay?: boolean;
  apiBase?: string;
}) {
  const [mode, setMode] = useState<Mode>('all');
  const w = imageSize?.width ?? analysis.image?.width ?? 2;
  const h = imageSize?.height ?? analysis.image?.height ?? 3;
  const url = src ?? (analysis.image ? `${apiBase}${analysis.image.url}` : undefined);
  const hasOverlay = showOverlay && !!analysis.landmarks;
  return (
    <div className="cb-stack-sm">
      <PhotoFrame src={url} alt="측정한 전신 사진" label={label} aspect={`${w} / ${h}`} overlay={hasOverlay ? <BodyOverlay analysis={analysis} aspect={h / w} layers={MODES[mode]} /> : undefined} />
      {showTabs && hasOverlay ? (
        <Tabs<Mode>
          label="오버레이 표시"
          value={mode}
          onChange={setMode}
          items={[
            { value: 'all', label: '전체' },
            { value: 'ruler', label: '등신' },
            { value: 'widths', label: '폭' },
            { value: 'skeleton', label: '관절' },
            { value: 'photo', label: '사진' },
          ]}
        />
      ) : null}
    </div>
  );
}
