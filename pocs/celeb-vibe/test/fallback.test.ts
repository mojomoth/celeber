// 검증 라운드 1 회귀 테스트: 검출기 실패/강제 분석/측정값 검증/측정 없는 판정의 퍼스널컬러 표시/URL 오류 문구
import { describe, expect, it } from 'vitest';
import {
  DETECTOR_FAILED_MESSAGE,
  type ServerImageStats,
  VibeMeasurementSchema,
  assembleVibeAnalysis,
  buildRuleDraft,
  buildVibePrompt,
  draftToAi,
  importErrorMessage,
  judgeAnalyzability,
  mergeAnalyzability,
  resolveMeasurement,
} from '../src/lib';
import { analyzabilityHeadline } from '../src/components/analyzability';
import { measurement } from './fixtures';

const img = { uploadId: 'up_test', url: '/api/uploads/up_test', width: 1200, height: 1800 };

/** 서버 통계 (사람이 가운데 서 있는 평범한 사진) */
function stats(over: Partial<ServerImageStats> = {}): ServerImageStats {
  return {
    width: 1200,
    height: 1800,
    meanLuma: 150,
    clippedHigh: 0.01,
    clippedLow: 0.01,
    meanSaturation: 0.15,
    grayscale: false,
    centerToBorderLuma: 0.95,
    heuristicSkin: { rgb: { r: 226, g: 190, b: 172 }, used: 800, lumaStd: 10 },
    heuristicUpper: [{ rgb: { r: 31, g: 42, b: 68 }, hex: '#1F2A44', share: 0.8 }],
    heuristicLower: [{ rgb: { r: 120, g: 120, b: 128 }, hex: '#787880', share: 0.8 }],
    ...over,
  };
}

/** MediaPipe 초기화가 통째로 실패했을 때 measureVibeImage가 돌려주는 모양 */
function detectorsFailed() {
  return measurement({
    faceCount: 0,
    poseCount: 0,
    faceBoxes: [],
    face: undefined,
    pose: undefined,
    regions: [],
    body: undefined,
    segmentation: false,
    detectors: { face: 'failed', pose: 'failed', segmentation: 'failed' },
    notes: ['얼굴 검출기 실패: wasm load failed', '포즈 검출기 실패: wasm load failed'],
  });
}

/** 검출기는 정상인데 아무도 못 찾음 */
function nobodyFound() {
  return measurement({ faceCount: 0, poseCount: 0, faceBoxes: [], face: undefined, pose: undefined, regions: [], body: undefined, detectors: { face: 'ok', pose: 'ok', segmentation: 'ok' } });
}

const aiAnalyzability = (over: Partial<Parameters<typeof mergeAnalyzability>[1] & object> = {}) => ({
  analyzable: true,
  personCount: 1,
  framing: 'full-body' as const,
  outfit: true,
  personalColor: true,
  mood: true,
  issues: [],
  ...over,
});

describe('검출기 실패 (MediaPipe 로드 실패)', () => {
  it("'인물 없음' 오류 대신 서버 통계로 판정한다", () => {
    const d = buildRuleDraft(detectorsFailed(), stats());
    expect(d.measurementDropped).toBe(true);
    expect(d.measurement).toBeUndefined();
    expect(d.analyzability.reasons.map((r) => r.code)).not.toContain('no-person');
    expect(d.analyzability.analyzable).toBe(true);
    expect(d.analyzability.personCount).toBe(1);
    const other = d.analyzability.reasons.find((r) => r.code === 'other');
    expect(other?.message).toContain(DETECTOR_FAILED_MESSAGE);
    expect(other?.severity).toBe('warn'); // 간단 요약(compact)에서도 보이도록
    expect(d.outfit.items.map((i) => i.category)).toEqual(expect.arrayContaining(['top', 'bottom']));
  });
  it('조립 결과도 측정값을 버리고 서버 통계 기준 (Mock)', () => {
    const m = detectorsFailed();
    const d = buildRuleDraft(m, stats());
    const a = assembleVibeAnalysis({ id: 'v', createdAt: 't', image: img, draft: d, measurement: m, stats: stats(), ai: { data: draftToAi(d), source: 'mock', model: null } });
    expect(a.analyzability.analyzable).toBe(true);
    expect(a.outfit.items.length).toBeGreaterThan(0);
    expect(a.personalColor.measured).toBe(false);
  });
  it('AI가 있으면 AI의 인물 수를 쓴다 (측정 인물 수 0을 믿지 않음)', () => {
    const d = buildRuleDraft(detectorsFailed(), stats());
    const merged = mergeAnalyzability(d.analyzability, aiAnalyzability(), false);
    expect(merged.personCount).toBe(1);
    expect(merged.analyzable).toBe(true);
    expect(merged.partial.personalColor).toBe(true); // AI가 얼굴을 직접 봤고 사진 조건 문제 없음
  });
  it('프롬프트에 버린 측정값을 넣지 않는다', () => {
    const m = detectorsFailed();
    const d = buildRuleDraft(m, stats());
    const p = buildVibePrompt(d, m, stats());
    expect(p).toContain('browser detector failed');
    expect(p).not.toContain('"personCount":0');
  });
  it('한쪽 검출기만 실패하고 다른 쪽이 인물을 찾으면 측정값을 그대로 쓴다', () => {
    const m = measurement({ detectors: { face: 'ok', pose: 'failed', segmentation: 'ok' }, pose: undefined, poseCount: 0 });
    expect(resolveMeasurement(m).measurement).toBe(m);
  });
});

