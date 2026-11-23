// 서버 전용 함수 (DB/AI). "@celeber/camera-face/server"
// 저장 이미지(uploads)를 sharp로 다시 읽어 분석하므로, 클라이언트가 보낸 값은 랜드마크/마스크/품질 스냅샷뿐이다.
import 'server-only';
import { z } from 'zod';
import type { EnvironmentAnalysis, FaceAiDescription, FaceAnalysis, FaceSession } from '@celeber/core/contracts';
import { EnvironmentAnalysisSchema } from '@celeber/core/contracts';
import { callVisionStructured } from '@celeber/core/server/ai';
import { faceSessions, newId, nowIso } from '@celeber/core/server/db';
import { getUpload, readUploadPixels, toImageRef } from '@celeber/core/server/uploads';
import {
  type AnalyzeRequest,
  type AnalyzeResponse,
  type EnvironmentRequest,
  type EnvironmentResponse,
  type FaceSessionSummary,
  LIGHT_SOURCE_LABEL_KO,
  SETTING_LABEL_KO,
  analyzeEnvironmentPixels,
  classifyLightSource,
  decodeMask,
  ruleBasedDescription,
  runFaceAnalysis,
  sessionLabel,
  summarizeSession,
  withAiDescription,
} from '../lib';

/** Route Handler에서 상태 코드로 바꿀 오류 */
export class FaceHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 분석용 픽셀 해상도(긴 변) */
const ANALYSIS_EDGE = 1280;

/* ================================================================== AI 스키마 (얕고 단순하게) */

const EnvAiSchema = z.object({
  setting: z.enum(['indoor', 'outdoor', 'unknown']),
  lightSourceGuess: z.string(),
  notes: z.string(),
});

const FaceAiSchema = z.object({
  hairStyle: z.string(),
  hairColorDescription: z.string(),
  features: z.array(z.string()),
  impression: z.string(),
  environmentNotes: z.string(),
  presentation: z.enum(['male', 'female', 'unspecified']),
});

/* ================================================================== 세션 */

function loadSession(id: string | undefined): FaceSession | null {
  if (!id) return null;
  try {
    return faceSessions.get(id);
  } catch {
    return null;
  }
}

function saveSession(s: FaceSession): void {
  const a = s.analysis;
  faceSessions.upsert({
    id: s.id,
    data: s,
    cols: {
      status: s.status,
      is_mock: a?.isMock ?? false,
      front_upload_id: a?.front.image.uploadId ?? s.partial?.front?.image.uploadId ?? null,
      label: s.label ?? null,
    },
  });
}

/* ================================================================== 환경 */

