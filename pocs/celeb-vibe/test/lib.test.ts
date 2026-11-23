import { describe, expect, it } from 'vitest';
import { VibeAnalysisSchema } from '@celeber/core/contracts';
import { deltaE2000, hexToLab, rgbToLab } from '@celeber/core/color';
import {
  VibeAiSchema,
  VibeMeasurementSchema,
  assembleVibeAnalysis,
  buildRuleDraft,
  buildVibePrompt,
  dominantColors,
  draftToAi,
  estimateBodyRatios,
  forceAnalyzable,
  framingFromPose,
  judgeAnalyzability,
  mergeClusterSets,
  mergePersonalColor,
  normalizeHex,
  outfitRegions,
  poseVisibility,
  headCrop,
  rulePalette,
  ruleStyleKeywords,
  sanitizeAiItems,
  sceneStats,
  serverImageStats,
  summarizeVibe,
  thickSegment,
  toneAgreement,
  vibeColorConfidence,
} from '../src/lib';
import { measurement, standingPose } from './fixtures';

const img = { uploadId: 'up_test', url: '/api/uploads/up_test', width: 1200, height: 1800 };

describe('dominantColors (k-means Lab)', () => {
  it('두 색 픽셀에서 면적 순으로 대표색을 복원한다', () => {
    const px = [...Array(700).fill({ r: 31, g: 42, b: 68 }), ...Array(300).fill({ r: 240, g: 240, b: 235 })];
    const c = dominantColors(px, { k: 3 });
    expect(c.length).toBe(2);
    expect(c[0].hex).toBe('#1F2A44');
    expect(c[0].share).toBeCloseTo(0.7, 1);
    expect(deltaE2000(rgbToLab(c[1].rgb), rgbToLab({ r: 240, g: 240, b: 235 }))).toBeLessThan(1);
  });
  it('결정적: 같은 입력이면 같은 결과', () => {
    const px = Array.from({ length: 2000 }, (_, i) => ({ r: (i * 37) % 255, g: (i * 91) % 255, b: (i * 13) % 255 }));
    expect(dominantColors(px, { k: 4 })).toEqual(dominantColors(px, { k: 4 }));
  });
  it('빈 입력은 빈 배열', () => expect(dominantColors([])).toEqual([]));
  it('mergeClusterSets: 가까운 색은 합치고 가중치로 비율 계산', () => {
    const m = mergeClusterSets([
      { clusters: [{ rgb: { r: 30, g: 40, b: 70 }, hex: '#1E2846', share: 1 }], weight: 3 },
      { clusters: [{ rgb: { r: 32, g: 41, b: 69 }, hex: '#202945', share: 1 }], weight: 1 },
      { clusters: [{ rgb: { r: 250, g: 250, b: 250 }, hex: '#FAFAFA', share: 1 }], weight: 1 },
    ]);
    expect(m.length).toBe(2);
    expect(m[0].share).toBeCloseTo(0.8, 2);
  });
});