describe("'그래도 분석하기' (force)", () => {
  it('검출기 정상·인물 0명: force 없으면 오류, force면 서버 통계로 진행', () => {
    const plain = buildRuleDraft(nobodyFound(), stats());
    expect(plain.analyzability.analyzable).toBe(false);
    expect(plain.analyzability.reasons.find((r) => r.code === 'no-person')?.severity).toBe('error');

    const forced = buildRuleDraft(nobodyFound(), stats(), { force: true });
    expect(forced.analyzability.analyzable).toBe(true);
    expect(forced.analyzability.reasons.find((r) => r.code === 'no-person')?.severity).toBe('warn');
    expect(forced.outfit.items.length).toBeGreaterThan(0);
  });
  it('측정 없이 force: AI가 여러 명이라고 해도 병합 뒤 경고로 유지', () => {
    const d = buildRuleDraft(undefined, stats(), { force: true });
    const ai = aiAnalyzability({ personCount: 2 });
    const notForced = mergeAnalyzability(d.analyzability, ai, false);
    expect(notForced.analyzable).toBe(false);
    const forced = mergeAnalyzability(d.analyzability, ai, false, { force: true });
    expect(forced.reasons.find((r) => r.code === 'multiple-people')?.severity).toBe('warn');
    expect(forced.analyzable).toBe(true);
    // 조립 경로도 draft.forced를 넘긴다
    const a = assembleVibeAnalysis({
      id: 'v',
      createdAt: 't',
      image: img,
      draft: d,
      stats: stats(),
      ai: { data: { ...draftToAi(d), analyzability: { ...ai, framing: 'full-body' } }, source: 'ai', model: 'claude-opus-5-5' },
    });
    expect(a.analyzability.analyzable).toBe(true);
  });
  it('흑백은 force여도 분석 불가로 남는다', () => {
    const m = measurement();
    m.scene.grayscale = true;
    expect(buildRuleDraft(m, stats(), { force: true }).analyzability.analyzable).toBe(false);
  });
});

describe('측정 없는 판정의 퍼스널컬러', () => {
  it("서버 통계만이면 퍼스널컬러는 참고용 → 헤더가 '모두 분석 가능'이라고 하지 않는다", () => {
    const a = judgeAnalyzability(undefined, stats());
    expect(a.partial.personalColor).toBe(false);
    expect(a.partial.outfit).toBe(true);
    expect(analyzabilityHeadline(a).text).not.toContain('모두');
    expect(a.reasons.find((r) => r.code === 'other')?.message).toContain('참고용');
  });
  it('AI 병합 시 사진 조건 문제(역광 등)가 있으면 AI가 가능하다고 해도 false', () => {
    const a = judgeAnalyzability(undefined, stats({ centerToBorderLuma: 0.4, meanLuma: 170 }));
    expect(a.reasons.map((r) => r.code)).toContain('backlight');
    expect(mergeAnalyzability(a, aiAnalyzability(), false).partial.personalColor).toBe(false);
  });
});

describe('측정값 입력 검증', () => {
  it('잘못된 hex, 범위 밖 RGB, 과대 배열을 거부', () => {
    const badHex = measurement();
    badHex.regions[0].clusters[0].hex = 'zzz';
    expect(VibeMeasurementSchema.safeParse(badHex).success).toBe(false);
    const badRgb = measurement();
    badRgb.face!.skin.rgb.r = 300;
    expect(VibeMeasurementSchema.safeParse(badRgb).success).toBe(false);
    const many = measurement({ notes: Array.from({ length: 200 }, () => 'x') });
    expect(VibeMeasurementSchema.safeParse(many).success).toBe(false);
    const manyKp = measurement();
    manyKp.pose!.keypoints = Array.from({ length: 5000 }, () => ({ x: 0, y: 0, v: 0 }));
    expect(VibeMeasurementSchema.safeParse(manyKp).success).toBe(false);
    expect(VibeMeasurementSchema.safeParse(measurement()).success).toBe(true);
    expect(VibeMeasurementSchema.safeParse(detectorsFailed()).success).toBe(true);
  });
});

describe('URL 가져오기 오류 문구', () => {
  it('내부 메시지를 그대로 내보내지 않고 고정 문구로 바꾼다', () => {
    expect(importErrorMessage(new Error('이미지 다운로드 시간 초과'))).toContain('오래 걸렸습니다');
    expect(importErrorMessage(new Error('이미지가 너무 큽니다.'))).toContain('너무 큽니다');
    expect(importErrorMessage(new Error('이미지 형식이 아닙니다.'))).toContain('이미지 주소가 아닙니다');
    expect(importErrorMessage(new Error('이미지를 가져오지 못했습니다 (HTTP 403).'))).toContain('받지 못했습니다');
    const internal = importErrorMessage(new Error('getaddrinfo ENOTFOUND internal.host.corp /var/secret'));
    expect(internal).not.toContain('internal.host');
    expect(internal).toContain('직접 업로드');
  });
});
