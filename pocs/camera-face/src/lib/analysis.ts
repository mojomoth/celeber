/**
 * 최종 FaceAnalysis 조립 (순수 함수, 서버에서 저장 이미지 픽셀로 실행).
 * 환경 → 정면(피부색·부위색·윤곽) → 측면(프로필) → 경고 취합 → 계약 FaceAnalysis.
 */
import type { CaptureQuality, EnvironmentAnalysis, FaceAiDescription, FaceAnalysis, FaceCapture, FaceSession, ImageRef, Issue, ResultSource } from '@celeber/core/contracts';
import { FaceAnalysisSchema } from '@celeber/core/contracts';
import { type LandmarkLike, faceBoxFromLandmarks } from '@celeber/core/face';
import { analyzeEnvironmentPixels } from './environment';
import { buildFaceGeometry } from './geometry';
import type { CategoryMask } from './mask';
import { analyzeProfile } from './profile';
import { isProfileUsable } from './quality';
import { measureFaceColors } from './skin';
import type { FaceSessionSummary } from './api';

interface ImageLike {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface CaptureForAnalysis {
  image: ImageRef;
  capturedAt: string;
  landmarks: readonly LandmarkLike[] | null;
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  quality: CaptureQuality;
  fromUpload: boolean;
  mask?: CategoryMask | null;
  pixels: ImageLike;
}

export interface RunFaceAnalysisInput {
  environment?: EnvironmentAnalysis | null;
  front: CaptureForAnalysis & { landmarks: readonly LandmarkLike[] };
  side?: CaptureForAnalysis | null;
  ai?: FaceAiDescription | null;
  aiSource?: 'ai' | 'mock' | 'skipped';
  now?: string;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
const roundLandmarks = (lms: readonly LandmarkLike[]) => lms.map((p) => ({ x: r4(p.x), y: r4(p.y), z: r4(p.z ?? 0) }));

/** 환경 사진이 없을 때 정면 사진 배경으로 환경을 추정 */
export function environmentFromFacePhoto(front: CaptureForAnalysis & { landmarks: readonly LandmarkLike[] }, now: string): EnvironmentAnalysis {
  const box = faceBoxFromLandmarks(front.landmarks);
  const ex = { x: box.x - box.w * 0.15, y: box.y - box.h * 0.25, w: box.w * 1.3, h: box.h * 1.6 };
  const r = analyzeEnvironmentPixels(front.pixels, { exclude: ex, mask: front.mask ?? null, subjectLuma: front.quality.faceBrightness || null });
  return {
    ...r.environment,
    warnings: [{ code: 'env-from-face', severity: 'info', message: '환경 사진 없이 얼굴 사진의 배경으로 조명을 추정했습니다.' }, ...r.environment.warnings],
    capturedAt: front.capturedAt || now,
    source: 'rules',
  };
}

function toCapture(c: CaptureForAnalysis, pose: 'front' | 'side'): FaceCapture {
  return {
    pose,
    image: c.image,
    capturedAt: c.capturedAt,
    yawDeg: Math.round(c.yawDeg * 10) / 10,
    pitchDeg: Math.round(c.pitchDeg * 10) / 10,
    rollDeg: Math.round(c.rollDeg * 10) / 10,
    faceBox: c.landmarks ? (({ x, y, w, h }) => ({ x: r4(x), y: r4(y), w: r4(w), h: r4(h) }))(faceBoxFromLandmarks(c.landmarks)) : { x: 0, y: 0, w: 1, h: 1 },
    ...(c.landmarks ? { landmarks: roundLandmarks(c.landmarks) } : {}),
    quality: c.quality,
    fromUpload: c.fromUpload,
  };
}

export function runFaceAnalysis(inp: RunFaceAnalysisInput): FaceAnalysis {
  const now = inp.now ?? new Date().toISOString();
  const front = inp.front;
  const envFromFacePhoto = !inp.environment;
  const environment = inp.environment ?? environmentFromFacePhoto(front, now);
  const colors = measureFaceColors(front.pixels, front.landmarks, {
    mask: front.mask ?? null,
    environment,
    envFromFacePhoto,
    captureScore: front.quality.detectionScore,
    captureIssues: front.quality.issues,
  });
  const side = inp.side ?? null;
  // 정면에 가까운 사진(|yaw| < 35° 또는 yaw 오류)은 옆선을 만들지 않는다. 만들면 거짓 측정값이 저장된다.
  const notProfile = !!side?.landmarks && !isProfileUsable(side);
  const profile = side?.landmarks && !notProfile ? analyzeProfile({ landmarks: side.landmarks, width: side.pixels.width, height: side.pixels.height, yawDeg: side.yawDeg, mask: side.mask ?? null }) : null;
  const geometry = buildFaceGeometry(front.landmarks, front.pixels.width, front.pixels.height, profile);

  const warnings: Issue[] = [];
  for (const w of environment.warnings) if (w.severity !== 'info') warnings.push({ ...w, code: `env:${w.code}` });
  for (const w of front.quality.issues) warnings.push({ ...w, code: `front:${w.code}`, message: `정면 — ${w.message}` });
  if (side)
    for (const w of side.quality.issues) {
      if (notProfile && w.code === 'yaw') continue; // side:not-profile 경고가 대신한다
      warnings.push({ ...w, code: `side:${w.code}`, message: `측면 — ${w.message}`, severity: w.severity === 'error' ? 'warn' : w.severity });
    }
  if (!side) warnings.push({ code: 'side:skipped', severity: 'info', message: '측면 사진을 건너뛰어 옆선 분석이 없습니다.' });
  else if (notProfile)
    warnings.push({ code: 'side:not-profile', severity: 'warn', message: `측면 사진이 정면에 가까워(좌우 ${Math.round(Math.abs(side.yawDeg))}°) 옆선을 분석하지 않았습니다. 고개를 60° 정도 돌려 다시 촬영해 주세요.` });
  else if (!profile) warnings.push({ code: 'side:no-landmarks', severity: 'warn', message: '측면 사진에서 얼굴을 찾지 못해 옆선을 분석하지 못했습니다. 고개를 60° 정도만 돌려 다시 촬영해 보세요.' });
  if (colors.skin.confidence < LOW_SKIN_CONFIDENCE) warnings.push({ code: 'skin:low-confidence', severity: 'warn', message: `피부색 측정 신뢰도가 낮습니다(${Math.round(colors.skin.confidence * 100)}점). 자연광 정면에서 다시 촬영하면 정확해집니다.` });

  const aiSource = inp.aiSource ?? (inp.ai ? 'ai' : 'skipped');
  const source: ResultSource = aiSource === 'ai' ? 'hybrid' : 'rules';
  const analysis: FaceAnalysis = {
    version: 1,
    createdAt: now,
    environment,
    front: toCapture(front, 'front'),
    ...(side ? { side: toCapture(side, 'side') } : {}),
    skin: colors.skin,
    featureColors: colors.featureColors,
    geometry,
    ...(inp.ai ? { ai: inp.ai } : {}),
    source,
    isMock: aiSource === 'mock',
    warnings,
  };
  return FaceAnalysisSchema.parse(analysis);
}

/** 피부 측정 신뢰도가 이 값보다 낮으면 결과에 저신뢰 표시 */
export const LOW_SKIN_CONFIDENCE = 0.5;

/**
 * 결과 상단 '신뢰도 낮음' 표시의 이유. 정면 품질 오류(어두움·잘림·각도 등)나 낮은 피부 신뢰도가 있으면 채운다.
 * 빈 배열이면 표시하지 않는다.
 */
export function lowConfidenceReasons(a: Pick<FaceAnalysis, 'front' | 'skin'>): string[] {
  const reasons = a.front.quality.issues.filter((i) => i.severity === 'error').map((i) => `정면 — ${i.message}`);
  if (a.skin.confidence < LOW_SKIN_CONFIDENCE) reasons.push(`피부색 측정 신뢰도 ${Math.round(a.skin.confidence * 100)}점`);
  return reasons;
}

/* ------------------------------------------------------------------ 규칙 기반 서술 (AI Mock) */

function hairTone(l: number): string {
  if (l < 22) return '흑발에 가까운 매우 어두운 색';
  if (l < 32) return '어두운 흑갈색';
  if (l < 45) return '짙은 갈색';
  if (l < 60) return '중간 갈색';
  return '밝은 갈색~탈색 계열';
}

/**
 * 키가 없거나 AI 실패 시 쓰는 결정적 서술. 측정값만으로 만든다(사진 내용 추측 없음).
 */
export function ruleBasedDescription(a: Pick<FaceAnalysis, 'geometry' | 'featureColors' | 'skin' | 'environment'>): FaceAiDescription {
  const hair = a.featureColors.hair;
  const features = a.geometry.interpretations.slice(0, 4).map((i) => `${i.label}: ${i.comment}`);
  if (a.geometry.profile) features.push(`옆선: ${a.geometry.profile.convexityLabel}`);
  return {
    hairStyle: '헤어스타일 서술은 AI 분석이 가능할 때 제공됩니다.',
    hairColorDescription: hair ? `측정된 헤어 색 ${hair.hex} (L* ${hair.lab.l.toFixed(0)}) — ${hairTone(hair.lab.l)}` : '헤어 색을 측정하지 못했습니다.',
    features,
    impression: `${a.geometry.shapeLabel} 얼굴에 피부는 ${a.skin.corrected.nameKo}(ITA ${Math.round(a.skin.corrected.ita)}°) 톤으로 측정되었습니다.`,
    environmentNotes: `${a.environment.settingLabel} · ${a.environment.lightSourceLabel} · ${a.environment.cctK.toLocaleString('ko-KR')}K · 밝기 ${a.environment.brightness.label}`,
    presentation: 'unspecified',
  };
}

/* ------------------------------------------------------------------ 세션 표시 */

export function sessionLabel(createdAt: string, env?: Pick<EnvironmentAnalysis, 'lightSourceLabel'> | null): string {
  const d = new Date(createdAt);
  const fmt = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${fmt.format(d)}${env ? ` · ${env.lightSourceLabel}` : ''}`;
}

export function summarizeSession(s: FaceSession): FaceSessionSummary {
  const a = s.analysis;
  const env = a?.environment ?? s.partial?.environment;
  return {
    id: s.id,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    status: s.status,
    ...(s.label ? { label: s.label } : {}),
    isMock: a?.isMock ?? false,
    thumbnailUrl: a?.front.image.url ?? s.partial?.front?.image.url ?? env?.image?.url ?? null,
    skinHex: a?.skin.corrected.hex ?? null,
    skinName: a?.skin.corrected.nameKo ?? null,
    shapeLabel: a?.geometry.shapeLabel ?? null,
    lightSourceLabel: env?.lightSourceLabel ?? null,
    hasSide: !!a?.side,
  };
}

/** 규칙 기반 결과에 AI(또는 Mock) 서술을 합친다 */
export function withAiDescription(base: FaceAnalysis, ai: FaceAiDescription | null, aiSource: 'ai' | 'mock' | 'skipped'): FaceAnalysis {
  const { ai: _old, ...rest } = base;
  void _old;
  return FaceAnalysisSchema.parse({
    ...rest,
    ...(ai ? { ai } : {}),
    source: aiSource === 'ai' ? 'hybrid' : 'rules',
    isMock: aiSource === 'mock',
  });
}
