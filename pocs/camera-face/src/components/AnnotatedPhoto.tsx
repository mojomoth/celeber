'use client';
/**
 * 사진 + SVG 오버레이(얼굴 윤곽선, 이목구비, 측면 프로필·E-라인, 선택 지점)를 같은 좌표계(viewBox=이미지 픽셀)로 그린다.
 * fit='aspect': 이미지 비율 그대로(잘림 없음), fit='contain': 부모 크기에 맞춤(카메라 스테이지 미리보기).
 */
import type { MouseEvent, ReactNode } from 'react';
import type { FaceProfile, Point2 } from '@celeber/core/contracts';

export interface AnnotatedPhotoProps {
  src: string;
  width: number;
  height: number;
  alt: string;
  contour?: Point2[] | null;
  features?: Record<string, Point2[]> | null;
  profile?: FaceProfile | null;
  marker?: Point2 | null;
  onPick?: (p: Point2) => void;
  label?: ReactNode;
  fit?: 'aspect' | 'contain';
  /** 오버레이 색 */
  stroke?: string;
}

const poly = (pts: Point2[], w: number, h: number) => pts.map((p) => `${(p.x * w).toFixed(1)},${(p.y * h).toFixed(1)}`).join(' ');

export function AnnotatedPhoto(p: AnnotatedPhotoProps) {
  const { width: w, height: h } = p;
  const sw = Math.max(w, h) / 260;
  const stroke = p.stroke ?? '#FFFDF8';
  const pr = p.profile;
  const onClick = p.onPick
    ? (e: MouseEvent<SVGSVGElement>) => {
        const svg = e.currentTarget;
        const r = svg.getBoundingClientRect();
        // meet 배치: 실제 그려진 이미지 영역 계산
        const s = Math.min(r.width / w, r.height / h);
        const ox = (r.width - w * s) / 2;
        const oy = (r.height - h * s) / 2;
        const x = (e.clientX - r.left - ox) / (w * s);
        const y = (e.clientY - r.top - oy) / (h * s);
        if (x >= 0 && x <= 1 && y >= 0 && y <= 1) p.onPick?.({ x, y });
      }
    : undefined;
  const svg = (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={p.alt}
      onClick={onClick}
      style={{ display: 'block', cursor: p.onPick ? 'crosshair' : undefined }}
    >
      <image href={p.src} width={w} height={h} />
      {p.contour?.length ? <polygon points={poly(p.contour, w, h)} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" opacity={0.95} /> : null}
      {p.features
        ? Object.entries(p.features).map(([k, pts]) => <polygon key={k} points={poly(pts, w, h)} fill="none" stroke={stroke} strokeWidth={sw * 0.7} opacity={0.85} strokeLinejoin="round" />)
        : null}
      {pr ? (
        <g>
          <polyline points={poly(pr.outline, w, h)} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
          {pr.eLine ? (
            <line
              x1={pr.points.noseTip.x * w + (pr.points.noseTip.x - pr.points.chin.x) * w * 0.25}
              y1={pr.points.noseTip.y * h + (pr.points.noseTip.y - pr.points.chin.y) * h * 0.25}
              x2={pr.points.chin.x * w + (pr.points.chin.x - pr.points.noseTip.x) * w * 0.15}
              y2={pr.points.chin.y * h + (pr.points.chin.y - pr.points.noseTip.y) * h * 0.15}
              stroke="#D6F36C"
              strokeWidth={sw * 0.9}
              strokeDasharray={`${sw * 4} ${sw * 3}`}
            />
          ) : null}
          {(['forehead', 'nasion', 'noseTip', 'subnasale', 'upperLip', 'lowerLip', 'chin'] as const).map((k) => {
            const pt = pr.points[k];
            return pt ? <circle key={k} cx={pt.x * w} cy={pt.y * h} r={sw * 2.2} fill={k === 'noseTip' || k === 'chin' ? '#D6F36C' : stroke} stroke="#25222B" strokeWidth={sw * 0.5} /> : null;
          })}
        </g>
      ) : null}
      {p.marker ? (
        <g>
          <circle cx={p.marker.x * w} cy={p.marker.y * h} r={Math.min(w, h) * 0.025} fill="none" stroke="#7274E9" strokeWidth={sw * 1.4} />
          <circle cx={p.marker.x * w} cy={p.marker.y * h} r={sw * 1.5} fill="#7274E9" />
        </g>
      ) : null}
    </svg>
  );
  if (p.fit === 'contain') return <div style={{ position: 'absolute', inset: 0 }}>{svg}</div>;
  return (
    <div className="cb-photo" style={{ aspectRatio: `${w} / ${h}`, background: 'var(--cb-paper)' }}>
      {svg}
      {p.label ? <span className="cb-photo__label">{p.label}</span> : null}
    </div>
  );
}
