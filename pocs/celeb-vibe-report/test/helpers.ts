/**
 * 테스트 입력: personal-color-report의 순수 함수로 리포트를 조립하고, VibeAnalysis는 계약 형태로 직접 만든다.
 */
import { type FaceAnalysis, FaceAnalysisSchema, type Gender, type PersonalColorReport, type VibeAnalysis, VibeAnalysisSchema } from '@celeber/core/contracts';
import { describeColor } from '@celeber/core/color';
import { assembleReport, classifyFace, templateNarrative } from '@celeber/personal-color-report/lib';
import fixture from './fixtures/face-analysis.json';

export const FACE: FaceAnalysis = FaceAnalysisSchema.parse(fixture);

export function buildReport(opts: { id?: string; gender?: Gender; bodySessionId?: string | null; faceSessionId?: string } = {}): PersonalColorReport {
  const gender = opts.gender ?? 'male';
  const cls = classifyFace(FACE);
  const r = assembleReport({
    id: opts.id ?? 'pcr_test',
    now: '2026-11-23T00:00:00.000Z',
    faceSessionId: opts.faceSessionId ?? 'face_x',
    face: FACE,
    bodySessionId: opts.bodySessionId ?? null,
    body: null,
    gender,
    userSelected: false,
    classification: cls,
    narrative: templateNarrative(cls, FACE, gender),
    narrativeSource: 'mock',
  });
  // assembleReport는 body 분석이 없으면 bodySessionId를 비운다 → 테스트에서는 연결만 확인
  return opts.bodySessionId ? { ...r, bodySessionId: opts.bodySessionId } : r;
}

const nc = (hex: string, name: string) => ({ hex, name });

export function buildVibe(over: Partial<VibeAnalysis> = {}): VibeAnalysis {
  const base: VibeAnalysis = {
    id: 'vibe_test',
    version: 1,
    createdAt: '2026-11-23T00:00:00.000Z',
    image: { uploadId: 'up_test', url: '/api/uploads/up_test', width: 600, height: 900 },
    celebName: '윤하람',
    analyzability: { analyzable: true, partial: { outfit: true, personalColor: true, mood: true }, personCount: 1, framing: 'full-body', reasons: [] },
    outfit: {
      items: [
        { category: 'top', name: '니트', color: nc('#D4A017', '머스타드'), box: { x: 0.3, y: 0.27, w: 0.4, h: 0.28 } },
        { category: 'bottom', name: '와이드 팬츠', color: nc('#787880', '그레이'), box: { x: 0.33, y: 0.56, w: 0.34, h: 0.36 } },
        { category: 'shoes', name: '로퍼', color: nc('#111111', '블랙') },
        { category: 'jewelry', name: '귀걸이', color: nc('#D4AF37', '골드') },
      ],
      styleKeywords: ['미니멀', '시크'],
      silhouette: 'I라인, 상체 볼륨 + 와이드 하의',
      summary: '머스타드 니트와 그레이 팬츠',
    },
    personalColor: {
      measured: true,
      skin: describeColor('#E8B98F', 'skin'),
      hair: describeColor('#6F4E37'),
      tone: 'autumn-warm',
      toneNameKo: '가을웜 트루',
      undertone: 'warm',
      axes: { warmth: 85, value: 45, chroma: 60, contrast: 55, clarity: 40 },
      confidence: 0.6,
      evidence: [],
      lightingCaveat: '화보 조명으로 실제보다 따뜻하게 보일 수 있습니다.',
    },
    mood: { keywords: ['시크', '도시적', '따뜻한'], firstImpression: '여유 있고 도시적인 인상', references: ['가을 오후 거리'] },
    body: { measured: true, headsTall: 8.2, notes: [] },
    palette: { main: [nc('#D4A017', '머스타드'), nc('#787880', '그레이')], sub: [nc('#111111', '블랙')], accent: [nc('#D4AF37', '골드')] },
    lookName: '머스타드 니트 룩',
    source: 'mock',
    isMock: true,
  };
  return VibeAnalysisSchema.parse({ ...base, ...over });
}
