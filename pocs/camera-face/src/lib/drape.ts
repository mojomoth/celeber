/**
 * 후행 PoC(personal-color-report)용: 정면 캡처 랜드마크 → 드레이핑(턱 아래 천) 합성 기준점.
 * PersonalColorReport.photos.drapeAnchor 형태와 같다 (모두 정규화 좌표).
 */
import type { FaceAnalysis } from '@celeber/core/contracts';
import { LM, type LandmarkLike, faceBoxFromLandmarks } from '@celeber/core/face';

export interface DrapeAnchor {
  chin: { x: number; y: number };
  jawLeft: { x: number; y: number };
  jawRight: { x: number; y: number };
  faceBox: { x: number; y: number; w: number; h: number };
}

const pt = (p: LandmarkLike) => ({ x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 });

export function drapeAnchorFromLandmarks(lms: readonly LandmarkLike[]): DrapeAnchor {
  return { chin: pt(lms[LM.chin]), jawLeft: pt(lms[LM.jawLeft]), jawRight: pt(lms[LM.jawRight]), faceBox: faceBoxFromLandmarks(lms) };
}

/** FaceAnalysis에서 바로 (정면 랜드마크가 저장돼 있으면) */
export function drapeAnchorFromAnalysis(a: Pick<FaceAnalysis, 'front'>): DrapeAnchor | null {
  const lms = a.front.landmarks;
  if (lms && lms.length >= 468) return drapeAnchorFromLandmarks(lms);
  const b = a.front.faceBox;
  return { chin: { x: b.x + b.w / 2, y: b.y + b.h }, jawLeft: { x: b.x + b.w * 0.85, y: b.y + b.h * 0.8 }, jawRight: { x: b.x + b.w * 0.15, y: b.y + b.h * 0.8 }, faceBox: b };
}
