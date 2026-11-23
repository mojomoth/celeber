// 서버 전용 함수 (DB/AI). "@celeber/personal-color-report/server"
// 리포트 생성: face_sessions(+body_sessions) → 규칙 분류 → Claude 서술(키 없으면 템플릿) → 조립·검증 → personal_color_reports 저장.
import 'server-only';
import type { FaceAnalysis, Gender, PersonalColorReport, PersonalColorReportSummary } from '@celeber/core/contracts';
import { getToneProfile, TONES } from '@celeber/core/personal-color';
import { callVisionStructured } from '@celeber/core/server/ai';
import { kvDelete, kvGet, kvSet, newId, nowIso, personalColorReports } from '@celeber/core/server/db';
import { getFaceSession, listFaceSessions } from '@celeber/camera-face/server';
import { getBodySession, listBodySessions } from '@celeber/camera-body/server';
import {
  type AiNarrativeText,
  AiNarrativeTextSchema,
  type AiOpinion,
  AiOpinionSchema,
  type GenerateRequest,
  type GenerateResponse,
  type InputsResponse,
  type ReportNarrative,
  applyVariant,
  assembleReport,
  classifyFace,
  contrastText,
  groomingKeysText,
  mergeAiNarrative,
  polishAiText,
  ruleAiAgreement,
  summarizeReport,
  templateNarrative,
} from '../lib';

/** Route Handler에서 상태 코드로 바꿀 오류 */
export class ReportHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const narrativeKey = (id: string) => `pcr:narrative:${id}`;

/* ================================================================== AI 서술 */

const SYSTEM = [
  '퍼스널컬러 리포트의 서술을 한국어로 작성합니다.',
  '측정값(화이트밸런스 보정 피부 Lab·ITA·색상각·채도, 헤어/눈 명도)과 정면 사진을 근거로 씁니다.',
  '사진 속 인물이 누구인지 추정하거나 언급하지 않습니다. 외모 평가나 과장된 칭찬, 이모지, 마케팅 문구를 쓰지 않습니다.',
  '문장은 짧고 구체적으로: bullet은 20자 안팎, 설명은 2~3문장, TIP은 한 문장.',
].join('\n');

/** 사진에서 잰 값만 (규칙 분류기의 축·웜 비율·타입 점수는 넣지 않는다) */
function measuredValues(face: FaceAnalysis) {
  const s = face.skin.corrected;
  return {
    skin: { hex: s.hex, lab: s.lab, ita: s.ita, hueDeg: s.lch.h, chroma: s.lch.c, nameKo: s.nameKo },
    skinRawHex: face.skin.raw.hex,
    whiteBalance: { method: face.skin.whiteBalance.method, deltaE: face.skin.whiteBalance.deltaE },
    hair: face.featureColors.hair ? { hex: face.featureColors.hair.hex, lab: face.featureColors.hair.lab } : null,
    eyes: face.featureColors.eyes ? { hex: face.featureColors.eyes.hex, lab: face.featureColors.eyes.lab } : null,
    lips: face.featureColors.lips?.hex ?? null,
    environment: { light: face.environment.lightSourceLabel, cctK: face.environment.cctK, brightness: face.environment.brightness.label },
  };
}

/** AI 독립 판정: 규칙 판정(타입·보조 타입·점수·축)을 보여 주지 않고 사진과 측정값만 준다 */
function buildOpinionPrompt(face: FaceAnalysis): string {
  return [
    `측정값: ${JSON.stringify(measuredValues(face))}`,
    '',
    `사진과 측정값만 보고 12톤 중 가장 가까운 톤을 independentTone(${TONES.join(' | ')})으로, 언더톤을 independentUndertone으로, 근거를 independentRationale(1~2문장)로 쓰세요.`,
    '근거에는 사진에서 보이는 특징이나 측정값을 인용하고, 타입 이름은 "여름쿨 트루"처럼 계절과 세부 톤을 함께 씁니다.',
  ].join('\n');
}

