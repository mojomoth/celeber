/**
 * 피부색/부위색 측정 + 화이트밸런스 보정 선택 (순수 함수).
 *
 * 1) 피부 ROI: FaceLandmarker 랜드마크로 이마·양 볼·턱 볼록 껍질, 눈·눈썹·입술은 1.25배 확장해 제외,
 *    세그멘테이션 마스크가 있으면 얼굴/몸 피부 카테고리와 교집합, YCbCr 피부 범위 필터 (core/face).
 * 2) 이상치 제거: ROI별 휘도 하위 10%(그림자)·상위 5%(하이라이트) 컷 후 선형 RGB 평균.
 * 3) 화이트밸런스:
 *    - 흰 종이 기준 백색이 있으면 그 게인(강도 1.0) — 가장 정확
 *    - 아니면 환경 사진 gray-world 게인과 얼굴 사진 배경 gray-world 게인의 기하 평균(강도 0.6, 과보정 방지)
 *    - 둘 중 하나만 있으면 그것만 사용
 * 4) 결과: 보정 전/후 sRGB hex + CIELAB + ITA° + hue angle + chroma, ROI별 값, 신뢰도와 근거.
 */
import type { EnvironmentAnalysis, FeatureColors, Issue, SkinColorMeasurement } from '@celeber/core/contracts';
import { type WbGains, clamp, grayWorldGains, gainsMagnitude } from '@celeber/core/color';
import { type FaceColorSamples, type LandmarkLike, buildSkinMeasurement, faceBoxFromLandmarks, sampleFaceColors, sampleToColorValue } from '@celeber/core/face';
import type { CategoryMask } from './mask';

export interface WhiteBalanceChoice {
  method: SkinColorMeasurement['whiteBalance']['method'];
  gains: WbGains;
  strength: number;
  sourceCctK?: number;
  reasons: string[];
}

export const WB_STRENGTH = { grayWorld: 0.6, reference: 1, lowConfidence: 0.4 } as const;

