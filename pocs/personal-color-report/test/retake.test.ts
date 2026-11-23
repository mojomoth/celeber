/**
 * Gate 1 독립 검증 라운드 1: 어두운 사진 재촬영 권장, ⑭ 근거 문구, AI 서술 표기, 업로드 본문 상한.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { type FaceAnalysis, FaceAnalysisSchema } from '@celeber/core/contracts';
import { MAX_UPLOAD_BODY_BYTES } from '@celeber/core/server/uploads';
import {
  type AiNarrative,
  BODY_ADD_DESCRIPTION,
  assembleReport,
  classifyFace,
  lightingDetail,
  mergeAiNarrative,
  polishAiText,
  reportConfidence,
  skinReasonTexts,
  templateNarrative,
  unreliableCapture,
} from '../src/lib';
import fixture from './fixtures/face-analysis.json';

const FACE: FaceAnalysis = FaceAnalysisSchema.parse(fixture);

function build(face: FaceAnalysis) {
  const cls = classifyFace(face);
  return assembleReport({
    id: 'pcr_test',
    now: '2026-11-24T00:00:00.000Z',
    faceSessionId: 'face_x',
    face,
    bodySessionId: null,
    body: null,
    gender: 'male',
    userSelected: false,
    classification: cls,
    narrative: templateNarrative(cls, face, 'male'),
    narrativeSource: 'mock',
  });
}

/** 환경 단계 없이 쓴 고른 주광 (얼굴 사진 배경 기준) */
const DAYLIGHT_DIM: Partial<FaceAnalysis['environment']> = {
  lightSource: 'daylight',
  lightSourceLabel: '주광색 조명',
  cctK: 6500,
  lightingQuality: 0.78,
  retakeRecommended: false,
  brightness: { ...FACE.environment.brightness, level: 'dim', label: '조금 어두움', medianLuma: 42 },
};

/** 검증자 재현: 어두운 정면을 '그래도 사용'으로 진행 → L* 14.3, ITA -85°, 얼굴 어두움 오류 */
const DARK: FaceAnalysis = {
  ...FACE,
  environment: { ...FACE.environment, ...DAYLIGHT_DIM },
  front: {
    ...FACE.front,
    quality: { ...FACE.front.quality, passed: false, faceBrightness: 30, issues: [{ code: 'face-dark', severity: 'error', message: '얼굴이 너무 어둡습니다. 빛을 마주 봐 주세요' }] },
  },
  skin: { ...FACE.skin, corrected: { ...FACE.skin.corrected, lab: { l: 14.3, a: 2.1, b: 3.5 }, ita: -85 } },
};