function buildPrompt(face: FaceAnalysis, ruleTone: string, ruleSecondary: string, gender: Gender, cls: ReturnType<typeof classifyFace>): string {
  const p = getToneProfile(cls.tone);
  const measured = { ...measuredValues(face), axes0to100: cls.axes, warmPercent: cls.warmPercent };
  const topScores = Object.entries(cls.toneScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, v]) => `${t} ${Math.round(v * 100)}%`)
    .join(', ');
  const style = gender === 'male' ? '남성 스타일(셔츠·수트·넥타이·수염)' : gender === 'female' ? '여성 스타일(블라우스·아우터·스카프·메이크업)' : '성별 구분 없는 스타일';
  const groomingKeys = groomingKeysText(gender);
  return [
    `측정값: ${JSON.stringify(measured)}`,
    '',
    `리포트의 최종 타입은 측정 규칙 판정 ${ruleTone} (${p.nameKo} / ${p.nameEn}), 보조 타입 ${ruleSecondary} (${getToneProfile(cls.secondaryTone).nameKo})입니다. 아래 서술은 이 최종 타입 기준으로 쓰세요.`,
    `12톤 간 상대 적합도 상위: ${topScores}. 이 %는 판정 신뢰도가 아니므로 문장에 인용하지 마세요.`,
    '타입 이름은 "여름쿨 트루"처럼 계절과 세부 톤을 함께 쓰고, 색온도는 "3,290K"처럼 씁니다.',
    `리포트 스타일: ${style}.`,
    '- firstImpression: 첫인상 체크 bullet 4개',
    '- hashtags: #으로 시작하는 짧은 해시태그 4개',
    '- typeDescription: 타입 설명 2~3문장',
    '- analysisPoint: 측정값(색상각·b* 등)을 인용한 웜/쿨 분석 포인트 2문장',
    '- warmText / coolText: 웜 계열 / 쿨 계열 색을 얼굴 옆에 대었을 때의 변화 한 문장씩',
    '- featureSkinTone, featureValue, featureChroma, featureClarity: "밝은~중간 (라이트 톤)"처럼 짧은 값',
    `- featureContrast: 이 타입에 권장하는 코디 대비를 앞에, 측정값을 뒤에. 기준 문구: "${contrastText(cls, cls.tone)}"`,
    '- imageKeywords: 이미지 키워드 4개 (단어)',
    `- topsTip, outerTip, hairIntro, hairTip(피해야 할 헤어 컬러 포함): 한 문장씩. 추천 상의 색 예: ${p.tops.map((c) => c.name).join(', ')} / 아우터: ${p.outer.map((c) => c.name).join(', ')} / 헤어: ${p.hair.map((h) => h.color.name).join(', ')}`,
    `- grooming: ${groomingKeys} 순서로 한 줄 제안 4개`,
    '- avoidIntro: 비추천 스타일 소개 한 문장',
    '- todayActions: 오늘 바로 적용할 수 있는 구체적 행동 4개',
  ].join('\n');
}

async function generateNarrative(face: FaceAnalysis, frontUploadId: string, cls: ReturnType<typeof classifyFace>, gender: Gender, skipAi: boolean) {
  const base = templateNarrative(cls, face, gender);
  if (skipAi) return { narrative: base, source: 'rules' as const, aiOpinion: undefined, model: null, warning: undefined };
  const mock = (): AiNarrativeText => ({
    firstImpression: base.firstImpression,
    hashtags: base.hashtags,
    typeDescription: base.typeDescription,
    analysisPoint: base.analysisPoint,
    warmText: base.warmText,
    coolText: base.coolText,
    featureSkinTone: base.features.skinTone,
    featureValue: base.features.value,
    featureChroma: base.features.chroma,
    featureClarity: base.features.clarity,
    featureContrast: base.features.contrast,
    imageKeywords: base.features.imageKeywords.split(' / '),
    topsTip: base.topsTip,
    outerTip: base.outerTip,
    hairIntro: base.hairIntro,
    hairTip: base.hairTip,
    grooming: base.grooming,
    avoidIntro: base.avoidIntro,
    todayActions: base.todayActions,
  });
  const images = [{ uploadId: frontUploadId, label: '정면 얼굴 (피부색 측정에 쓴 사진)' }];
  // 독립 판정은 규칙 결과를 모르는 별도 호출로 받는다. 서술 호출과 서로 기다릴 필요가 없어 동시에 보낸다.
  const [op, r] = await Promise.all([
    callVisionStructured({
      schema: AiOpinionSchema,
      mock: (): AiOpinion => ({ independentTone: cls.tone, independentUndertone: cls.undertone, independentRationale: '' }),
      system: SYSTEM,
      prompt: buildOpinionPrompt(face),
      images,
      maxTokens: 8000,
      effort: 'medium',
      label: 'report/opinion',
    }),
    callVisionStructured({
      schema: AiNarrativeTextSchema,
      mock,
      system: SYSTEM,
      prompt: buildPrompt(face, cls.tone, cls.secondaryTone, gender, cls),
      images,
      maxTokens: 16000,
      effort: 'medium',
      label: 'report/narrative',
    }),
  ]);
  if (r.source !== 'ai') return { narrative: base, source: 'mock' as const, aiOpinion: undefined, model: r.model, warning: r.warning };
  // 독립 판정만 실패하면 서술은 쓰고 일치도는 반영하지 않는다
  const opinion = op.source === 'ai' ? op.data : null;
  return {
    narrative: mergeAiNarrative(base, r.data, { tone: cls.tone, secondaryTone: cls.secondaryTone }),
    source: 'ai' as const,
    aiOpinion: opinion
      ? {
          tone: opinion.independentTone,
          undertone: opinion.independentUndertone,
          rationale: polishAiText(opinion.independentRationale) || '근거 없음',
          agreesWithRules: ruleAiAgreement(cls.tone, opinion.independentTone) === true,
        }
      : undefined,
    model: r.model,
    warning: undefined,
  };
}