describe('pose → 영역/프레이밍/체형', () => {
  const kp = standingPose();
  it('전신 판정', () => {
    const v = poseVisibility(kp);
    expect(v).toEqual({ head: true, shoulders: true, hips: true, knees: true, ankles: true });
    expect(framingFromPose(v, true)).toBe('full-body');
    expect(framingFromPose({ ...v, ankles: false, knees: false }, true)).toBe('upper-body');
    expect(framingFromPose({ head: true, shoulders: false, hips: false, knees: false, ankles: false }, true)).toBe('face');
  });
  it('의상 영역 5종 생성, 몸통 가운데는 어깨-골반 사이', () => {
    const regs = outfitRegions(kp, 2 / 3);
    expect(regs.map((r) => r.key)).toEqual(['torsoCenter', 'torsoSides', 'arms', 'legs', 'feet']);
    const center = regs[0].polys[0];
    for (const p of center) {
      expect(p.y).toBeGreaterThan(0.22);
      expect(p.y).toBeLessThan(0.5);
      expect(p.x).toBeGreaterThan(0.38);
      expect(p.x).toBeLessThan(0.62);
    }
  });
  it('어깨가 안 보이면 영역 없음', () => {
    const k2 = kp.map((p, i) => (i === 11 || i === 12 ? { ...p, v: 0.1 } : p));
    expect(outfitRegions(k2, 2 / 3)).toEqual([]);
  });
  it('thickSegment: 선분 수직 방향으로 폭을 가진 사각형', () => {
    const poly = thickSegment({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.6 }, 0.05, 1);
    const xs = poly.map((p) => p.x).sort();
    expect(xs[0]).toBeCloseTo(0.45, 5);
    expect(xs[3]).toBeCloseTo(0.55, 5);
  });
  it('체형 비율: 얼굴 상자 기준 등신/다리 비율', () => {
    const b = estimateBodyRatios(kp, 2 / 3, { x: 0.46, y: 0.06, w: 0.08, h: 0.1 })!;
    // 머리 높이 0.135, 머리 꼭대기 0.025, 발 0.92 → 키 0.895 → 약 6.6등신
    expect(b.headsTall).toBeCloseTo(0.895 / 0.135, 1);
    expect(b.legToHeight).toBeCloseTo((0.92 - 0.5) / 0.895, 2);
    expect(b.shoulderToHip).toBeCloseTo(0.24 / 0.12, 1);
  });
  it('headCrop: 코 중심의 정사각 영역, 얼굴이 없을 때 코→어깨 기준 등신', () => {
    const c = headCrop(kp, 1200, 1800)!;
    expect(c.x).toBeLessThan(0.5);
    expect(c.x + c.w).toBeGreaterThan(0.5);
    expect(c.y).toBeLessThan(0.12);
    // 정사각(원본 픽셀)이되 이미지 위쪽 경계에서 잘린다
    expect(c.w * 1200).toBeGreaterThanOrEqual(c.h * 1800 - 1);
    expect(c.y).toBe(0);
    // 얼굴 없이: 코 0.12 → 어깨 0.22, 머리 0.115 → 약 7.6등신
    const b = estimateBodyRatios(kp, 2 / 3)!;
    expect(b.headsTall).toBeGreaterThan(7);
    expect(b.headsTall).toBeLessThan(8.5);
  });
  it('발이 안 보이면 체형 비율 없음', () => {
    const k2 = kp.map((p, i) => (i >= 27 ? { ...p, v: 0 } : p));
    expect(estimateBodyRatios(k2, 2 / 3)).toBeUndefined();
  });
});

describe('분석 가능성 규칙', () => {
  it('정상 전신 사진: 모두 가능', () => {
    const a = judgeAnalyzability(measurement(), undefined);
    expect(a.analyzable).toBe(true);
    expect(a.partial).toEqual({ outfit: true, personalColor: true, mood: true });
    expect(a.framing).toBe('full-body');
    expect(a.personCount).toBe(1);
  });
  it('여러 명: 분석 불가 → force로 경고로 낮춤', () => {
    const a = judgeAnalyzability(measurement({ faceCount: 2, poseCount: 2 }), undefined);
    expect(a.analyzable).toBe(false);
    expect(a.reasons.map((r) => r.code)).toContain('multiple-people');
    const f = forceAnalyzable(a);
    expect(f.analyzable).toBe(true);
    expect(f.reasons.find((r) => r.code === 'multiple-people')?.severity).toBe('warn');
  });
  it('인물 없음', () => {
    const a = judgeAnalyzability(measurement({ faceCount: 0, poseCount: 0, face: undefined, pose: undefined, regions: [] }), undefined);
    expect(a.analyzable).toBe(false);
    expect(a.reasons[0].code).toBe('no-person');
  });
  it('역광: 퍼스널컬러만 불가', () => {
    const m = measurement();
    m.face!.faceMeanLuma = 70;
    m.scene.meanLuma = 180;
    const a = judgeAnalyzability(m, undefined);
    expect(a.reasons.map((r) => r.code)).toContain('backlight');
    expect(a.partial.personalColor).toBe(false);
    expect(a.partial.outfit).toBe(true);
    expect(a.analyzable).toBe(true);
  });
  it('흑백: 색 분석 불가', () => {
    const m = measurement();
    m.scene.grayscale = true;
    const a = judgeAnalyzability(m, undefined);
    expect(a.analyzable).toBe(false);
    expect(a.reasons.map((r) => r.code)).toContain('heavy-filter');
  });
  it('저해상도·작은 얼굴', () => {
    const m = measurement({ width: 300, height: 400 });
    m.face!.heightPx = 30;
    const codes = judgeAnalyzability(m, undefined).reasons.map((r) => r.code);
    expect(codes).toEqual(expect.arrayContaining(['low-resolution', 'face-too-small']));
  });
  it('몸은 보이는데 얼굴 랜드마크 없음 → 가림', () => {
    const a = judgeAnalyzability(measurement({ face: undefined, faceCount: 0 }), undefined);
    expect(a.reasons.map((r) => r.code)).toContain('occluded');
    expect(a.partial.personalColor).toBe(false);
  });
});

