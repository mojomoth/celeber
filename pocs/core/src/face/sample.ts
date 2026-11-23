/**
 * 이미지 픽셀 + FaceLandmarker 랜드마크 → 피부/헤어/눈/입술 색 샘플링.
 * 브라우저(canvas getImageData)와 서버(sharp raw) 어디서나 쓸 수 있는 순수 함수.
 */
import type { ColorValue, SkinColorMeasurement, SkinRegion } from '../contracts';
import { type Rgb, applyGains, deltaE2000, describeColor, gainsMagnitude, robustMeanColor, type RobustColorResult, type WbGains } from '../color';
import {
  LEFT_EYEBROW,
  LEFT_IRIS,
  LIPS_INNER,
  LIPS_OUTER,
  LM,
  type LandmarkLike,
  type Pt,
  RIGHT_EYEBROW,
  RIGHT_IRIS,
  SKIN_EXCLUDE,
  SKIN_ROI,
  boundingBox,
  convexHull,
  dist,
  pick,
  pointInPolygon,
  scalePolygon,
  toPixels,
} from './landmarks';

/** canvas ImageData 호환 (RGBA) */
export interface ImageDataLike {
  data: ArrayLike<number>;
  width: number;
  height: number;
}
/**
 * 세그멘테이션 카테고리 마스크 (MediaPipe selfie_multiclass_256x256):
 * 0 배경, 1 헤어, 2 몸 피부, 3 얼굴 피부, 4 옷, 5 기타(액세서리)
 */
export interface CategoryMaskLike {
  data: ArrayLike<number>;
  width: number;
  height: number;
}
export const SELFIE_MULTICLASS = { background: 0, hair: 1, bodySkin: 2, faceSkin: 3, clothes: 4, others: 5 } as const;

export interface SampleOptions {
  /** 측정할 피부 ROI (기본: 이마, 양 볼, 턱) */
  regions?: SkinRegion[];
  /** 휘도 퍼센타일 컷 (기본 하위 10%, 상위 5%) */
  trim?: { lowPct: number; highPct: number };
  /** ROI당 최대 픽셀 수 (초과 시 격자 간격으로 다운샘플) */
  maxPixelsPerRegion?: number;
  /** 있으면 얼굴 피부(3) 카테고리와 교집합만 사용, 헤어는 카테고리 1에서 샘플 */
  categoryMask?: CategoryMaskLike;
}

export interface FaceColorSamples {
  skin: {
    /** ROI 균등 가중(ROI마다 같은 수의 픽셀까지만 섞음)으로 낸 전체 피부색 */
    overall: RobustColorResult;
    regions: Partial<Record<SkinRegion, RobustColorResult>>;
    /** 요청한 ROI 중 피부 픽셀이 모자라 빠진 곳 */
    missing?: SkinRegion[];
  };
  hair?: RobustColorResult & { method: 'segmentation' | 'heuristic' };
  eyes?: RobustColorResult;
  lips?: RobustColorResult;
  brows?: RobustColorResult;
  /** 얼굴 영역 평균 luma (촬영 품질 체크용) */
  faceMeanLuma: number;
}

const DEFAULT_REGIONS: SkinRegion[] = ['forehead', 'leftCheek', 'rightCheek', 'chin'];
const REGION_LABEL_KO: Record<SkinRegion, string> = { forehead: '이마', leftCheek: '왼쪽 볼', rightCheek: '오른쪽 볼', nose: '코', chin: '턱' };
/** 전체값에 섞을 때 ROI당 최소 보장 픽셀 수. 가장 작은 ROI가 이보다 작아도 다른 ROI를 이 아래로 깎지는 않는다 */
const BALANCE_FLOOR = 1000;

/** 배열에서 고르게 n개만 남긴다 (순서 유지, 결정적) */
export function strideSubsample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  const out: T[] = [];
  const stride = arr.length / n;
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * stride)]);
  return out;
}

/** 피부로 볼 수 있는 픽셀인지 (YCbCr 범위, 느슨하게) — 머리카락/안경테/배경 섞임 제거 */
export function isSkinLike(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  if (y < 25 || y > 252) return false;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 72 && cb <= 132 && cr >= 128 && cr <= 180;
}

