/**
 * 세그멘테이션 카테고리 마스크(selfie_multiclass: 0 배경, 1 헤어, 2 몸 피부, 3 얼굴 피부, 4 옷, 5 기타)
 * 축소/직렬화 유틸. 브라우저에서 만든 마스크를 서버로 보내 피부/헤어/측면 실루엣 분석에 쓴다.
 */
import { z } from 'zod';

export interface CategoryMask {
  width: number;
  height: number;
  data: Uint8Array;
}

/** 전송용 마스크: data = base64(Uint8 카테고리 배열, 행 우선) */
export const EncodedMaskSchema = z.object({
  width: z.number().int().positive().max(1024),
  height: z.number().int().positive().max(1024),
  data: z.string().max(2_000_000),
});
export type EncodedMask = z.infer<typeof EncodedMaskSchema>;

/** 최근접 이웃 축소 (긴 변 maxEdge). 카테고리 값은 보간하지 않는다. */
export function downsampleMask(mask: { width: number; height: number; data: ArrayLike<number> }, maxEdge = 256): CategoryMask {
  const scale = Math.min(1, maxEdge / Math.max(mask.width, mask.height));
  const w = Math.max(1, Math.round(mask.width * scale));
  const h = Math.max(1, Math.round(mask.height * scale));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(mask.height - 1, Math.floor(((y + 0.5) / h) * mask.height));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(mask.width - 1, Math.floor(((x + 0.5) / w) * mask.width));
      out[y * w + x] = mask.data[sy * mask.width + sx];
    }
  }
  return { width: w, height: h, data: out };
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeMask(mask: CategoryMask): EncodedMask {
  return { width: mask.width, height: mask.height, data: toBase64(mask.data) };
}

/** 디코드 + 크기 검증. 길이가 맞지 않으면 null */
export function decodeMask(m: EncodedMask | undefined | null): CategoryMask | null {
  if (!m) return null;
  const data = fromBase64(m.data);
  if (data.length !== m.width * m.height) return null;
  return { width: m.width, height: m.height, data };
}

/** 카테고리별 픽셀 비율 (0..1) */
export function maskCategoryFractions(mask: CategoryMask): number[] {
  const counts = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < mask.data.length; i++) {
    const c = mask.data[i];
    if (c < counts.length) counts[c]++;
  }
  return counts.map((c) => c / Math.max(1, mask.data.length));
}