describe('규칙 초안', () => {
  it('열린 아우터 판별: 가운데(화이트)와 양옆·소매(네이비)가 다르면 아우터+이너', () => {
    const d = buildRuleDraft(measurement(), undefined);
    const cats = d.outfit.items.map((i) => i.category);
    expect(cats).toEqual(['outer', 'top', 'bottom', 'shoes']);
    expect(d.outfit.items[0].color.hex).toBe('#1F2A44');
    expect(d.outfit.items[1].color.hex).toBe('#F5F3EE');
    expect(d.outfit.items.every((i) => i.box)).toBe(true);
    // 종류·소재는 지어내지 않는다
    expect(d.outfit.items.every((i) => i.material === undefined && i.fit === undefined)).toBe(true);
  });
  it('측정이 있으면 서버 중앙 휴리스틱(하의 오인)을 쓰지 않는다', () => {
    const stats = { width: 1, height: 1, meanLuma: 120, clippedHigh: 0, clippedLow: 0, meanSaturation: 0.2, grayscale: false, centerToBorderLuma: 1, heuristicUpper: [{ rgb: { r: 0, g: 0, b: 0 }, hex: '#000000', share: 1 }], heuristicLower: [{ rgb: { r: 255, g: 255, b: 255 }, hex: '#FFFFFF', share: 1 }] };
    expect(buildRuleDraft(measurement({ regions: [] }), stats).outfit.items).toEqual([]);
    expect(buildRuleDraft(undefined, stats).outfit.items.length).toBe(2);
  });
  it('팔레트: 주조색은 가장 넓은 면적, 포인트는 채도 높은 색 또는 입술', () => {
    const p = rulePalette(
      [
        { rgb: { r: 31, g: 42, b: 68 }, hex: '#1F2A44', share: 0.5 },
        { rgb: { r: 245, g: 243, b: 238 }, hex: '#F5F3EE', share: 0.3 },
        { rgb: { r: 200, g: 30, b: 40 }, hex: '#C81E28', share: 0.05 },
      ],
      undefined,
    );
    expect(p.main.map((c) => c.hex)).toEqual(['#1F2A44', '#F5F3EE']);
    expect(p.accent[0].hex).toBe('#C81E28');
    const p2 = rulePalette([{ rgb: { r: 60, g: 60, b: 60 }, hex: '#3C3C3C', share: 1 }], { r: 190, g: 100, b: 110 });
    expect(p2.accent[0].name).toContain('입술');
  });
  it('스타일 키워드: 네이비+화이트 → 클래식', () => {
    const kw = ruleStyleKeywords({ main: [{ hex: '#1F2A44', name: '네이비' }, { hex: '#F5F3EE', name: '화이트' }], sub: [], accent: [] });
    expect(kw[0]).toBe('클래식');
    expect(ruleStyleKeywords({ main: [{ hex: '#FF2200', name: '레드' }], sub: [], accent: [] })).toContain('스트릿');
  });
  it('퍼스널컬러: 측정 기반 분류, 신뢰도는 상한 0.85 이하이고 측정 품질에 따라 변한다', () => {
    const good = buildRuleDraft(measurement(), undefined).personalColor.pc;
    expect(good.measured).toBe(true);
    expect(good.tone).toBeDefined();
    expect(good.axes).toBeDefined();
    expect(good.confidence).toBeLessThanOrEqual(0.85);
    const m = measurement();
    m.face!.skin.used = 300;
    m.face!.heightPx = 80;
    m.face!.regionSpreadDeltaE = 9;
    const worse = buildRuleDraft(m, undefined).personalColor.pc;
    expect(worse.confidence).toBeLessThan(good.confidence);
    expect(good.lightingCaveat).toContain('스튜디오 조명');
  });
  it('흑백이면 톤을 추정하지 않는다', () => {
    const m = measurement();
    m.scene.grayscale = true;
    const pc = buildRuleDraft(m, undefined).personalColor.pc;
    expect(pc.tone).toBeUndefined();
    expect(pc.confidence).toBe(0);
  });
  it('vibeColorConfidence: 일치하면 오르고 불일치면 내려간다', () => {
    const base = { measured: true, conditionsOk: true, skinUsed: 3000, faceHeightPx: 200, lumaStd: 10, regionSpreadDeltaE: 2, classifierMargin: 0.1, hasHair: true, hasEyes: true } as const;
    const agree = vibeColorConfidence({ ...base, agreement: true }).score;
    const none = vibeColorConfidence({ ...base, agreement: null }).score;
    const disagree = vibeColorConfidence({ ...base, agreement: false }).score;
    expect(agree).toBeGreaterThan(none);
    expect(none).toBeGreaterThan(disagree);
    expect(vibeColorConfidence({ ...base, agreement: true, conditionsOk: false }).score).toBeLessThanOrEqual(0.3);
  });
  it('toneAgreement', () => {
    expect(toneAgreement('summer-mute', 'summer-mute')).toBe(true);
    expect(toneAgreement('summer-mute', 'summer-light')).toBe('season-only');
    expect(toneAgreement('summer-mute', 'autumn-deep')).toBe(false);
    expect(toneAgreement(undefined, 'autumn-deep')).toBeNull();
  });
});

