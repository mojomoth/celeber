/**
 * 환경 사진 분석 (순수 함수, 브라우저/서버 공용).
 * 광원 종류 · 추정 색온도(CCT) · 조도/밝기 · 실내/실외 · 역광/혼합광/어두움/색 캐스트 경고 → 재촬영 안내.
 *
 * 근거:
 * - 색온도: 장면 gray-world 평균(선형 RGB)과 white-patch(밝은 무채색 픽셀) 평균의 xy 색도 → McCamy CCT.
 *   두 추정을 mired(1e6/K) 공간에서 가중 평균. 스마트폰 자동 화이트밸런스가 이미 적용된 사진에서는
 *   "보정 후 남은 색 치우침"을 재는 셈이므로 절대 광원 CCT보다는 잔여 캐스트 지표로 해석해야 한다.
 * - 혼합광: 3×3 타일별 저채도 픽셀의 CCT(mired) 표준편차.
 * - 역광: 밝은 픽셀(>235) 비율이 높은데 중앙(피사체) 중앙값이 낮을 때. 얼굴 사진이면 얼굴 밝기 vs 배경 밝기.
 * - 실내/실외: 상단 1/3의 하늘색 비율, 식물(녹색) 비율, CCT, 형광 녹색 편향(tint)을 합산한 휴리스틱 점수.
 */
import type { EnvironmentAnalysis, Issue, LightSource } from '@celeber/core/contracts';
import { type Rgb, type WbGains, cctToXy, clamp, describeColor, gainsMagnitude, gainsToCct, linearChannelToSrgb, linearToXyz, rgbToCct, srgb8ToLinear, xyToCctMcCamy, xyzToXy } from '@celeber/core/color';
import type { CategoryMask } from './mask';

export type BrightnessLevel = EnvironmentAnalysis['brightness']['level'];

export const LIGHT_SOURCE_LABEL_KO: Record<LightSource, string> = {
  daylight: '주광(자연광)',
  overcast: '흐린 날 자연광',
  shade: '그늘 자연광',
  incandescent: '백열등·전구색 조명',
  'warm-led': '온백색 조명',
  'neutral-led': '주백색 조명',
  'cool-led': '주광색 조명',
  fluorescent: '형광등',
  mixed: '혼합광',
  unknown: '판단 어려움',
};
export const BRIGHTNESS_LABEL_KO: Record<BrightnessLevel, string> = {
  'too-dark': '너무 어두움',
  dim: '조금 어두움',
  normal: '적정',
  bright: '밝음',
  'too-bright': '과다 노출',
};
export const SETTING_LABEL_KO = { indoor: '실내', outdoor: '실외', unknown: '판단 어려움' } as const;

export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EnvironmentPixelOptions {
  /** 분석에서 제외할 영역 (얼굴 사진으로 환경을 추정할 때 얼굴 bbox) */
  exclude?: NormBox | null;
  /** 있으면 배경(카테고리 0) 픽셀만 사용 */
  mask?: CategoryMask | null;
  /** 피사체(얼굴) 평균 luma — 얼굴 사진 기반 역광 판정용 */
  subjectLuma?: number | null;
  /** 흰 종이 등 기준 백색 위치 (정규화 좌표) */
  whitePoint?: { x: number; y: number } | null;
  /** 최대 샘플 수 (기본 60,000) */
  maxSamples?: number;
}

export interface EnvironmentMetrics {
  sampleCount: number;
  grayWorldCct: number;
  whitePatchCct: number | null;
  /** Duv: 장면 평균 색도의 흑체/주광 궤적으로부터 거리(CIE 1960 uv). 양수 = 녹색 편향(형광등), 음수 = 자주 편향 */
  tint: number;
  meanSaturation: number;
  skyFraction: number;
  vegetationFraction: number;
  tileCcts: number[];
  mixedMiredStd: number;
  dynamicRange: number;
  brightFraction: number;
  centerMedianLuma: number;
  outdoorScore: number;
  castMagnitude: number;
}