export async function analyzeEnvironmentUpload(req: EnvironmentRequest): Promise<EnvironmentResponse> {
  const rec = getUpload(req.uploadId);
  if (!rec) throw new FaceHttpError(404, 'upload_not_found', '환경 사진을 찾을 수 없습니다. 다시 촬영해 주세요.');
  const px = await readUploadPixels(req.uploadId, ANALYSIS_EDGE);
  if (!px) throw new FaceHttpError(422, 'unreadable', '이미지를 읽을 수 없습니다.');
  const r = analyzeEnvironmentPixels(px, { whitePoint: req.whitePoint ?? null });
  const now = nowIso();
  const prevSession = loadSession(req.sessionId);
  const prevEnv = prevSession?.partial?.environment ?? prevSession?.analysis?.environment;
  const samePhoto = prevEnv?.image?.uploadId === req.uploadId;

  let env: EnvironmentAnalysis = { ...r.environment, image: toImageRef(rec), capturedAt: now, source: 'rules' };
  let aiSource: EnvironmentResponse['aiSource'] = 'skipped';
  let warning: string | undefined;

  if (req.skipAi && samePhoto && prevEnv?.aiNotes) {
    env = { ...env, aiNotes: prevEnv.aiNotes, source: prevEnv.source };
    if (prevEnv.source === 'hybrid' && prevEnv.setting !== env.setting && env.settingConfidence < 0.6) {
      env = { ...env, setting: prevEnv.setting, settingLabel: prevEnv.settingLabel, settingConfidence: prevEnv.settingConfidence };
    }
  } else if (!req.skipAi) {
    const ai = await callVisionStructured({
      schema: EnvAiSchema,
      mock: { setting: 'unknown' as const, lightSourceGuess: '', notes: '' },
      system: '피부색 촬영 전에 찍은 주변 환경(조명) 사진을 분석합니다. 실내/실외, 주된 광원, 피부색 측정을 방해할 조명 요소만 판단합니다.',
      prompt: [
        `규칙 기반 측정값: ${JSON.stringify({ cctK: env.cctK, brightness: env.brightness.label, setting: env.setting, settingConfidence: env.settingConfidence, lightSource: env.lightSourceLabel, warnings: env.warnings.filter((w) => w.severity !== 'info').map((w) => w.code) })}`,
        '사진을 보고 답하세요.',
        '- setting: indoor | outdoor | unknown (창밖 풍경만 보이는 실내는 indoor)',
        '- lightSourceGuess: 주된 광원을 한국어 짧은 구로 (예: 창가 자연광, 천장 형광등, 전구색 스탠드)',
        '- notes: 피부색 촬영에 영향을 줄 요소를 한국어 1~2문장으로 (역광, 혼합광, 색 있는 벽 반사 등). 문제가 없으면 그렇게 쓰세요.',
      ].join('\n'),
      images: [{ uploadId: req.uploadId, label: '환경 사진' }],
      maxTokens: 8000,
      effort: 'low',
      label: 'face/environment',
    });
    aiSource = ai.source;
    warning = ai.warning;
    if (ai.source === 'ai') {
      const notes = [ai.data.lightSourceGuess && `광원: ${ai.data.lightSourceGuess}`, ai.data.notes].filter(Boolean).join(' · ');
      env = { ...env, aiNotes: notes, source: 'hybrid' };
      if (ai.data.setting !== 'unknown' && (env.setting === 'unknown' || env.settingConfidence < 0.6) && ai.data.setting !== env.setting) {
        const setting = ai.data.setting;
        const lightSource = classifyLightSource({ cctK: env.cctK, tint: r.metrics.tint, setting, mixed: env.lightSource === 'mixed', meanLuma: env.brightness.meanLuma });
        env = { ...env, setting, settingLabel: SETTING_LABEL_KO[setting], settingConfidence: 0.7, lightSource, lightSourceLabel: LIGHT_SOURCE_LABEL_KO[lightSource] };
      }
    }
  }
  env = EnvironmentAnalysisSchema.parse(env);

  // 세션: 기존 in-progress 갱신 또는 새로 생성
  const id = prevSession && prevSession.status === 'in-progress' ? prevSession.id : newId('face');
  const session: FaceSession = {
    id,
    createdAt: prevSession && prevSession.status === 'in-progress' ? prevSession.createdAt : now,
    updatedAt: now,
    status: 'in-progress',
    label: sessionLabel(prevSession?.createdAt ?? now, env),
    partial: { ...(prevSession?.status === 'in-progress' ? prevSession.partial : {}), environment: env },
  };
  saveSession(session);
  return {
    sessionId: id,
    environment: env,
    metrics: r.metrics,
    whiteReference: r.whiteReference ? { ok: r.whiteReference.ok, message: r.whiteReference.message } : null,
    aiSource,
    ...(warning ? { warning } : {}),
  };
}

/* ================================================================== 얼굴 분석 */

async function describeWithAi(base: FaceAnalysis, frontUploadId: string, sideUploadId: string | null, skip: boolean): Promise<{ ai: FaceAiDescription; source: 'ai' | 'mock' | 'skipped'; warning?: string }> {
  const fallback = ruleBasedDescription(base);
  if (skip) return { ai: fallback, source: 'skipped' };
  const g = base.geometry;
  const measured = {
    skin: { hex: base.skin.corrected.hex, lab: base.skin.corrected.lab, ita: base.skin.corrected.ita },
    hair: base.featureColors.hair?.hex ?? null,
    eyes: base.featureColors.eyes?.hex ?? null,
    faceShape: g.shapeLabel,
    ratios: { lengthToWidth: g.ratios.lengthToWidth, foreheadToCheekbone: g.ratios.foreheadToCheekbone, jawToCheekbone: g.ratios.jawToCheekbone, thirds: g.ratios.thirds },
    profile: g.profile ? { convexity: g.profile.convexityLabel, eLine: g.profile.eLine?.label } : null,
    environment: { setting: base.environment.settingLabel, light: base.environment.lightSourceLabel, cctK: base.environment.cctK },
  };
  const r = await callVisionStructured({
    schema: FaceAiSchema,
    mock: () => ({ ...fallback, environmentNotes: fallback.environmentNotes ?? '', presentation: 'unspecified' as const }),
    system: [
      '퍼스널컬러/스타일 분석 앱을 위해 얼굴 사진의 관찰 가능한 특징을 서술합니다.',
      '수치 측정은 이미 끝났으니, 측정값과 모순되지 않게 사진에서 보이는 것만 짧게 서술하세요.',
      '외모를 평가하거나 점수 매기지 말고, 중립적인 관찰 언어를 쓰세요.',
    ].join('\n'),
    prompt: [
      `측정값: ${JSON.stringify(measured)}`,
      '다음 항목을 한국어로 답하세요.',
      '- hairStyle: 헤어스타일(길이, 앞머리, 가르마, 웨이브/질감)을 한 문장으로',
      '- hairColorDescription: 헤어 색을 한 문장으로 (염색 여부가 보이면 포함)',
      '- features: 이목구비 관찰 3~5개 (각 한 문장, 측정 비율과 모순 금지)',
      '- impression: 사진에서 받는 전체 인상 한 문장 (외모 평가 금지)',
      '- environmentNotes: 사진 속 조명이 피부색 표현에 준 영향 한 문장',
      '- presentation: 사진 속 헤어·의상 스타일 표현을 기준으로 한 리포트 변형 기본값 (male | female | unspecified). 성별이나 신원을 판단하는 것이 아니며, 스타일 단서가 애매하면 unspecified',
    ].join('\n'),
    images: [{ uploadId: frontUploadId, label: '정면 얼굴' }, ...(sideUploadId ? [{ uploadId: sideUploadId, label: '측면 얼굴' }] : [])],
    maxTokens: 12000,
    effort: 'low',
    label: 'face/describe',
  });
  return { ai: r.data, source: r.source, ...(r.warning ? { warning: r.warning } : {}) };
}

