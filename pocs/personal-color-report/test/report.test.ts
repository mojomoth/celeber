/**
 * 순수 로직: 분류 보정, 리포트 조립(카드 14섹션), 성별 변형, 신뢰도, 드레이핑 기하, 팔레트, 서술 병합.
 */
import { describe, expect, it } from 'vitest';
import { type FaceAnalysis, FaceAnalysisSchema, PersonalColorReportSchema } from '@celeber/core/contracts';
import { axisLevelLabel, classifyPersonalColor, toneSeason } from '@celeber/core/personal-color';
const lvlLabel = (v: number) => axisLevelLabel('contrast', v);
import {
  type AiNarrative,
  applyVariant,
  assembleReport,
  classifyFace,
  classifyMeasured,
  cropIntersection,
  drapeCrop,
  drapeHarmony,
  drapeOutline,
  mergeAiNarrative,
  paletteFromReport,
  paletteForTone,
  ruleAiAgreement,
  shadeHex,
  substituteToPalette,
  templateNarrative,
  toneContrastLevel as L_toneContrast,
  variantUsesTemplateNarrative,
} from '../src/lib';
import fixture from './fixtures/face-analysis.json';

const FACE: FaceAnalysis = FaceAnalysisSchema.parse(fixture);

function build(face: FaceAnalysis = FACE, gender: 'male' | 'female' | 'unspecified' = 'male', source: 'ai' | 'mock' | 'rules' = 'mock') {
  const cls = classifyFace(face);
  return assembleReport({
    id: 'pcr_test',
    now: '2026-11-23T00:00:00.000Z',
    faceSessionId: 'face_x',
    face,
    bodySessionId: null,
    body: null,
    gender,
    userSelected: false,
    classification: cls,
    narrative: templateNarrative(cls, face, gender),
    narrativeSource: source,
  });
}

describe('분류 (앱 보정)', () => {
  it('매우 밝은 피부 + 검은 머리: core 기본값은 겨울 딥과 거의 동점, 앱 보정은 여름 안에서 뚜렷하게', () => {
    const skin = FACE.skin.corrected.lab;
    const hair = FACE.featureColors.hair!.lab;
    const core = classifyPersonalColor({ skin, hair, eyes: FACE.featureColors.eyes?.lab });
    expect([core.tone, core.secondaryTone]).toContain('winter-deep');
    expect(core.margin).toBeLessThan(0.02);
    const r = classifyFace(FACE);
    expect(r.season).toBe('summer');
    expect(toneSeason(r.secondaryTone)).toBe('summer');
    expect(r.margin).toBeGreaterThan(0.1);
    expect(r.axes.contrast).toBeLessThan(core.axes.contrast);
    expect(r.undertone).not.toBe('warm');
    // 입력 요약은 하한 적용 전 실측값
    expect(r.inputs.hairLab!.l).toBeCloseTo(hair.l, 0);
  });
  it('결정적이며 웜 피부는 웜으로 남는다', () => {
    const warm = { skin: { l: 72, a: 12, b: 26 }, hair: { l: 3, a: 1, b: 1 } };
    const a = classifyMeasured(warm);
    expect(classifyMeasured(warm)).toEqual(a);
    expect(a.warmPercent).toBeGreaterThan(60);
    expect(['spring', 'autumn']).toContain(a.season);
  });
});