describe('어두운 사진은 재촬영 권장', () => {
  it('얼굴 어두움 오류 + 피부값 범위 밖 → 낮은 신뢰도(≤49), ⑬ 맨 앞·② 안내용 문구, 웜/쿨 % 완화', () => {
    const r = build(DARK);
    expect(r.confidence.grade).toBe('low');
    expect(r.confidence.score).toBeLessThanOrEqual(49);
    expect(r.confidence.gradeLabel).toContain('재촬영');
    expect(r.cautions.items[0]).toMatch(/^재촬영 권장: 정면 얼굴이 너무 어두워/);
    expect(r.cautions.items[0]).toContain('L* 14.3');
    expect(Math.max(r.warmCool.warmPercent, r.warmCool.coolPercent)).toBeLessThanOrEqual(70);
    const lighting = r.confidence.factors.find((f) => f.key === 'lighting')!;
    expect(lighting.detail).not.toContain('적정합니다');
    expect(lighting.detail).toContain('조금 어둡습니다');
    const det = r.confidence.factors.find((f) => f.key === 'face-detection')!;
    expect(det.score).toBeLessThan(0.7);
    expect(det.detail).toContain('얼굴 어두움');
  });

  it('노출 오류가 없어도 피부값이 사람 피부 범위를 벗어나면 재촬영 권장', () => {
    const outOnly: FaceAnalysis = { ...DARK, front: FACE.front };
    expect(unreliableCapture(outOnly).unreliable).toBe(true);
    const darkOnly: FaceAnalysis = { ...DARK, skin: FACE.skin };
    expect(unreliableCapture(darkOnly).unreliable).toBe(true);
  });

  it('아주 어두운 피부라도 정상 노출(L* 30, ITA -55°)이면 재촬영 권장이 아니다', () => {
    const deep: FaceAnalysis = { ...FACE, skin: { ...FACE.skin, corrected: { ...FACE.skin.corrected, lab: { l: 30, a: 12, b: 14 }, ita: -55 } } };
    expect(unreliableCapture(deep).unreliable).toBe(false);
    expect(unreliableCapture(FACE).unreliable).toBe(false);
  });

  it('사람 없는 환경 사진(재촬영 권장 환경) + 어두운 정면도 보통이 아니라 낮음', () => {
    const r = build({ ...DARK, environment: { ...DARK.environment, retakeRecommended: true, lightingQuality: 0.61, cctK: 7770, brightness: FACE.environment.brightness } });
    expect(r.confidence.grade).toBe('low');
    expect(r.cautions.items[0].startsWith('재촬영 권장')).toBe(true);
  });

  it('조명 근거는 밝기까지 반영하고, 밝기가 적정이면 기존 문장', () => {
    const env = { ...FACE.environment, ...DAYLIGHT_DIM } as FaceAnalysis['environment'];
    expect(lightingDetail(env, 0.78)).toBe('조명은 고른 편이지만 사진이 조금 어둡습니다. (주광색 조명 · 6,500K)');
    const normal = { ...env, brightness: { ...env.brightness, level: 'normal' as const, label: '적정' } };
    expect(lightingDetail(normal, 0.8)).toBe('조명이 고르고 밝기가 적정합니다. (주광색 조명 · 6,500K)');
  });
});

describe('⑭ 근거 문구', () => {
  it('피부 측정 품질: 내부 표현(gray-world·게인·px) 없이 문장 단위로', () => {
    const reasons = ['조명 추정 신뢰도가 낮아 보정 강도를 낮췄습니다.', '환경 사진 + 얼굴 사진 배경의 gray-world 게인 기하 평균, 강도 0.4', '피부 샘플 22,719px 사용'];
    const t = skinReasonTexts(reasons);
    expect(t).toEqual(['조명 추정이 불확실해 색 보정을 약하게 적용했습니다.', '환경 사진과 얼굴 배경으로 조명 색을 추정해 보정했습니다.']);
    const r = build({ ...FACE, skin: { ...FACE.skin, confidence: 0.5, confidenceReasons: reasons } });
    const d = r.confidence.factors.find((f) => f.key === 'skin-measurement')!.detail;
    expect(d).not.toMatch(/gray-world|게인|px|\.,/);
  });

  it('조명 경고면 타입 구분 명확도 점수도 낮아지고, 문구에 엠대시가 없다', () => {
    const bad: FaceAnalysis = { ...FACE, environment: { ...FACE.environment, lightSource: 'mixed', lightSourceLabel: '혼합광', cctK: 3290, lightingQuality: 0.4, retakeRecommended: true } };
    const cls = { ...classifyFace(bad), margin: 0.76 };
    const f = reportConfidence(bad, cls, null).factors.find((x) => x.key === 'classifier-margin')!;
    expect(f.score).toBeLessThan(0.7);
    expect(f.detail).toBe('1·2위 차는 76%p지만 조명 영향을 고려해 확신도를 낮춰 반영했습니다.');
    const good = reportConfidence(FACE, { ...cls, margin: 0.76 }, null).factors.find((x) => x.key === 'classifier-margin')!;
    expect(good.detail).not.toContain('—');
    const close = reportConfidence(bad, { ...cls, margin: 0.13 }, null).factors.find((x) => x.key === 'classifier-margin')!;
    expect(close.detail).toBe('보조 타입과 점수가 가깝습니다(1·2위 차 13%p). 조명 영향을 고려해 확신도를 더 낮췄습니다.');
  });

  it('재촬영 문구의 조사: ΔE 수치 뒤에 "로"를 붙이지 않는다', () => {
    const face: FaceAnalysis = {
      ...FACE,
      environment: { ...FACE.environment, lightSource: 'mixed', lightSourceLabel: '혼합광', cctK: 3290 },
      skin: { ...FACE.skin, regionSpreadDeltaE: 23.3 },
    };
    const reason = unreliableCapture(face).reason;
    expect(reason).toContain('색 편차(ΔE 23.3)가 커서');
    expect(reason).not.toMatch(/ΔE [\d.]+로/);
  });

  it('리포트 화면 문구에 엠대시가 없다 (주석 제외)', () => {
    const src = fs.readFileSync(new URL('../src/components/PersonalColorReportView.tsx', import.meta.url), 'utf8');
    const code = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l));
    expect(code.filter((l) => l.includes('—'))).toEqual([]);
  });

  it("'전신 사진 추가' 카드는 새 리포트를 만든다고 안내한다", () => {
    expect(BODY_ADD_DESCRIPTION).toContain('새 리포트');
    expect(BODY_ADD_DESCRIPTION).not.toContain('이 리포트에 함께');
  });
});