/* ================================================================== 생성 */

export async function generatePersonalColorReport(req: GenerateRequest): Promise<GenerateResponse> {
  const fs = getFaceSession(req.faceSessionId);
  if (!fs) throw new ReportHttpError(404, 'face_not_found', '얼굴 분석 세션을 찾을 수 없습니다.');
  if (fs.status !== 'complete' || !fs.analysis) throw new ReportHttpError(409, 'face_incomplete', '얼굴 분석이 끝나지 않은 세션입니다. 정면 촬영까지 마쳐 주세요.');
  const face = fs.analysis;

  let bodySessionId: string | null = null;
  let body = null;
  if (req.bodySessionId) {
    const b = getBodySession(req.bodySessionId);
    if (!b) throw new ReportHttpError(404, 'body_not_found', '전신 측정 기록을 찾을 수 없습니다.');
    if (b.session.analysis.status === 'complete') {
      bodySessionId = b.session.id;
      body = b.session.analysis;
    }
  }

  const presentation = face.ai?.presentation ?? 'unspecified';
  const gender: Gender = req.gender ?? presentation;
  const userSelected = req.gender !== undefined && req.gender !== presentation;

  const cls = classifyFace(face);
  const n = await generateNarrative(face, face.front.image.uploadId, cls, gender, req.skipAi === true);
  const id = newId('pcr');
  const now = nowIso();
  const report = assembleReport({
    id,
    now,
    faceSessionId: fs.id,
    face,
    bodySessionId,
    body,
    gender,
    userSelected,
    classification: cls,
    narrative: n.narrative,
    narrativeSource: n.source,
    aiOpinion: n.aiOpinion,
    model: n.model,
  });
  saveReport(report);
  if (n.source === 'ai') kvSet(narrativeKey(id), n.narrative);
  return { report, aiSource: n.source === 'rules' ? 'skipped' : n.source, warning: n.warning };
}

function saveReport(r: PersonalColorReport): void {
  personalColorReports.upsert({
    id: r.id,
    data: r,
    cols: { face_session_id: r.faceSessionId, body_session_id: r.bodySessionId, tone: r.type.tone, season: r.type.season, is_mock: r.isMock },
  });
}

/* ================================================================== 조회·변경·삭제 */

export function getReport(id: string): PersonalColorReport | null {
  try {
    return personalColorReports.get(id);
  } catch {
    return null;
  }
}

export function listReports(limit = 50): PersonalColorReportSummary[] {
  return personalColorReports.list({ order: 'created_at DESC', limit }).map((row) => summarizeReport(row.data));
}

export function getLatestReport(): PersonalColorReport | null {
  return personalColorReports.list({ order: 'created_at DESC', limit: 1 })[0]?.data ?? null;
}

/** 성별/스타일 변형 변경 (사용자 선택) */
export function updateReportVariant(id: string, gender: Gender): PersonalColorReport | null {
  const r = getReport(id);
  if (!r) return null;
  const narrative = kvGet<ReportNarrative>(narrativeKey(id));
  const next = applyVariant(r, gender, true, narrative, nowIso());
  saveReport(next);
  return next;
}

export function deleteReport(id: string): boolean {
  kvDelete(narrativeKey(id));
  return personalColorReports.delete(id);
}

/** personal_color_reports 전체 삭제 (이 PoC 테이블만; 얼굴/전신 세션과 사진은 남는다) */
export function deleteAllReports(): number {
  for (const r of personalColorReports.list({ limit: 500 })) kvDelete(narrativeKey(r.id));
  return personalColorReports.deleteAll();
}

/** 리포트 입력 후보: 완료된 얼굴 세션 + 측정 완료 전신 세션 */
export function listReportInputs(limit = 30): InputsResponse {
  const face = listFaceSessions({ status: 'complete', limit }).map((s) => {
    const full = getFaceSession(s.id);
    return {
      id: s.id,
      createdAt: s.createdAt,
      label: s.label,
      isMock: s.isMock,
      thumbnailUrl: s.thumbnailUrl,
      skinHex: s.skinHex,
      skinName: s.skinName,
      lightSourceLabel: s.lightSourceLabel,
      hasSide: s.hasSide,
      presentation: full?.analysis?.ai?.presentation ?? 'unspecified',
    };
  });
  const body = listBodySessions(limit)
    .filter((b) => b.status === 'complete')
    .map((b) => ({ id: b.id, createdAt: b.createdAt, label: b.label, isMock: b.isMock, thumbnailUrl: b.thumbnailUrl, summary: b.summary }));
  return { face, body };
}