export interface WhiteReferenceResult {
  ok: boolean;
  rgb: Rgb | null;
  cctK: number | null;
  gains: WbGains | null;
  pixelCount: number;
  message: string;
}

export type EnvironmentCore = Omit<EnvironmentAnalysis, 'image' | 'capturedAt' | 'source' | 'aiNotes'>;

export interface EnvironmentPixelResult {
  environment: EnvironmentCore;
  metrics: EnvironmentMetrics;
  whiteReference: WhiteReferenceResult | null;
}

interface ImageLike {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

const luma8 = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const sat = (r: number, g: number, b: number) => {
  const mx = Math.max(r, g, b);
  return mx <= 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};
const toMired = (k: number) => 1e6 / Math.max(1000, k);
const uv60 = (xy: { x: number; y: number }) => {
  const d = -2 * xy.x + 12 * xy.y + 3;
  return { u: (4 * xy.x) / d, v: (6 * xy.y) / d };
};
/** 선형 RGB 평균 → Duv (궤적 위 = 녹색 +, 아래 = 자주 −) */
export function duvOf(lin: { r: number; g: number; b: number }, cctK: number): number {
  if (!(lin.r > 0 && lin.g > 0 && lin.b > 0) || !Number.isFinite(cctK)) return 0;
  const p = uv60(xyzToXy(linearToXyz(lin)));
  const q = uv60(cctToXy(cctK));
  return Math.sign(p.v - q.v) * Math.hypot(p.u - q.u, p.v - q.v);
}
/** 타일 CCT/white-patch에 쓸 픽셀의 최대 HSV 채도 (강한 조명 캐스트의 무채색은 통과, 원색 물체는 제외) */
export const TILE_MAX_SAT = 0.75;
export const WHITE_PATCH_MAX_SAT = 0.6;
/** 기준 백색으로 인정할 최대 |Duv| (광원 궤적에서 이보다 멀면 유색 물체) */
export const WHITE_REF_MAX_DUV = 0.02;
/** 형광등 판정 Duv 기준 */
export const FLUORESCENT_DUV = 0.006;
const fromMired = (m: number) => 1e6 / Math.max(50, m);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** 선형 평균 RGB 누적기 */
class LinAcc {
  r = 0;
  g = 0;
  b = 0;
  n = 0;
  add(r: number, g: number, b: number) {
    this.r += srgb8ToLinear(r);
    this.g += srgb8ToLinear(g);
    this.b += srgb8ToLinear(b);
    this.n++;
  }
  /** 평균 sRGB(0..255) */
  rgb(): Rgb {
    const n = Math.max(1, this.n);
    return { r: clamp(linearChannelToSrgb(this.r / n)) * 255, g: clamp(linearChannelToSrgb(this.g / n)) * 255, b: clamp(linearChannelToSrgb(this.b / n)) * 255 };
  }
  cct(): number {
    return this.n ? rgbToCct(this.rgb()) : NaN;
  }
}

function histPercentile(hist: Uint32Array, total: number, p: number): number {
  const target = p * total;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return hist.length - 1;
}

export function classifyBrightness(medianLuma: number, clippedHighlights: number): BrightnessLevel {
  // 흰 벽·밝은 배경은 중앙값이 높아도 포화가 거의 없다. 포화가 함께 있을 때만 과다 노출로 본다.
  if (clippedHighlights > 0.3 || (medianLuma > 215 && clippedHighlights > 0.05)) return 'too-bright';
  if (medianLuma < 40) return 'too-dark';
  if (medianLuma < 75) return 'dim';
  if (medianLuma > 185) return 'bright';
  return 'normal';
}

export function classifyLightSource(p: { cctK: number; tint: number; setting: 'indoor' | 'outdoor' | 'unknown'; mixed: boolean; meanLuma: number }): LightSource {
  if (!Number.isFinite(p.cctK)) return 'unknown';
  if (p.mixed) return 'mixed';
  if (p.tint > FLUORESCENT_DUV && p.cctK >= 3800 && p.setting !== 'outdoor') return 'fluorescent';
  if (p.cctK < 3300) return 'incandescent';
  if (p.cctK < 4300) return 'warm-led';
  if (p.cctK < 5300) return p.setting === 'outdoor' ? 'daylight' : 'neutral-led';
  if (p.cctK < 6800) return p.setting === 'outdoor' || (p.setting === 'unknown' && p.meanLuma > 150) ? 'daylight' : 'cool-led';
  if (p.setting === 'outdoor') return p.meanLuma > 150 ? 'overcast' : 'shade';
  return 'cool-led';
}

/** 게인 방향으로 장면 색 치우침 이름 (게인의 역 = 장면 캐스트). 방향이 뚜렷하지 않으면 null */
export function castNameKo(gains: WbGains): string | null {
  const castR = Math.log(1 / gains.r);
  const castB = Math.log(1 / gains.b);
  if (castR > 0.08 && castB < 0) return '노란·주황빛';
  if (castB > 0.08 && castR < 0) return '푸른빛';
  if (castR < -0.05 && castB < -0.05) return '초록빛';
  if (castR > 0.05 && castB > 0.05) return '자줏빛';
  return null;
}

/** 색 치우침 경고 문구 */
export function colorCastMessage(gains: WbGains): string {
  const name = castNameKo(gains);
  return `${name ? `화면 전체가 ${name}으로` : '화면 전체 색이 한쪽으로'} 치우쳐 있습니다. 보정량이 커서 정확도가 낮아질 수 있습니다.`;
}

/**
 * 기준 백색(흰 종이)을 사진에서 지정한 위치 주변 원형 영역 평균으로 측정한다.
 * 포화(253↑) 픽셀은 제외하고, 밝기/채도로 흰색 여부를 검증한다.
 */
export function measureWhiteReference(img: ImageLike, point: { x: number; y: number }, radiusFrac = 0.025): WhiteReferenceResult {
  const cx = point.x * img.width;
  const cy = point.y * img.height;
  const rad = Math.max(3, radiusFrac * Math.min(img.width, img.height));
  const acc = new LinAcc();
  let clipped = 0;
  for (let y = Math.max(0, Math.floor(cy - rad)); y <= Math.min(img.height - 1, Math.ceil(cy + rad)); y++) {
    for (let x = Math.max(0, Math.floor(cx - rad)); x <= Math.min(img.width - 1, Math.ceil(cx + rad)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > rad * rad) continue;
      const i = (y * img.width + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      if (r >= 253 || g >= 253 || b >= 253) {
        clipped++;
        continue;
      }
      acc.add(r, g, b);
    }
  }
  if (acc.n < 20) {
    return { ok: false, rgb: null, cctK: null, gains: null, pixelCount: acc.n, message: clipped > 0 ? '선택한 곳이 하얗게 날아갔습니다. 조금 덜 밝은 흰 부분을 눌러 주세요.' : '선택한 영역이 너무 작습니다.' };
  }
  const rgb = acc.rgb();
  const L = luma8(rgb.r, rgb.g, rgb.b);
  const s = sat(rgb.r, rgb.g, rgb.b);
  if (L < 110) return { ok: false, rgb, cctK: null, gains: null, pixelCount: acc.n, message: '선택한 곳이 너무 어둡습니다. 흰 종이를 빛이 닿는 곳에 두고 눌러 주세요.' };
  // 흰 종이는 조명 색을 띠므로 채도 대신 "광원 궤적 근처인지(|Duv|)"로 유색 물체를 걸러낸다
  const lin = { r: srgb8ToLinear(Math.round(rgb.r)), g: srgb8ToLinear(Math.round(rgb.g)), b: srgb8ToLinear(Math.round(rgb.b)) };
  const cct = rgbToCct(rgb);
  const duv = duvOf(lin, cct);
  if (s > 0.75 || !(cct >= 1800 && cct <= 12000) || Math.abs(duv) > WHITE_REF_MAX_DUV) {
    return { ok: false, rgb, cctK: null, gains: null, pixelCount: acc.n, message: '선택한 곳은 흰색이 아닌 유색 물체로 보입니다. 흰 종이를 눌러 주세요.' };
  }
  const lim = (v: number) => clamp(v, 1 / 2.5, 2.5);
  const gains = { r: lim(lin.g / Math.max(1e-6, lin.r)), g: 1, b: lim(lin.g / Math.max(1e-6, lin.b)) };
  return { ok: true, rgb, cctK: Math.round(cct / 10) * 10, gains, pixelCount: acc.n, message: `기준 백색 ${acc.n}px로 보정합니다.` };
}

/**
 * 환경(또는 얼굴 사진 배경) 픽셀 → 환경 분석. 결정적(같은 입력 = 같은 출력).
 */
export function analyzeEnvironmentPixels(img: ImageLike, opts: EnvironmentPixelOptions = {}): EnvironmentPixelResult {
  const { width: W, height: H } = img;
  const maxSamples = opts.maxSamples ?? 60_000;
  const step = Math.max(1, Math.floor(Math.sqrt((W * H) / maxSamples)));
  const ex = opts.exclude;
  const mask = opts.mask;

  const hist = new Uint32Array(256);
  const centerHist = new Uint32Array(256);
  let total = 0;
  let centerTotal = 0;
  let clippedHi = 0;
  let clippedLo = 0;
  let bright = 0;
  let satSum = 0;
  let topTotal = 0;
  let sky = 0;
  let veg = 0;
  let lumaSum = 0;
  const gray = new LinAcc();
  const tiles = Array.from({ length: 9 }, () => new LinAcc());
  const bins: { l: number; r: number; g: number; b: number }[] = [];

  for (let y = 0; y < H; y += step) {
    const ny = (y + 0.5) / H;
    for (let x = 0; x < W; x += step) {
      const nx = (x + 0.5) / W;
      if (ex && nx >= ex.x && nx <= ex.x + ex.w && ny >= ex.y && ny <= ex.y + ex.h) continue;
      if (mask) {
        const mx = Math.min(mask.width - 1, Math.floor(nx * mask.width));
        const my = Math.min(mask.height - 1, Math.floor(ny * mask.height));
        if (mask.data[my * mask.width + mx] !== 0) continue;
      }
      const i = (y * W + x) * 4;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const L = luma8(r, g, b);
      const Li = Math.min(255, Math.max(0, Math.round(L)));
      const s = sat(r, g, b);
      hist[Li]++;
      total++;
      lumaSum += L;
      satSum += s;
      if (Math.max(r, g, b) >= 252) clippedHi++;
      if (L <= 10) clippedLo++;
      if (L > 235) bright++;
      if (nx > 0.3 && nx < 0.7 && ny > 0.3 && ny < 0.7) {
        centerHist[Li]++;
        centerTotal++;
      }
      if (L >= 20 && L <= 240) gray.add(r, g, b);
      if (L >= 40 && L <= 235 && s < TILE_MAX_SAT) {
        const t = Math.min(2, Math.floor(nx * 3)) + 3 * Math.min(2, Math.floor(ny * 3));
        tiles[t].add(r, g, b);
      }
      if (ny < 1 / 3) {
        topTotal++;
        if (b > r + 12 && b >= g && L > 110 && s > 0.15) sky++;
      }
      if (g > r + 8 && g > b + 8 && L > 40 && L < 200 && s > 0.2) veg++;
      if (L < 250) bins.push({ l: L, r, g, b });
    }
  }

  const n = Math.max(1, total);
  const meanLuma = lumaSum / n;
  const medianLuma = histPercentile(hist, n, 0.5);
  const p5 = histPercentile(hist, n, 0.05);
  const p90 = histPercentile(hist, n, 0.9);
  const p95 = histPercentile(hist, n, 0.95);
  const clippedHighlights = clippedHi / n;
  const clippedShadows = clippedLo / n;
  const brightFraction = bright / n;
  const centerMedianLuma = centerTotal ? histPercentile(centerHist, centerTotal, 0.5) : medianLuma;
  const meanSaturation = satSum / n;
  const skyFraction = topTotal ? sky / topTotal : 0;
  const vegetationFraction = veg / n;

  // gray-world 게인 (선형, g=1)
  const lim = (v: number) => clamp(v, 1 / 1.8, 1.8);
  const gm = gray.n ? { r: gray.r / gray.n, g: gray.g / gray.n, b: gray.b / gray.n } : { r: 1, g: 1, b: 1 };
  const grayWorldGains: WbGains = gray.n && gm.r > 0 && gm.b > 0 ? { r: lim(gm.g / gm.r), g: 1, b: lim(gm.g / gm.b) } : { r: 1, g: 1, b: 1 };
  // 색온도는 클램프 전 평균 색도에서 (게인은 과보정 방지를 위해 1.8배로 제한)
  const grayWorldCct = gray.n && gm.r > 0 && gm.b > 0 ? xyToCctMcCamy(xyzToXy(linearToXyz(gm))) : gainsToCct(grayWorldGains);
  const tint = gray.n ? duvOf(gm, grayWorldCct) : 0;

  // white-patch: 상위 10% 밝기 + 저채도 + 미포화
  const wp = new LinAcc();
  for (const p of bins) if (p.l >= p90 && sat(p.r, p.g, p.b) < WHITE_PATCH_MAX_SAT) wp.add(p.r, p.g, p.b);
  const whitePatchCct = wp.n >= 50 ? wp.cct() : null;

  let cctK = grayWorldCct;
  let cctConfidence = 0.7;
  if (whitePatchCct !== null && Number.isFinite(whitePatchCct)) {
    const dm = Math.abs(toMired(grayWorldCct) - toMired(whitePatchCct));
    cctK = fromMired(0.6 * toMired(grayWorldCct) + 0.4 * toMired(whitePatchCct));
    if (dm > 50) cctConfidence -= 0.3;
    else if (dm < 20) cctConfidence += 0.15;
  } else cctConfidence -= 0.15;
  if (meanSaturation > 0.35) cctConfidence -= 0.2;
  if (total < 2000) cctConfidence -= 0.2;

  // 혼합광
  const minTile = Math.max(30, total * 0.01);
  const tileCcts = tiles.filter((t) => t.n >= minTile).map((t) => t.cct()).filter((v) => Number.isFinite(v));
  const mireds = tileCcts.map(toMired);
  const mMean = mireds.reduce((s, v) => s + v, 0) / Math.max(1, mireds.length);
  const mixedMiredStd = mireds.length >= 3 ? Math.sqrt(mireds.reduce((s, v) => s + (v - mMean) ** 2, 0) / (mireds.length - 1)) : 0;
  const mixedRange = mireds.length ? Math.max(...mireds) - Math.min(...mireds) : 0;
  const mixed = mixedMiredStd > 35 && mixedRange > 90;

  // 실내/실외
  let outdoorScore = -0.15 + 2.2 * skyFraction + 1.2 * vegetationFraction;
  if (cctK >= 5500) outdoorScore += 0.25;
  else if (cctK < 4300) outdoorScore -= 0.45;
  if (tint > FLUORESCENT_DUV) outdoorScore -= 0.3;
  if (meanLuma > 150 && clippedHighlights > 0.05) outdoorScore += 0.15;
  if (mixed) outdoorScore -= 0.1;
  const setting: 'indoor' | 'outdoor' | 'unknown' = outdoorScore > 0.25 ? 'outdoor' : outdoorScore < -0.15 ? 'indoor' : 'unknown';
  const settingConfidence = setting === 'unknown' ? 0.3 : clamp(0.5 + Math.abs(outdoorScore) * 0.8, 0.3, 0.9);

  // 기준 백색
  let whiteReference: WhiteReferenceResult | null = null;
  if (opts.whitePoint) {
    whiteReference = measureWhiteReference(img, opts.whitePoint);
    if (whiteReference.ok && whiteReference.cctK) {
      cctK = whiteReference.cctK;
      cctConfidence = 0.9;
    }
  }
  cctConfidence = clamp(cctConfidence, 0.1, 0.95);
  cctK = clamp(Math.round(cctK / 10) * 10, 1800, 12000);

  const level = classifyBrightness(medianLuma, clippedHighlights);
  const lightSource = classifyLightSource({ cctK, tint, setting, mixed, meanLuma });

  // 경고
  const warnings: Issue[] = [];
  let q = 1;
  if (level === 'too-dark') {
    warnings.push({ code: 'too-dark', severity: 'error', message: '너무 어둡습니다. 조명을 켜거나 창가로 이동해 주세요.' });
    q -= 0.5;
  } else if (level === 'dim') {
    warnings.push({ code: 'dim', severity: 'warn', message: '조금 어둡습니다. 더 밝은 곳에서 촬영하면 피부색이 정확해집니다.' });
    q -= 0.2;
  } else if (level === 'too-bright') {
    warnings.push({ code: 'too-bright', severity: 'error', message: '빛이 너무 강해 하얗게 날아간 부분이 많습니다. 직사광을 피해 주세요.' });
    q -= 0.4;
  } else if (level === 'bright') q -= 0.05;

  let backlight = false;
  if (opts.subjectLuma !== null && opts.subjectLuma !== undefined) {
    backlight = medianLuma > 150 && opts.subjectLuma < medianLuma * 0.6;
  } else {
    backlight = brightFraction > 0.12 && centerMedianLuma < 110 && centerMedianLuma < p90 * 0.55;
  }
  if (backlight) {
    warnings.push({ code: 'backlight', severity: 'error', message: '역광입니다. 빛이 얼굴 정면에서 오도록 창이나 조명을 마주 보고 서 주세요.' });
    q -= 0.35;
  }
  if (mixed) {
    const spread = tileCcts.length ? Math.round((Math.max(...tileCcts) - Math.min(...tileCcts)) / 100) * 100 : 0;
    warnings.push({ code: 'mixed-light', severity: 'warn', message: `서로 다른 색의 조명이 섞여 있습니다(부분별 색온도 차 약 ${spread.toLocaleString('ko-KR')}K). 한 종류의 조명 아래에서 촬영해 주세요.` });
    q -= 0.25;
  }
  const castMagnitude = gainsMagnitude(grayWorldGains);
  if (castMagnitude > 20) {
    warnings.push({ code: 'color-cast', severity: 'warn', message: colorCastMessage(grayWorldGains) });
    q -= Math.min(0.25, castMagnitude / 100);
  }
  if (cctK < 3600 && !mixed) {
    warnings.push({ code: 'warm-light', severity: 'warn', message: '전구색 조명은 피부를 노랗게 보이게 합니다. 자연광이나 주광색 조명을 권장합니다.' });
    q -= 0.15;
  }
  if (!backlight && p95 - p5 > 215) {
    warnings.push({ code: 'high-contrast', severity: 'warn', message: '밝고 어두운 부분 차이가 큽니다. 얼굴에 짙은 그림자가 생기지 않는지 확인해 주세요.' });
    q -= 0.1;
  }
  if (whiteReference && !whiteReference.ok) warnings.push({ code: 'white-ref-invalid', severity: 'warn', message: whiteReference.message });
  q *= 0.85 + 0.15 * cctConfidence;

  // 근거(정보)
  warnings.push({
    code: 'evidence-cct',
    severity: 'info',
    message: whiteReference?.ok
      ? `흰 종이 기준 색온도 ${cctK.toLocaleString('ko-KR')}K`
      : `장면 평균색 ${Math.round(grayWorldCct).toLocaleString('ko-KR')}K${whitePatchCct ? ` · 밝은 무채색 ${Math.round(whitePatchCct).toLocaleString('ko-KR')}K` : ''} → ${cctK.toLocaleString('ko-KR')}K`,
  });
  warnings.push({ code: 'evidence-brightness', severity: 'info', message: `밝기 중앙값 ${medianLuma}/255 · 포화 ${(clippedHighlights * 100).toFixed(1)}% · 암부 ${(clippedShadows * 100).toFixed(1)}%` });
  warnings.push({
    code: 'evidence-setting',
    severity: 'info',
    message: `하늘색 ${(skyFraction * 100).toFixed(0)}% · 식물색 ${(vegetationFraction * 100).toFixed(0)}% · 녹색 편향 Duv ${tint.toFixed(4)} → ${SETTING_LABEL_KO[setting]}`,
  });

  const environment: EnvironmentCore = {
    lightSource,
    lightSourceLabel: LIGHT_SOURCE_LABEL_KO[lightSource],
    cctK,
    cctConfidence: r2(cctConfidence),
    brightness: {
      meanLuma: Math.round(meanLuma * 10) / 10,
      medianLuma,
      clippedHighlights: Math.round(clippedHighlights * 1000) / 1000,
      clippedShadows: Math.round(clippedShadows * 1000) / 1000,
      level,
      label: BRIGHTNESS_LABEL_KO[level],
    },
    setting,
    settingLabel: SETTING_LABEL_KO[setting],
    settingConfidence: r2(settingConfidence),
    grayWorldGains: { r: Math.round(grayWorldGains.r * 1000) / 1000, g: 1, b: Math.round(grayWorldGains.b * 1000) / 1000 },
    ...(whiteReference?.ok && whiteReference.rgb ? { referenceWhite: describeColor(whiteReference.rgb) } : {}),
    warnings,
    retakeRecommended: warnings.some((w) => w.severity === 'error'),
    lightingQuality: r2(clamp(q, 0.05, 1)),
  };

  return {
    environment,
    metrics: {
      sampleCount: total,
      grayWorldCct: Math.round(grayWorldCct),
      whitePatchCct: whitePatchCct === null ? null : Math.round(whitePatchCct),
      tint: Math.round(tint * 10000) / 10000,
      meanSaturation: r2(meanSaturation),
      skyFraction: r2(skyFraction),
      vegetationFraction: r2(vegetationFraction),
      tileCcts: tileCcts.map((v) => Math.round(v)),
      mixedMiredStd: Math.round(mixedMiredStd),
      dynamicRange: p95 - p5,
      brightFraction: r2(brightFraction),
      centerMedianLuma,
      outdoorScore: r2(outdoorScore),
      castMagnitude: Math.round(castMagnitude * 10) / 10,
    },
    whiteReference,
  };
}

/** 프레임 밝기만 빠르게 (실시간 체크용, 다운샘플 RGBA) */
export function quickBrightness(img: ImageLike): { meanLuma: number; level: BrightnessLevel; clipped: number } {
  const hist = new Uint32Array(256);
  let n = 0;
  let clipped = 0;
  let sum = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const L = luma8(img.data[i], img.data[i + 1], img.data[i + 2]);
    hist[Math.min(255, Math.round(L))]++;
    sum += L;
    if (Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) >= 252) clipped++;
    n++;
  }
  const med = histPercentile(hist, Math.max(1, n), 0.5);
  return { meanLuma: sum / Math.max(1, n), level: classifyBrightness(med, clipped / Math.max(1, n)), clipped: clipped / Math.max(1, n) };
}