describe('Mock 조립 (AI 없음)', () => {
  it('draftToAi는 AI 스키마를 통과하고, 조립 결과는 계약을 통과한다', () => {
    const m = measurement();
    const d = buildRuleDraft(m, undefined);
    const mock = draftToAi(d);
    expect(VibeAiSchema.safeParse(mock).success).toBe(true);
    const a = assembleVibeAnalysis({ id: 'vibe_1', createdAt: '2026-11-23T00:00:00.000Z', image: img, celebName: ' 데모 ', draft: d, measurement: m, ai: { data: mock, source: 'mock', model: null } });
    expect(VibeAnalysisSchema.safeParse(a).success).toBe(true);
    expect(a.isMock).toBe(true);
    expect(a.source).toBe('mock');
    expect(a.celebName).toBe('데모');
    expect(a.body?.measured).toBe(true);
    expect(a.palette.main.length).toBeGreaterThan(0);
    expect(a.lookName).toMatch(/룩$/);
    expect(summarizeVibe(a).palette.length).toBeGreaterThan(0);
  });
  it('결정적: 같은 측정값이면 같은 결과', () => {
    const run = () => {
      const d = buildRuleDraft(measurement(), undefined);
      return assembleVibeAnalysis({ id: 'x', createdAt: 't', image: img, draft: d, ai: { data: draftToAi(d), source: 'mock', model: null } });
    };
    expect(run()).toEqual(run());
  });
  it('측정 스키마 왕복', () => {
    expect(VibeMeasurementSchema.safeParse(measurement()).success).toBe(true);
    expect(VibeMeasurementSchema.safeParse({ ...measurement(), width: -1 }).success).toBe(false);
  });
  it('프롬프트에 측정값은 들어가고 인물 이름은 들어가지 않는다', () => {
    const d = buildRuleDraft(measurement(), undefined);
    const p = buildVibePrompt(d, measurement(), undefined);
    expect(p).toContain('#1F2A44');
    expect(p).not.toContain('데모');
  });
  it('프롬프트에 규칙 톤·축을 넣지 않는다 (AI 톤 교차 검증이 독립이어야 함)', () => {
    const d = buildRuleDraft(measurement(), undefined);
    expect(d.personalColor.pc.tone).toBeTruthy();
    const p = buildVibePrompt(d, measurement(), undefined);
    expect(p).toContain(d.personalColor.pc.skin!.hex);
    expect(p).not.toContain(d.personalColor.pc.tone!);
    expect(p).not.toMatch(/ruleTone|ruleAxes|"warmth"/);
  });
});