export async function analyzeFaceCapture(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const now = nowIso();
  const frontRec = getUpload(req.front.uploadId);
  if (!frontRec) throw new FaceHttpError(404, 'upload_not_found', '정면 사진을 찾을 수 없습니다. 다시 촬영해 주세요.');
  const frontPx = await readUploadPixels(req.front.uploadId, ANALYSIS_EDGE);
  if (!frontPx) throw new FaceHttpError(422, 'unreadable', '정면 사진을 읽을 수 없습니다.');
  let side = null;
  if (req.side) {
    // 측면 업로드가 없거나 못 읽으면 '건너뜀'으로 기록하지 않고 오류로 돌려준다.
    const sideRec = getUpload(req.side.uploadId);
    if (!sideRec) throw new FaceHttpError(404, 'upload_not_found', '측면 사진을 찾을 수 없습니다. 다시 촬영해 주세요.');
    const sidePx = await readUploadPixels(req.side.uploadId, ANALYSIS_EDGE);
    if (!sidePx) throw new FaceHttpError(422, 'unreadable', '측면 사진을 읽을 수 없습니다.');
    side = {
      image: toImageRef(sideRec),
      capturedAt: req.side.capturedAt ?? now,
      landmarks: req.side.landmarks,
      yawDeg: req.side.yawDeg,
      pitchDeg: req.side.pitchDeg,
      rollDeg: req.side.rollDeg,
      quality: req.side.quality,
      fromUpload: req.side.fromUpload,
      mask: decodeMask(req.side.mask),
      pixels: sidePx,
    };
  }
  const prev = loadSession(req.sessionId);
  const environment = prev?.partial?.environment ?? null;

  let base: FaceAnalysis;
  try {
    base = runFaceAnalysis({
      environment,
      front: {
        image: toImageRef(frontRec),
        capturedAt: req.front.capturedAt ?? now,
        landmarks: req.front.landmarks,
        yawDeg: req.front.yawDeg,
        pitchDeg: req.front.pitchDeg,
        rollDeg: req.front.rollDeg,
        quality: req.front.quality,
        fromUpload: req.front.fromUpload,
        mask: decodeMask(req.front.mask),
        pixels: frontPx,
      },
      side,
      aiSource: 'skipped',
      now,
    });
  } catch (e) {
    throw new FaceHttpError(422, 'analysis_failed', (e as Error).message);
  }

  const d = await describeWithAi(base, req.front.uploadId, side ? req.side!.uploadId : null, !!req.skipAi);
  const analysis = withAiDescription(base, d.ai, d.source);
  const id = prev ? prev.id : newId('face');
  const session: FaceSession = {
    id,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    status: 'complete',
    label: req.label ?? sessionLabel(prev?.createdAt ?? now, analysis.environment),
    analysis,
    partial: { environment: analysis.environment, front: analysis.front, ...(analysis.side ? { side: analysis.side } : {}) },
  };
  saveSession(session);
  return { sessionId: id, session, analysis, aiSource: d.source, ...(d.warning ? { warning: d.warning } : {}) };
}

/* ================================================================== 조회/삭제 */

export function listFaceSessions(opts: { status?: FaceSession['status']; limit?: number } = {}): FaceSessionSummary[] {
  const rows = faceSessions.list({ ...(opts.status ? { where: { status: opts.status } } : {}), order: 'created_at DESC', limit: opts.limit ?? 50 });
  return rows.map((r) => summarizeSession(r.data));
}

export function getFaceSession(id: string): FaceSession | null {
  return loadSession(id);
}

/** 가장 최근 완료 세션의 FaceAnalysis (personal-color-report 기본 입력) */
export function getLatestFaceAnalysis(): { sessionId: string; analysis: FaceAnalysis } | null {
  const row = faceSessions.list({ where: { status: 'complete' }, order: 'created_at DESC', limit: 1 })[0];
  return row?.data.analysis ? { sessionId: row.id, analysis: row.data.analysis } : null;
}

/** 세션 행만 지운다. 업로드 이미지는 다른 앱/세션이 같은 파일(sha256 중복 제거)을 참조할 수 있어 남겨 둔다. */
export function deleteFaceSession(id: string): boolean {
  return faceSessions.delete(id);
}
export function deleteAllFaceSessions(): number {
  return faceSessions.deleteAll();
}