function collect(
  img: ImageDataLike,
  include: Pt[],
  exclude: Pt[][],
  filter: ((r: number, g: number, b: number, x: number, y: number) => boolean) | null,
  maxPixels: number,
): Rgb[] {
  if (include.length < 3) return [];
  const bb = boundingBox(include);
  const x0 = Math.max(0, Math.floor(bb.x));
  const y0 = Math.max(0, Math.floor(bb.y));
  const x1 = Math.min(img.width - 1, Math.ceil(bb.x + bb.w));
  const y1 = Math.min(img.height - 1, Math.ceil(bb.y + bb.h));
  const area = Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
  // ceil: 격자 간격을 올림해야 상한을 넘지 않는다 (floor면 면적이 상한의 4배 미만일 때 step 1이 된다)
  const step = Math.max(1, Math.ceil(Math.sqrt(area / maxPixels)));
  const exBoxes = exclude.map((p) => ({ poly: p, bb: boundingBox(p) }));
  const out: Rgb[] = [];
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const p = { x: x + 0.5, y: y + 0.5 };
      if (!pointInPolygon(p, include)) continue;
      let skip = false;
      for (const e of exBoxes) {
        if (p.x < e.bb.x || p.x > e.bb.x + e.bb.w || p.y < e.bb.y || p.y > e.bb.y + e.bb.h) continue;
        if (pointInPolygon(p, e.poly)) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      const i = (y * img.width + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      if (filter && !filter(r, g, b, x, y)) continue;
      out.push({ r, g, b });
    }
  }
  return out;
}

function maskAt(mask: CategoryMaskLike, img: ImageDataLike, x: number, y: number): number {
  const mx = Math.min(mask.width - 1, Math.floor((x / img.width) * mask.width));
  const my = Math.min(mask.height - 1, Math.floor((y / img.height) * mask.height));
  return mask.data[my * mask.width + mx];
}

/**
 * 피부(ROI별) + 헤어/눈/입술/눈썹 색을 샘플링한다.
 * landmarks: FaceLandmarker 결과 faceLandmarks[0] (정규화 478점).
 */
