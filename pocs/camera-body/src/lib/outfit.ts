/**
 * 옷 색 측정 (순수 함수): 상의 = 어깨~골반 몸통 중앙 사각형, 하의 = 골반~무릎 허벅지 띠.
 * 마스크가 있으면 사람 픽셀만 쓴다. 하이라이트/그림자는 robustMeanColor가 걸러낸다.
 * AI 서술을 못 쓸 때(Mock) 이 측정값으로 코디 요약을 만든다.
 */
import { describeColor, robustMeanColor, type Rgb } from '@celeber/core/color';
import type { Landmark3 } from '@celeber/core/contracts';
import { POSE, vis } from './pose';
import type { PersonMask } from './silhouette';

export interface ImageDataLike {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface OutfitColor {
  hex: string;
  nameKo: string;
  /** 사용된 픽셀 수 */
  samples: number;
}

export interface OutfitColors {
  top?: OutfitColor;
  bottom?: OutfitColor;
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * 클라이언트가 보낸 옷 색을 서버 기준으로 다시 만든다.
 * hex는 '#RRGGBB'만 받아 대문자로 정규화하고, nameKo는 클라이언트 값을 버리고 hex에서 다시 계산한다
 * (화면 인라인 style과 AI 프롬프트에 임의 문자열이 들어가지 않게).
 * 형식이 틀린 색은 버린다.
 */
export function sanitizeOutfitColors(input: { top?: { hex: string; samples: number }; bottom?: { hex: string; samples: number } } | null | undefined): OutfitColors {
  const out: OutfitColors = {};
  for (const key of ['top', 'bottom'] as const) {
    const c = input?.[key];
    if (!c || typeof c.hex !== 'string' || !HEX6.test(c.hex)) continue;
    const hex = c.hex.toUpperCase();
    const samples = Number.isFinite(c.samples) ? Math.max(0, Math.round(c.samples)) : 0;
    out[key] = { hex, nameKo: describeColor(hex).nameKo, samples };
  }
  return out;
}

/** 렌더링용: '#RRGGBB'가 아니면 undefined (저장된 옛 데이터 방어) */
export function safeHex(hex: string | undefined | null): string | undefined {
  return typeof hex === 'string' && HEX6.test(hex) ? hex : undefined;
}

function sampleRect(img: ImageDataLike, mask: PersonMask | null | undefined, x0: number, y0: number, x1: number, y1: number): Rgb[] {
  const out: Rgb[] = [];
  const W = img.width;
  const H = img.height;
  const ax = Math.max(0, Math.floor(Math.min(x0, x1) * W));
  const bx = Math.min(W - 1, Math.ceil(Math.max(x0, x1) * W));
  const ay = Math.max(0, Math.floor(Math.min(y0, y1) * H));
  const by = Math.min(H - 1, Math.ceil(Math.max(y0, y1) * H));
  const area = (bx - ax + 1) * (by - ay + 1);
  const step = Math.max(1, Math.floor(Math.sqrt(area / 4000)));
  let thr = mask?.threshold ?? 0.5;
  if (mask && mask.threshold === undefined) {
    let max = 0;
    for (let i = 0; i < mask.data.length; i += 97) max = Math.max(max, mask.data[i]);
    thr = max > 1.001 ? 128 : 0.5;
  }
  for (let y = ay; y <= by; y += step) {
    for (let x = ax; x <= bx; x += step) {
      if (mask) {
        const mx = Math.min(mask.width - 1, Math.floor((x / W) * mask.width));
        const my = Math.min(mask.height - 1, Math.floor((y / H) * mask.height));
        if (mask.data[my * mask.width + mx] < thr) continue;
      }
      const i = (y * W + x) * 4;
      out.push({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] });
    }
  }
  return out;
}

const toColor = (px: Rgb[]): OutfitColor | undefined => {
  if (px.length < 30) return undefined;
  const r = robustMeanColor(px, 0.15, 0.1);
  if (!Number.isFinite(r.rgb.r)) return undefined;
  const c = describeColor(r.rgb);
  return { hex: c.hex, nameKo: c.nameKo, samples: r.used };
};

export function sampleOutfitColors(img: ImageDataLike, landmarks: Landmark3[], mask?: PersonMask | null): OutfitColors {
  if (!landmarks || landmarks.length < 33) return {};
  const L = landmarks;
  const ok = (i: number) => vis(L[i]) >= 0.5;
  const out: OutfitColors = {};
  if (ok(POSE.leftShoulder) && ok(POSE.rightShoulder) && ok(POSE.leftHip) && ok(POSE.rightHip)) {
    const xs = [L[POSE.leftShoulder].x, L[POSE.rightShoulder].x, L[POSE.leftHip].x, L[POSE.rightHip].x];
    const cx = xs.reduce((a, b) => a + b, 0) / 4;
    const half = (Math.abs(L[POSE.leftHip].x - L[POSE.rightHip].x) / 2) * 0.7;
    const shY = (L[POSE.leftShoulder].y + L[POSE.rightShoulder].y) / 2;
    const hipY = (L[POSE.leftHip].y + L[POSE.rightHip].y) / 2;
    const t = hipY - shY;
    out.top = toColor(sampleRect(img, mask, cx - half, shY + t * 0.15, cx + half, hipY - t * 0.1));
    if (ok(POSE.leftKnee) && ok(POSE.rightKnee)) {
      const kneeY = (L[POSE.leftKnee].y + L[POSE.rightKnee].y) / 2;
      const th = kneeY - hipY;
      const legPx: Rgb[] = [];
      for (const [hip, knee] of [
        [POSE.leftHip, POSE.leftKnee],
        [POSE.rightHip, POSE.rightKnee],
      ] as const) {
        const mx = (L[hip].x + L[knee].x) / 2;
        const w = half * 0.45;
        legPx.push(...sampleRect(img, mask, mx - w, hipY + th * 0.25, mx + w, hipY + th * 0.75));
      }
      out.bottom = toColor(legPx);
    }
  }
  return out;
}

/** 색 측정만으로 만드는 코디 요약 (AI 없이) */
export function outfitSummaryFromColors(c: OutfitColors): string {
  if (!c.top && !c.bottom) return '옷 색을 측정하지 못했습니다.';
  const parts: string[] = [];
  if (c.top) parts.push(`상의는 ${c.top.nameKo}(${c.top.hex}) 계열`);
  if (c.bottom) parts.push(`하의는 ${c.bottom.nameKo}(${c.bottom.hex}) 계열`);
  return `${parts.join(', ')}로 측정됐습니다.`;
}

/** 결과 화면 '현재 코디' 부제. AI 공급자가 바뀔 수 있으므로(Anthropic → OpenAI) 공급자 이름을 고정하지 않고 모델명만 붙인다. */
export function outfitSourceLabel(o: { source: 'ai' | 'mock' | 'none'; model: string | null } | null | undefined): string {
  if (o?.source === 'ai') return `AI 사진 서술${o.model ? ` · ${o.model}` : ''}`;
  return '픽셀 색 측정 기반 요약';
}
