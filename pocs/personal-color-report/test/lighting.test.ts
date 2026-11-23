import { describe, expect, it } from 'vitest';
import { type FaceAnalysis, FaceAnalysisSchema } from '@celeber/core/contracts';
import { classifyFace, lightingCaution, reportConfidence, reportWarningText, softenWarmPercent } from '../src/lib';
import fixture from './fixtures/face-analysis.json';

const FACE: FaceAnalysis = FaceAnalysisSchema.parse(fixture);
const withEnv = (patch: Partial<FaceAnalysis['environment']>): FaceAnalysis => ({ ...FACE, environment: { ...FACE.environment, ...patch } });
const GOOD = withEnv({ lightSource: 'daylight', cctK: 5600, lightingQuality: 0.9, retakeRecommended: false });
const BAD = withEnv({ lightSource: 'fluorescent', lightSourceLabel: '형광등', cctK: 4260, lightingQuality: 0.33, retakeRecommended: true });

describe('조명 경고: 재촬영 권장이면 결과를 확정적으로 보이지 않게', () => {
  it('좋은 조명은 경고 없음, 재촬영 권장·조명 품질 낮음은 경고', () => {
    expect(lightingCaution(GOOD).flagged).toBe(false);
    expect(lightingCaution(GOOD).trust).toBe(1);
    const b = lightingCaution(BAD);
    expect(b.flagged).toBe(true);
    expect(b.trust).toBeLessThan(0.7);
    expect(b.reason).toContain('조명 확인 필요');
  });
  it('웜/쿨 %를 50:50 쪽으로 당기고 합은 100', () => {
    const s = softenWarmPercent(1, lightingCaution(BAD).trust);
    expect(s.warm).toBeGreaterThan(10);
    expect(s.warm + s.cool).toBe(100);
    expect(softenWarmPercent(1, 1)).toEqual({ warm: 1, cool: 99 });
  });
  it('조명 경고 시 신뢰도 상한 55, 명확도 요인도 낮아진다', () => {
    const cls = classifyFace(GOOD);
    const good = reportConfidence(GOOD, cls, null);
    const bad = reportConfidence(BAD, cls, null);
    expect(bad.score).toBeLessThanOrEqual(55);
    expect(bad.gradeLabel).toContain('조명');
    const m = (r: typeof good) => r.factors.find((f) => f.key === 'classifier-margin')!.score;
    if (cls.margin > 0) expect(m(bad)).toBeLessThan(m(good));
  });
  it('촬영 중 행동 지시는 리포트 문구로 바꾸거나 뺀다', () => {
    expect(reportWarningText({ code: 'env:white-ref-invalid', message: '선택한 곳이 하얗게 날아갔습니다. 조금 덜 밝은 흰 부분을 눌러 주세요.' })).toContain('기준 백색으로 쓰지 않았습니다');
    expect(reportWarningText({ code: 'side:skipped', message: '측면 사진을 건너뛰어' })).toBeNull();
    expect(reportWarningText({ code: 'env:too-bright', message: '빛이 너무 강해' })).toBe('빛이 너무 강해');
  });
});

describe('④ 명도·채도·청탁 행은 타입 권장 수준을 먼저 보인다', () => {
  it('여름 라이트 타입인데 측정 명도가 딥이어도 행은 타입 권장(밝음)으로 시작하고 측정 차이를 덧붙인다', async () => {
    const { axisRowText } = await import('../src/lib');
    const cls = { ...classifyFace(GOOD), tone: 'summer-light' as const, axes: { warmth: 30, value: 10, chroma: 30, contrast: 50, clarity: 50 } };
    const t = axisRowText('value', cls, 'summer-light');
    expect(t.startsWith('밝음')).toBe(true);
    expect(t).toContain('측정은 딥');
    const c = axisRowText('chroma', cls, 'summer-mute');
    expect(c).not.toMatch(/\(뮤트\) \(뮤트/);
  });
});