describe('리포트 조립 (레퍼런스 카드 구조)', () => {
  const r = build();
  it('계약 스키마를 통과하고 섹션 번호 1..14가 카드 순서대로다', () => {
    expect(() => PersonalColorReportSchema.parse(r)).not.toThrow();
    const nos = [r.firstImpression, r.type, r.warmCool, r.features, r.draping, r.tops, r.outer, r.accessories, r.hair, r.grooming, r.avoidStyles, r.todayActions, r.cautions, r.confidence].map((s) => s.no);
    expect(nos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  });
  it('카드의 항목 수와 라벨을 채운다', () => {
    expect(r.header.title).toBe('남성 퍼스널컬러 분석 리포트');
    expect(r.header.basis[0]).toBe('업로드한 정면 얼굴 사진');
    expect(r.header.basis).toContain('환경(조명) 사진');
    expect(r.firstImpression.bullets).toHaveLength(4);
    expect(r.firstImpression.hashtags.every((h) => h.startsWith('#'))).toBe(true);
    expect(r.warmCool.warmPercent + r.warmCool.coolPercent).toBe(100);
    expect(r.features.rows.map((x) => x.label)).toEqual(['피부톤', '명도', '채도', '청탁감', '대비감', '이미지 키워드']);
    expect(r.draping.best).toHaveLength(4);
    expect(r.draping.worst).toHaveLength(4);
    expect(r.tops.items).toHaveLength(6);
    expect(r.tops.items[0].shape).toBe('shirt');
    expect(r.outer.items).toHaveLength(5);
    expect(r.outer.items[0].shape).toBe('fabric');
    expect(r.accessories.pointColors).toHaveLength(4);
    expect(r.accessories.pointColors[0].shape).toBe('tie');
    expect(r.accessories.items.filter((i) => i.kind === 'watch')).toHaveLength(3);
    expect(r.hair.items).toHaveLength(4);
    expect(r.grooming.items.map((g) => g.label)).toEqual(['피부', '눈썹', '수염', '향수']);
    expect(r.avoidStyles.items).toHaveLength(4);
    expect(r.todayActions.items).toHaveLength(4);
    expect(r.cautions.items.length).toBeGreaterThanOrEqual(3);
    expect(r.disclaimer).toMatch(/조명/);
    expect(r.bodyStyling).toBeNull();
    expect(r.bodySessionId).toBeNull();
    expect(r.photos.drapeAnchor?.chin.y).toBeGreaterThan(r.photos.drapeAnchor!.faceBox.y);
  });
  it('드레이핑 베스트는 워스트보다 조화도가 높다', () => {
    const avg = (xs: { harmony?: number }[]) => xs.reduce((s, x) => s + (x.harmony ?? 0), 0) / xs.length;
    expect(avg(r.draping.best)).toBeGreaterThan(avg(r.draping.worst));
    expect(drapeHarmony(r.draping.worst[0].color.hex, r.type.tone)).toBeLessThan(0.5);
  });
  it('Mock/규칙/AI 출처 표시', () => {
    expect(r.isMock).toBe(true);
    expect(r.source).toBe('rules');
    const ai = build(FACE, 'male', 'ai');
    expect(ai.isMock).toBe(false);
    expect(ai.source).toBe('hybrid');
    const skipped = build(FACE, 'male', 'rules');
    expect(skipped.isMock).toBe(false);
  });
});

describe('⑭ 신뢰도는 측정 품질에서 계산된다', () => {
  it('조명·검출 품질이 나빠지면 점수가 내려간다', () => {
    const good = build(FACE).confidence;
    const bad = build({
      ...FACE,
      environment: { ...FACE.environment, lightingQuality: 0.1 },
      front: { ...FACE.front, quality: { ...FACE.front.quality, detectionScore: 0.3, passed: false } },
      skin: { ...FACE.skin, whiteBalance: { ...FACE.skin.whiteBalance, deltaE: 11 } },
    }).confidence;
    expect(bad.score).toBeLessThan(good.score);
    expect(good.factors.map((f) => f.key)).toContain('lighting');
    expect(good.factors.find((f) => f.key === 'lighting')!.detail).toMatch(/K/);
  });
  it('규칙·AI 일치도', () => {
    expect(ruleAiAgreement('summer-mute', 'summer-mute')).toBe(true);
    expect(ruleAiAgreement('summer-mute', 'summer-light')).toBe('season-only');
    expect(ruleAiAgreement('summer-mute', 'autumn-deep')).toBe(false);
    expect(ruleAiAgreement('summer-mute', null)).toBeNull();
  });
});

describe('성별/스타일 변형', () => {
  it('여성 변형: ⑥⑦⑧⑩ 제목·형태·항목이 바뀌고 섹션 구조는 유지된다', () => {
    const m = build();
    const f = applyVariant(m, 'female', true);
    expect(f.header.title).toBe('여성 퍼스널컬러 분석 리포트');
    expect(f.tops.title).toBe('추천 상의·블라우스 색상');
    expect(f.tops.items[0].shape).toBe('blouse');
    expect(f.outer.title).toBe('추천 아우터·하의 컬러');
    expect(f.accessories.title).toBe('스카프·주얼리 & 악세서리');
    expect(f.accessories.pointColors[0].shape).toBe('scarf');
    expect(f.accessories.items.map((i) => i.kind)).toEqual(['earring', 'necklace', 'ring']);
    expect(f.grooming.items.map((g) => g.key)).toEqual(['base', 'lip', 'eye', 'cheek']);
    expect(f.tops.tip).not.toMatch(/셔츠/);
    expect(f.variant).toMatchObject({ gender: 'female', userSelected: true });
    expect(f.tops.items.map((i) => i.color.hex)).toEqual(m.tops.items.map((i) => i.color.hex));
    const back = applyVariant(f, 'male', true);
    expect(back.grooming.items.map((g) => g.key)).toEqual(['skin', 'brow', 'beard', 'fragrance']);
    expect(back.accessories.pointColors[0].shape).toBe('tie');
  });
  it('같은 성별의 AI 서술이 있으면 그루밍 문구를 유지한다', () => {
    const m = build();
    const narr = { ...templateNarrative(m.classification, FACE, 'female'), grooming: ['A', 'B', 'C', 'D'] };
    const f = applyVariant(m, 'female', true, narr);
    expect(f.grooming.items.map((g) => g.suggestion)).toEqual(['A', 'B', 'C', 'D']);
  });
});

describe('드레이핑 기하', () => {
  const anchor = { chin: { x: 0.5, y: 0.7 }, jawLeft: { x: 0.65, y: 0.6 }, jawRight: { x: 0.35, y: 0.6 }, faceBox: { x: 0.3, y: 0.25, w: 0.4, h: 0.45 } };
  it('크롭은 얼굴 전체와 턱 아래를 담는다', () => {
    const c = drapeCrop(anchor, 1000, 1000, 0.8);
    expect(c.sy).toBeLessThan(250);
    expect(c.sy + c.sh).toBeGreaterThan(700 + 0.5 * 450);
    expect(c.sw / c.sh).toBeCloseTo(0.8, 5);
    expect(c.sx + c.sw / 2).toBeCloseTo(500, 5);
  });
  it('천 윤곽은 턱끝보다 아래에 있어 얼굴을 가리지 않는다', () => {
    const c = drapeCrop(anchor, 1000, 1000, 0.8);
    const o = drapeOutline(anchor, c, 1000, 1000, 160, 200);
    for (const p of o.top) expect(p.y).toBeGreaterThanOrEqual(o.chin.y - 1e-6);
    expect(o.top[0].x).toBe(0);
    expect(o.top[o.top.length - 1].x).toBe(160);
    expect(o.chin.x).toBeCloseTo(80, 5);
  });
  it('사진 밖 크롭은 교집합만 그린다', () => {
    const c = { sx: -100, sy: 600, sw: 400, sh: 500 };
    const i = cropIntersection(c, 300, 1000, 80, 100)!;
    expect(i.src).toEqual({ sx: 0, sy: 600, sw: 300, sh: 400 });
    expect(i.dst.dx).toBeCloseTo(20, 5);
    expect(i.dst.dh).toBeCloseTo(80, 5);
    expect(cropIntersection({ sx: 400, sy: 0, sw: 10, sh: 10 }, 300, 300, 10, 10)).toBeNull();
  });
  it('shadeHex', () => {
    expect(shadeHex('#808080', 0)).toBe('#808080');
    expect(shadeHex('#808080', 1)).toBe('#FFFFFF');
    expect(shadeHex('#808080', -1)).toBe('#000000');
  });
});

describe('팔레트', () => {
  it('리포트 팔레트와 색 치환', () => {
    const r = build();
    const p = paletteFromReport(r);
    expect(p.tops).toHaveLength(6);
    expect(p.best[0].hex).toBe(r.draping.best[0].color.hex);
    const own = substituteToPalette(p.tops[0].hex, p);
    expect(own.deltaE).toBe(0);
    expect(own.keepOriginal).toBe(true);
    const neon = substituteToPalette('#39FF14', paletteForTone('summer-mute'));
    expect(neon.keepOriginal).toBe(false);
  });
});

describe('서술 병합', () => {
  it('AI 빈 값은 템플릿 유지, 해시태그 정규화', () => {
    const cls = classifyFace(FACE);
    const base = templateNarrative(cls, FACE, 'male');
    const ai: AiNarrative = {
      independentTone: cls.tone,
      independentUndertone: cls.undertone,
      independentRationale: 'x',
      firstImpression: ['차분한 인상', ''],
      hashtags: ['신뢰감', '#지적 '],
      typeDescription: '',
      analysisPoint: 'AI 포인트',
      warmText: '',
      coolText: '',
      featureSkinTone: '',
      featureValue: '',
      featureChroma: '',
      featureClarity: '',
      featureContrast: '',
      imageKeywords: [],
      topsTip: '',
      outerTip: '',
      hairIntro: '',
      hairTip: '',
      grooming: ['G1'],
      avoidIntro: '',
      todayActions: [],
    };
    const m = mergeAiNarrative(base, ai);
    expect(m.firstImpression).toEqual(['차분한 인상']);
    expect(m.hashtags).toEqual(['#신뢰감', '#지적']);
    expect(m.typeDescription).toBe(base.typeDescription);
    expect(m.analysisPoint).toBe('AI 포인트');
    expect(m.grooming[0]).toBe('G1');
    expect(m.grooming[1]).toBe(base.grooming[1]);
    expect(m.todayActions).toEqual(base.todayActions);
  });
  it('템플릿 서술에 실제 측정값이 들어간다', () => {
    const cls = classifyFace(FACE);
    const n = templateNarrative(cls, FACE, 'male');
    expect(n.analysisPoint).toContain(`${FACE.skin.corrected.lch.h.toFixed(0)}°`);
  });
});

describe('검증 라운드 1 보정', () => {
  it('④ 대비감: 타입 권장 대비를 앞에, 측정 ΔL*를 뒤에 (뮤트 타입이 높은 대비로 표시되지 않음)', () => {
    const r = build();
    const row = r.features.rows.find((x) => x.key === 'contrast')!;
    const lvl = L_toneContrast(r.type.tone);
    expect(row.value.startsWith(lvlLabel(lvl))).toBe(true);
    expect(row.value).toMatch(/측정 피부·헤어 명도 차 ΔL\* \d+/);
    if (r.type.tone.endsWith('mute') || r.type.tone.endsWith('light')) expect(row.value).toContain('과한 대비 비추천');
  });

  it("'선택 안 함' 그루밍에는 수염이 없고 헤어 스타일링이 들어간다", () => {
    const r = build(FACE, 'unspecified');
    const keys = r.grooming.items.map((g) => g.key);
    expect(keys).not.toContain('beard');
    expect(keys).toContain('hair-styling');
    const male = applyVariant(r, 'male', true);
    expect(male.grooming.items.map((g) => g.key)).toContain('beard');
    const back = applyVariant(male, 'unspecified', true);
    expect(back.grooming.items.map((g) => g.key)).toEqual(keys);
  });

  it('백열등 + 피부 편차 큼 → 낮은 신뢰도로 상한, 재촬영 안내; 점수는 측정값에 따라 변함', () => {
    const normal = build();
    const bad = (spread: number, wb: number): FaceAnalysis => ({
      ...FACE,
      environment: { ...FACE.environment, lightSource: 'incandescent', lightSourceLabel: '백열등', cctK: 2300, lightingQuality: 0.6 },
      skin: { ...FACE.skin, regionSpreadDeltaE: spread, whiteBalance: { ...FACE.skin.whiteBalance, deltaE: wb } },
    });
    const a = build(bad(23.3, 4.2));
    const b = build(bad(16, 1));
    expect(a.confidence.grade).toBe('low');
    expect(a.confidence.score).toBeLessThan(50);
    expect(a.confidence.gradeLabel).toContain('재촬영');
    expect(a.cautions.items[0]).toMatch(/^재촬영 권장: 백열등\(2,300K\) 아래에서/);
    expect(b.confidence.score).not.toBe(a.confidence.score);
    expect(normal.cautions.items.some((c) => c.startsWith('재촬영 권장'))).toBe(false);
    // 자연광이면 편차가 커도 상한 없음
    const daylightSpread = build({ ...FACE, skin: { ...FACE.skin, regionSpreadDeltaE: 23 } });
    expect(daylightSpread.confidence.gradeLabel).not.toContain('재촬영');
  });

  it('템플릿 리포트는 변형 안내 대상이 아니다', () => {
    expect(variantUsesTemplateNarrative(build())).toBe(false);
    expect(variantUsesTemplateNarrative(build(FACE, 'male', 'rules'))).toBe(false);
  });
});

describe('Gate 1 실제 AI 응답 보정', () => {
  it('분석도구 라벨은 공급자 이름 대신 실제 모델을 쓴다', () => {
    const cls = classifyFace(FACE);
    const r = assembleReport({
      id: 'pcr_test',
      now: '2026-11-24T00:00:00.000Z',
      faceSessionId: 'face_x',
      face: FACE,
      bodySessionId: null,
      body: null,
      gender: 'male',
      userSelected: false,
      classification: cls,
      narrative: templateNarrative(cls, FACE, 'male'),
      narrativeSource: 'ai',
      model: 'gpt-6.2-sol',
    });
    expect(r.header.tool).toBe('CELEBER 피부색 측정·규칙 분류 + AI 비전 (gpt-6.2-sol)');
  });

  it("AI 그루밍 제안 앞의 항목 이름('피부: ')을 뗀다", () => {
    const cls = classifyFace(FACE);
    const base = templateNarrative(cls, FACE, 'unspecified');
    const ai = { grooming: ['피부: 얇게 바르세요.', '눈썹 : 빈 곳만 채우세요.', '헤어 스타일링: 결을 정돈하세요.', '주 2회: 각질을 정리하세요.'] } as AiNarrative;
    const m = mergeAiNarrative(base, { ...ai, firstImpression: [], hashtags: [], imageKeywords: [], todayActions: [] } as AiNarrative);
    expect(m.grooming).toEqual(['얇게 바르세요.', '빈 곳만 채우세요.', '결을 정돈하세요.', '주 2회: 각질을 정리하세요.']);
  });

  it('촬영 경고의 엠대시를 리포트 문구에서 뺀다', () => {
    const face = { ...FACE, warnings: [{ code: 'front:pitch', severity: 'warn' as const, message: '정면 — 카메라를 눈높이에 맞춰 주세요' }] };
    const r = build(face);
    expect(r.cautions.items).toContain('이번 촬영(정면): 카메라를 눈높이에 맞춰 주세요');
    expect(r.cautions.items.join(' ')).not.toContain('—');
  });
});