export function sampleFaceColors(img: ImageDataLike, landmarks: readonly LandmarkLike[], opts: SampleOptions = {}): FaceColorSamples {
  const regions = opts.regions ?? DEFAULT_REGIONS;
  const trim = opts.trim ?? { lowPct: 0.1, highPct: 0.05 };
  const maxPx = opts.maxPixelsPerRegion ?? 6000;
  const px = toPixels(landmarks, img.width, img.height);
  const exclude = SKIN_EXCLUDE.map((idx) => scalePolygon(convexHull(pick(px, idx)), 1.25));
  const mask = opts.categoryMask;
  const skinFilter = (r: number, g: number, b: number, x: number, y: number) => {
    if (mask) {
      const c = maskAt(mask, img, x, y);
      if (c !== SELFIE_MULTICLASS.faceSkin && c !== SELFIE_MULTICLASS.bodySkin) return false;
    }
    return isSkinLike(r, g, b);
  };

  const regionResults: Partial<Record<SkinRegion, RobustColorResult>> = {};
  const regionPixels: Rgb[][] = [];
  const missing: SkinRegion[] = [];
  for (const region of regions) {
    const hull = convexHull(pick(px, SKIN_ROI[region]));
    const pixels = collect(img, hull, exclude, skinFilter, maxPx);
    if (pixels.length < 30) {
      missing.push(region);
      continue;
    }
    regionResults[region] = robustMeanColor(pixels, trim.lowPct, trim.highPct);
    regionPixels.push(pixels);
  }
  // 균등 가중: 큰 ROI(예: 턱)가 전체값을 좌우하지 않도록 ROI마다 같은 수까지만 섞는다
  const perRegion = regionPixels.length ? Math.max(BALANCE_FLOOR, Math.min(...regionPixels.map((p) => p.length))) : 0;
  const all: Rgb[] = regionPixels.flatMap((p) => strideSubsample(p, perRegion));
  const overall = robustMeanColor(all, trim.lowPct, trim.highPct);

  // 얼굴 평균 밝기
  const ovalHull = convexHull(pick(px, [LM.foreheadTop, LM.cheekboneLeft, LM.chin, LM.cheekboneRight, LM.jawLeft, LM.jawRight]));
  const facePx = collect(img, ovalHull, [], null, 4000);
  const faceMeanLuma = facePx.length ? facePx.reduce((s, p) => s + 0.299 * p.r + 0.587 * p.g + 0.114 * p.b, 0) / facePx.length : 0;

  // 입술: 바깥 윤곽 - 안쪽(입 벌림)
  const lipsOuter = convexHull(pick(px, LIPS_OUTER));
  const lipsInner = convexHull(pick(px, LIPS_INNER));
  const lipPx = collect(img, lipsOuter, [lipsInner], null, 3000);
  const lips = lipPx.length >= 30 ? robustMeanColor(lipPx, 0.15, 0.1) : undefined;

  // 눈썹
  const browPx = [
    ...collect(img, convexHull(pick(px, LEFT_EYEBROW)), [], null, 1500),
    ...collect(img, convexHull(pick(px, RIGHT_EYEBROW)), [], null, 1500),
  ];
  const brows = browPx.length >= 20 ? robustMeanColor(browPx, 0.05, 0.4) : undefined;

  // 눈동자(홍채): 홍채 원판에서 동공(가장 어두운 쪽)과 반사광 제외
  let eyes: RobustColorResult | undefined;
  if (landmarks.length >= 478) {
    const irisPx: Rgb[] = [];
    for (const iris of [LEFT_IRIS, RIGHT_IRIS]) {
      const c = px[iris.center];
      const rad = (iris.ring.map((i) => dist(px[i], c)).reduce((s, v) => s + v, 0) / iris.ring.length) * 0.85;
      const disc: Pt[] = Array.from({ length: 16 }, (_, k) => ({
        x: c.x + rad * Math.cos((k / 16) * 2 * Math.PI),
        y: c.y + rad * Math.sin((k / 16) * 2 * Math.PI),
      }));
      const pupil = scalePolygon(disc, 0.35);
      irisPx.push(...collect(img, disc, [pupil], null, 800));
    }
    if (irisPx.length >= 12) eyes = robustMeanColor(irisPx, 0.15, 0.2);
  }

  // 헤어: 세그멘테이션 마스크가 있으면 카테고리 1, 없으면 이마 위 띠에서 어두운 픽셀 휴리스틱
  let hair: FaceColorSamples['hair'];
  if (mask) {
    const all2: Rgb[] = [];
    const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / 20000)));
    for (let y = 0; y < img.height; y += step) {
      for (let x = 0; x < img.width; x += step) {
        if (maskAt(mask, img, x, y) !== SELFIE_MULTICLASS.hair) continue;
        const i = (y * img.width + x) * 4;
        all2.push({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] });
      }
    }
    if (all2.length >= 50) hair = { ...robustMeanColor(all2, 0.1, 0.15), method: 'segmentation' };
  } else {
    const top = px[LM.foreheadTop];
    const faceH = dist(px[LM.foreheadTop], px[LM.chin]);
    const left = px[LM.foreheadRight];
    const right = px[LM.foreheadLeft];
    const band: Pt[] = [
      { x: left.x, y: top.y - faceH * 0.28 },
      { x: right.x, y: top.y - faceH * 0.28 },
      { x: right.x, y: top.y - faceH * 0.06 },
      { x: left.x, y: top.y - faceH * 0.06 },
    ];
    const bandPx = collect(img, band, [], (r, g, b) => !isSkinLike(r, g, b), 3000);
    if (bandPx.length >= 50) {
      // 배경이 섞일 수 있으므로 어두운 절반만 사용
      hair = { ...robustMeanColor(bandPx, 0.05, 0.5), method: 'heuristic' };
    }
  }

  return { skin: { overall, regions: regionResults, missing }, hair, eyes, lips, brows, faceMeanLuma };
}

/**
 * 샘플 + 화이트밸런스 게인 → 계약의 SkinColorMeasurement.
 * strength: 게인 적용 강도 (gray-world는 장면 의존성이 커서 0.5~0.7 권장, 기준 백색은 1.0)
 */