describe('AI 결과 병합', () => {
  const m = measurement();
  const d = buildRuleDraft(m, undefined);
  const ai = draftToAi(d);
  ai.outfit.items = [
    { category: 'outer', name: '싱글 블레이저', color: { hex: '1f2a44', name: '네이비' }, secondaryColors: [], material: '울', fit: '레귤러', pattern: '', note: '', box: { x: -0.1, y: 0.2, w: 0.5, h: 2 } },
    { category: 'top', name: '셔츠', color: { hex: 'not-a-color', name: '' }, secondaryColors: [{ hex: '#zzz', name: 'x' }], material: '', fit: '', pattern: '', note: '', box: { x: 0, y: 0, w: 0, h: 0 } },
    { category: 'bag', name: '가방', color: { hex: 'nope', name: '' }, secondaryColors: [], material: '', fit: '', pattern: '', note: '', box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
  ];
  it('hex 정규화, 잘못된 색은 측정색으로 대체하거나 제외, box는 0..1로 자름', () => {
    const items = sanitizeAiItems(ai.outfit.items, d.outfit.items);
    expect(items.map((i) => i.category)).toEqual(['outer', 'top']);
    expect(items[0].color.hex).toBe('#1F2A44');
    expect(items[0].box).toEqual({ x: 0, y: 0.2, w: 0.5, h: 0.8 });
    expect(items[0].material).toBe('울');
    expect(items[1].color.hex).toBe('#F5F3EE'); // 측정색으로 대체
    expect(items[1].box).toEqual(d.outfit.items[1].box); // 측정 box로 대체
    expect(items[1].secondaryColors).toBeUndefined();
  });
  it('AI 출처면 hybrid, AI 아이템/키워드 사용', () => {
    const a = assembleVibeAnalysis({ id: 'v', createdAt: 't', image: img, draft: d, measurement: m, ai: { data: { ...ai, lookName: '네이비 블레이저 룩' }, source: 'ai', model: 'claude-opus-5-5' } });
    expect(a.source).toBe('hybrid');
    expect(a.isMock).toBe(false);
    expect(a.model).toBe('claude-opus-5-5');
    expect(a.outfit.items[0].name).toBe('싱글 블레이저');
    expect(a.lookName).toBe('네이비 블레이저 룩');
  });
  it('측정 퍼스널컬러가 기준이고 AI 일치 여부로 신뢰도가 바뀐다', () => {
    const tone = d.personalColor.pc.tone!;
    const same = mergePersonalColor(d.personalColor, { ...ai.personalColor, tone, evidence: ['볼에 붉은 기'] }, true, false);
    const diff = mergePersonalColor(d.personalColor, { ...ai.personalColor, tone: tone.startsWith('winter') ? 'spring-warm' : 'winter-deep', evidence: [] }, true, false);
    expect(same.tone).toBe(tone);
    expect(diff.tone).toBe(tone);
    expect(same.confidence).toBeGreaterThan(diff.confidence);
    expect(same.evidence.join(' ')).toContain('측정 판정과 일치');
  });
  it('측정이 없으면 AI 톤과 AI 색으로 축을 계산한다', () => {
    const d2 = buildRuleDraft(undefined, undefined);
    const pc = mergePersonalColor(d2.personalColor, { skinHex: '#E8C4B0', hairHex: '#2A2224', eyeHex: '#3A2A22', tone: 'summer-mute', undertone: 'cool', confidence: 0.6, evidence: ['노란 기가 적음'], lightingCaveat: '실내 조명' }, true, false);
    expect(pc.measured).toBe(false);
    expect(pc.tone).toBe('summer-mute');
    expect(pc.season).toBe('summer');
    expect(pc.axes).toBeDefined();
    expect(pc.confidence).toBeLessThanOrEqual(0.55 + 0.1);
    expect(pc.lightingCaveat).toContain('실내 조명');
  });
  it('AI가 not-photo를 보고하면 분석 불가로 병합', () => {
    const a = assembleVibeAnalysis({
      id: 'v',
      createdAt: 't',
      image: img,
      draft: d,
      measurement: m,
      ai: { data: { ...ai, analyzability: { ...ai.analyzability, issues: [{ code: 'not-photo', message: '일러스트입니다.' }] } }, source: 'ai', model: 'm' },
    });
    expect(a.analyzability.analyzable).toBe(false);
    expect(a.analyzability.reasons.map((r) => r.code)).toContain('not-photo');
  });
  it('normalizeHex', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC');
    expect(normalizeHex('a1b2c3')).toBe('#A1B2C3');
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});

describe('장면/서버 통계', () => {
  const make = (w: number, h: number, f: (x: number, y: number) => [number, number, number]) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [r, g, b] = f(x, y);
        const i = (y * w + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    return { data, width: w, height: h };
  };
  it('흑백 사진 감지', () => {
    const s = sceneStats(make(64, 64, (x) => [x * 4, x * 4, x * 4]));
    expect(s.grayscale).toBe(true);
    expect(sceneStats(make(64, 64, () => [200, 60, 60])).grayscale).toBe(false);
  });
  it('서버 휴리스틱: 상단 피부, 중앙 상의, 하단 하의 색', () => {
    const W = 120;
    const H = 180;
    const p = make(W, H, (x, y) => {
      const nx = x / W;
      const ny = y / H;
      if (nx < 0.2 || nx > 0.8) return [230, 230, 228];
      if (ny < 0.25) return [226, 190, 172];
      if (ny < 0.56) return [31, 42, 68];
      return [120, 120, 125];
    });
    const s = serverImageStats(p, { width: 1200, height: 1800 });
    expect(s.width).toBe(1200);
    expect(s.heuristicSkin).toBeDefined();
    expect(deltaE2000(rgbToLab(s.heuristicUpper[0].rgb), hexToLab('#1F2A44'))).toBeLessThan(2);
    expect(deltaE2000(rgbToLab(s.heuristicLower[0].rgb), rgbToLab({ r: 120, g: 120, b: 125 }))).toBeLessThan(2);
    const d = buildRuleDraft(undefined, s);
    expect(d.outfit.items.map((i) => i.category)).toEqual(['top', 'bottom']);
    expect(d.personalColor.pc.measured).toBe(false);
    expect(d.personalColor.pc.confidence).toBeLessThan(0.3);
    expect(d.analyzability.reasons.map((r) => r.code)).toContain('other');
  });
});

describe('전신 비율 범위 (마무리 검증 회귀)', () => {
  it('사람 범위를 벗어난 등신·비율은 측정하지 않은 것으로 본다', async () => {
    const { plausibleBody } = await import('../src/lib/build');
    expect(plausibleBody({ headsTall: 7.3, legToHeight: 0.5 })).toBe(true);
    expect(plausibleBody({})).toBe(true);
    expect(plausibleBody({ headsTall: 1e300 })).toBe(false);
    expect(plausibleBody({ headsTall: 7, shoulderToHip: -1 })).toBe(false);
  });
});