describe('AI 서술 표기 정리', () => {
  const ctx = { tone: 'summer-cool' as const, secondaryTone: 'winter-cool' as const };
  it('보조 타입 이름을 전체 이름으로, 색온도는 3,290K로', () => {
    expect(polishAiText('최종 타입은 여름쿨 트루(83%)이며, 보조 타입은 겨울쿨(7%)입니다.', ctx)).toBe('최종 타입은 여름쿨 트루(83%)이며, 보조 타입은 겨울쿨 트루(7%)입니다.');
    expect(polishAiText('3290 K 혼합광, 3,290 K, 6500K', ctx)).toBe('3,290K 혼합광, 3,290K, 6,500K');
    expect(polishAiText('겨울쿨 계열 색은 피하세요.', ctx)).toBe('겨울쿨 계열 색은 피하세요.');
  });
  it('1·2순위가 같은 계절이어도 "보조 타입은 …"이면 보조 타입 이름으로', () => {
    const same = { tone: 'summer-mute' as const, secondaryTone: 'summer-cool' as const };
    expect(polishAiText('규칙 판정은 여름쿨 뮤트(85%)이며, 보조 타입은 여름쿨(12%)입니다.', same)).toBe('규칙 판정은 여름쿨 뮤트(85%)이며, 보조 타입은 여름쿨 트루(12%)입니다.');
  });
  it('mergeAiNarrative가 ctx로 서술 전체를 정리한다', () => {
    const cls = classifyFace(FACE);
    const base = templateNarrative(cls, FACE, 'male');
    const ai = { typeDescription: '보조 타입은 겨울쿨(7%)입니다.', analysisPoint: '3290 K 혼합광', grooming: [], firstImpression: [], hashtags: [], imageKeywords: [], todayActions: [] } as unknown as AiNarrative;
    const m = mergeAiNarrative(base, ai, ctx);
    expect(m.typeDescription).toBe('보조 타입은 겨울쿨 트루(7%)입니다.');
    expect(m.analysisPoint).toBe('3,290K 혼합광');
  });
});

describe('업로드 본문 상한', () => {
  it('proxy 본문 버퍼 상한이 업로드 본문 상한(25MB 이미지)보다 크다', () => {
    const src = fs.readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
    const m = /proxyClientMaxBodySize:\s*'([^']+)'/.exec(src);
    expect(m).not.toBeNull();
    const bytes = createRequire(import.meta.url)('next/dist/compiled/bytes') as { parse: (s: string) => number };
    expect(bytes.parse(m![1])).toBeGreaterThanOrEqual(MAX_UPLOAD_BODY_BYTES);
  });
});