interface ImageLike {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

const geoMean = (a: WbGains, b: WbGains): WbGains => ({ r: Math.sqrt(a.r * b.r), g: 1, b: Math.sqrt(a.b * b.b) });

/** 얼굴 사진에서 얼굴 박스(1.3배) 밖 + (마스크가 있으면) 배경 픽셀만으로 gray-world 게인 */
export function backgroundGrayWorld(img: ImageLike, landmarks: readonly LandmarkLike[], mask?: CategoryMask | null): { gains: WbGains; pixelCount: number } | null {
  const box = faceBoxFromLandmarks(landmarks);
  const ex = { x: box.x - box.w * 0.15, y: box.y - box.h * 0.25, w: box.w * 1.3, h: box.h * 1.6 };
  const step = Math.max(1, Math.floor(Math.sqrt((img.width * img.height) / 40000)));
  const pixels: { r: number; g: number; b: number }[] = [];
  for (let y = 0; y < img.height; y += step) {
    const ny = (y + 0.5) / img.height;
    for (let x = 0; x < img.width; x += step) {
      const nx = (x + 0.5) / img.width;
      if (nx >= ex.x && nx <= ex.x + ex.w && ny >= ex.y && ny <= ex.y + ex.h) continue;
      if (mask) {
        const mx = Math.min(mask.width - 1, Math.floor(nx * mask.width));
        const my = Math.min(mask.height - 1, Math.floor(ny * mask.height));
        if (mask.data[my * mask.width + mx] !== 0) continue;
      }
      const i = (y * img.width + x) * 4;
      pixels.push({ r: img.data[i], g: img.data[i + 1], b: img.data[i + 2] });
    }
  }
  if (pixels.length < 1500) return null;
  return { gains: grayWorldGains(pixels, { maxGain: 1.8 }), pixelCount: pixels.length };
}

/** 사용할 화이트밸런스 결정 */
export function chooseWhiteBalance(p: { environment?: EnvironmentAnalysis | null; envFromFacePhoto?: boolean; background?: { gains: WbGains; pixelCount: number } | null }): WhiteBalanceChoice {
  const env = p.environment;
  const reasons: string[] = [];
  if (env?.referenceWhite) {
    const lin = (c: number) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const w = env.referenceWhite.rgb;
    const lim = (v: number) => clamp(v, 1 / 2.5, 2.5);
    const gains = { r: lim(lin(w.g) / Math.max(1e-6, lin(w.r))), g: 1, b: lim(lin(w.g) / Math.max(1e-6, lin(w.b))) };
    reasons.push(`흰 종이 기준 백색(${w.r}, ${w.g}, ${w.b})으로 보정`);
    return { method: 'reference-white', gains, strength: WB_STRENGTH.reference, sourceCctK: env.cctK, reasons };
  }
  const envGains = env && !p.envFromFacePhoto ? env.grayWorldGains : null;
  const bg = p.background?.gains ?? null;
  let strength: number = WB_STRENGTH.grayWorld;
  if (env && env.cctConfidence < 0.3) {
    strength = WB_STRENGTH.lowConfidence;
    reasons.push('조명 추정 신뢰도가 낮아 보정 강도를 낮췄습니다.');
  }
  if (envGains && bg) {
    reasons.push(`환경 사진 + 얼굴 사진 배경의 gray-world 게인 기하 평균, 강도 ${strength}`);
    return { method: 'combined', gains: geoMean(envGains, bg), strength, sourceCctK: env?.cctK, reasons };
  }
  if (envGains || bg) {
    reasons.push(`${envGains ? '환경 사진' : '얼굴 사진 배경'} gray-world 게인, 강도 ${strength}`);
    return { method: 'gray-world', gains: (envGains ?? bg)!, strength, sourceCctK: env?.cctK, reasons };
  }
  reasons.push('보정에 쓸 배경 정보가 없어 원본 색을 사용합니다.');
  return { method: 'none', gains: { r: 1, g: 1, b: 1 }, strength: 0, reasons };
}

/** 정면 촬영 품질 오류 1건당 피부 신뢰도에 곱하는 값 (2건이면 0.49배) */
export const CAPTURE_ERROR_FACTOR = 0.7;
const CAPTURE_ISSUE_LABEL_KO: Record<string, string> = {
  'face-dark': '얼굴 어두움',
  'face-bright': '얼굴 과다 노출',
  'face-cut': '얼굴 잘림',
  'too-small': '얼굴이 작음',
  'too-large': '얼굴이 너무 가까움',
  yaw: '고개 좌우 각도',
  pitch: '고개 위아래 각도',
  roll: '고개 기울어짐',
  'no-face': '얼굴 미검출',
};

export interface FaceColorResult {
  samples: FaceColorSamples;
  skin: SkinColorMeasurement;
  featureColors: FeatureColors;
  whiteBalance: WhiteBalanceChoice;
}

/**
 * 정면 사진 픽셀 + 랜드마크 (+ 마스크, 환경) → 피부색 측정과 부위색.
 * lightingQuality/촬영 품질로 측정 신뢰도를 한 번 더 조정한다.
 */
export function measureFaceColors(
  img: ImageLike,
  landmarks: readonly LandmarkLike[],
  opts: { mask?: CategoryMask | null; environment?: EnvironmentAnalysis | null; envFromFacePhoto?: boolean; captureScore?: number; captureIssues?: readonly Issue[] } = {},
): FaceColorResult {
  const samples = sampleFaceColors(img, landmarks, opts.mask ? { categoryMask: opts.mask } : {});
  if (samples.skin.overall.used === 0) throw new Error('피부 영역을 찾지 못했습니다. 얼굴이 잘 보이는 정면 사진이 필요합니다.');
  const background = backgroundGrayWorld(img, landmarks, opts.mask);
  const wb = chooseWhiteBalance({ environment: opts.environment, envFromFacePhoto: opts.envFromFacePhoto, background });
  const skin = buildSkinMeasurement(samples, { method: wb.method, gains: wb.gains, strength: wb.strength, sourceCctK: wb.sourceCctK });
  skin.confidenceReasons.unshift(...wb.reasons);
  if (opts.mask) skin.confidenceReasons.push('세그멘테이션 마스크로 머리카락·배경 픽셀을 제외했습니다.');
  const lq = opts.environment?.lightingQuality;
  let conf = skin.confidence;
  if (lq !== undefined) {
    conf *= 0.6 + 0.4 * lq;
    skin.confidenceReasons.push(`조명 품질 ${Math.round(lq * 100)}점 반영`);
  }
  const captureErrors = opts.captureIssues?.filter((i) => i.severity === 'error') ?? [];
  if (captureErrors.length) {
    // 오류 하나마다 감점한다(어두움·잘림·고개 각도가 겹칠수록 낮아짐).
    conf *= CAPTURE_ERROR_FACTOR ** captureErrors.length;
    skin.confidenceReasons.push(`촬영 품질 오류(${captureErrors.map((i) => CAPTURE_ISSUE_LABEL_KO[i.code] ?? i.code).join(', ')}) ${captureErrors.length}건이 있어 신뢰도를 낮췄습니다.`);
  } else if (opts.captureScore !== undefined && opts.captureScore < 0.8) {
    conf *= 0.85;
    skin.confidenceReasons.push('촬영 품질 경고가 있어 신뢰도를 낮췄습니다.');
  }
  if (wb.method === 'none') conf *= 0.85;
  if (gainsMagnitude(wb.gains) * wb.strength > 20) skin.confidenceReasons.push('보정량이 커서 원본 조명의 영향이 남아 있을 수 있습니다.');
  skin.confidence = Math.round(clamp(conf, 0.05, 1) * 100) / 100;

  const g = wb.method === 'none' ? undefined : wb.gains;
  const notes: string[] = [];
  const hair = sampleToColorValue(samples.hair, g, wb.strength);
  if (samples.hair) notes.push(samples.hair.method === 'segmentation' ? '헤어: 세그멘테이션 헤어 영역 평균(밝은 반사 15% 제외)' : '헤어: 이마 위 띠의 어두운 픽셀 휴리스틱(배경이 섞일 수 있음)');
  else notes.push('헤어: 측정하지 못했습니다(모자/민머리/배경 혼동).');
  const eyes = sampleToColorValue(samples.eyes, g, wb.strength);
  notes.push(eyes ? '눈동자: 홍채 원판에서 동공·반사광 제외' : '눈동자: 홍채 랜드마크가 없어 측정하지 못했습니다.');
  const brows = sampleToColorValue(samples.brows, g, wb.strength);
  const lips = sampleToColorValue(samples.lips, g, wb.strength);
  if (lips) notes.push('입술: 바깥 윤곽에서 입 안쪽을 제외한 평균');
  return { samples, skin, featureColors: { ...(hair ? { hair } : {}), ...(eyes ? { eyes } : {}), ...(brows ? { brows } : {}), ...(lips ? { lips } : {}), notes }, whiteBalance: wb };
}