export function buildSkinMeasurement(
  samples: FaceColorSamples,
  wb: { method: SkinColorMeasurement['whiteBalance']['method']; gains: WbGains; strength: number; sourceCctK?: number },
  trim = { lowPct: 0.1, highPct: 0.05 },
): SkinColorMeasurement {
  const corr = (rgb: Rgb) => (wb.method === 'none' ? rgb : applyGains(rgb, wb.gains, wb.strength));
  const raw = describeColor(samples.skin.overall.rgb, 'skin');
  const corrected = describeColor(corr(samples.skin.overall.rgb), 'skin');
  const regions = (Object.entries(samples.skin.regions) as [SkinRegion, RobustColorResult][]).map(([region, r]) => ({
    region,
    raw: describeColor(r.rgb, 'skin'),
    corrected: describeColor(corr(r.rgb), 'skin'),
    pixelCount: r.used,
  }));
  // ROI 간 편차
  let spread = 0;
  let pairs = 0;
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++) {
      spread += deltaE2000(regions[i].corrected.lab, regions[j].corrected.lab);
      pairs++;
    }
  const regionSpreadDeltaE = pairs ? spread / pairs : 0;
  const wbDelta = deltaE2000(raw.lab, corrected.lab);

  const reasons: string[] = [];
  let conf = 1;
  if (samples.skin.overall.used < 800) {
    conf -= 0.25;
    reasons.push(`피부 샘플 픽셀이 적습니다(${samples.skin.overall.used}px). 얼굴을 더 크게 촬영하면 정확해집니다.`);
  } else reasons.push(`피부 샘플 ${samples.skin.overall.used.toLocaleString('ko-KR')}px 사용`);
  const missing = samples.skin.missing ?? DEFAULT_REGIONS.filter((r) => !samples.skin.regions[r]);
  if (missing.length) {
    conf -= missing.length === 1 ? 0.1 : 0.2;
    const names = missing.map((r) => REGION_LABEL_KO[r]).join(', ');
    reasons.push(
      regions.length
        ? `${names} 피부색을 읽지 못해 나머지 ${regions.length}곳으로 계산했습니다. 색이 강한 조명이나 한쪽 그림자 때문일 수 있습니다.`
        : '피부 영역을 하나도 측정하지 못했습니다. 밝고 고른 조명에서 다시 촬영해 주세요.',
    );
  }
  if (regionSpreadDeltaE > 6) {
    conf -= 0.2;
    reasons.push(`부위 간 색 차이가 큽니다(ΔE ${regionSpreadDeltaE.toFixed(1)}). 조명이 고르지 않을 수 있습니다.`);
  } else reasons.push(`부위 간 색 차이 ΔE ${regionSpreadDeltaE.toFixed(1)} (균일)`);
  const mag = gainsMagnitude(wb.gains) * wb.strength;
  if (mag > 25) {
    conf -= 0.2;
    reasons.push('조명 색 보정량이 큽니다. 자연광에서 다시 촬영하면 더 정확합니다.');
  }
  if (samples.skin.overall.lumaStd > 28) {
    conf -= 0.1;
    reasons.push('피부 밝기 편차가 큽니다(그림자/하이라이트).');
  }

  return {
    raw,
    corrected,
    regions,
    sampleCount: samples.skin.overall.used,
    trim,
    whiteBalance: {
      method: wb.method,
      gains: { r: wb.gains.r, g: wb.gains.g, b: wb.gains.b },
      strength: wb.strength,
      sourceCctK: wb.sourceCctK,
      deltaE: Math.round(wbDelta * 10) / 10,
    },
    regionSpreadDeltaE: Math.round(regionSpreadDeltaE * 10) / 10,
    confidence: Math.max(0.05, Math.min(1, conf)),
    confidenceReasons: reasons,
  };
}

/** RobustColorResult → ColorValue (보정 게인 선택 적용) */
export function sampleToColorValue(r: RobustColorResult | undefined, gains?: WbGains, strength = 1): ColorValue | undefined {
  if (!r || !Number.isFinite(r.rgb.r)) return undefined;
  return describeColor(gains ? applyGains(r.rgb, gains, strength) : r.rgb);
}
