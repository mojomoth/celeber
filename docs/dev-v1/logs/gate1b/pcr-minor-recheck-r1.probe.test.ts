/**
 * pcr minor r1 독립 재검증 프로브: core buildSkinMeasurement + camera-face 사유 순서 → app skinReasonTexts.
 * 실행: pocs/personal-color-report 에서 pnpm exec vitest run --config <scratch>/vitest.probe.config.ts
 */
import { describe, expect, it } from 'vitest';
import { buildSkinMeasurement } from '../../../../pocs/core/src/face/sample';
import { skinReasonTexts } from '../../../../pocs/personal-color-report/src/lib/assemble';

type R = 'forehead' | 'leftCheek' | 'rightCheek' | 'chin';
function core(missing: R[], used = 3000, lumaStd = 10): string[] {
  const c = { rgb: { r: 200, g: 160, b: 140 }, used, total: used + 100, lumaStd, channelStd: { r: 5, g: 5, b: 5 } };
  const all: R[] = ['forehead', 'leftCheek', 'rightCheek', 'chin'];
  const regions = Object.fromEntries(all.filter((r) => !missing.includes(r)).map((r) => [r, c]));
  return buildSkinMeasurement({ skin: { overall: c, regions, missing }, faceMeanLuma: 150 } as never, { method: 'none', gains: { r: 1, g: 1, b: 1 }, strength: 0 }).confidenceReasons;
}
const ROI = /피부색을 읽지 못해 나머지 \d+곳으로 계산했습니다\./;

describe('ROI 누락 단독', () => {
  for (const m of [['leftCheek'], ['rightCheek'], ['forehead', 'chin'], ['forehead', 'leftCheek', 'rightCheek']] as R[][]) {
    it(m.join('+'), () => {
      const out = skinReasonTexts(core(m));
      console.log('[single]', m.join('+'), JSON.stringify(out));
      expect(out.some((t) => ROI.test(t))).toBe(true);
    });
  }
  it('all missing', () => {
    const out = skinReasonTexts(core(['forehead', 'leftCheek', 'rightCheek', 'chin']));
    console.log('[all]', JSON.stringify(out));
    expect(out[0]).toMatch(/하나도/);
  });
});

describe('camera-face 순서(wb.reasons unshift + 뒤에 push)와 결합', () => {
  it('조명 추정 신뢰도 낮음 + 배경 없음 + ROI 누락', () => {
    const reasons = ['조명 추정 신뢰도가 낮아 보정 강도를 낮췄습니다.', '보정에 쓸 배경 정보가 없어 원본 색을 사용합니다.', ...core(['leftCheek'])];
    const out = skinReasonTexts(reasons);
    console.log('[combo1]', JSON.stringify(out));
    expect(out.some((t) => ROI.test(t))).toBe(true);
  });
  it('조명 추정 신뢰도 낮음 + 픽셀 적음 + ROI 누락', () => {
    const reasons = ['조명 추정 신뢰도가 낮아 보정 강도를 낮췄습니다.', '얼굴 사진 배경 gray-world 게인, 강도 0.3', ...core(['leftCheek'], 500)];
    const out = skinReasonTexts(reasons);
    console.log('[combo2]', JSON.stringify(out));
    expect(out.some((t) => ROI.test(t))).toBe(true);
  });
  it('흔한 경우: gray-world + ROI 누락 + 촬영 오류', () => {
    const reasons = ['얼굴 사진 배경 gray-world 게인, 강도 0.6', ...core(['rightCheek']), '조명 품질 40점 반영', '촬영 품질 오류(얼굴 어두움) 1건이 있어 신뢰도를 낮췄습니다.'];
    const out = skinReasonTexts(reasons);
    console.log('[combo3]', JSON.stringify(out));
    expect(out.some((t) => ROI.test(t))).toBe(true);
  });
});

/* ---- Codex 2차 의견 재현 ---- */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FaceAnalysisSchema } from '../../../../pocs/core/src/contracts';
import { assembleReport, classifyFace, templateNarrative } from '../../../../pocs/personal-color-report/src/lib';
import fixture from '../../../../pocs/personal-color-report/test/fixtures/face-analysis.json';
const FACE = FaceAnalysisSchema.parse(fixture);
const build = (face: typeof FACE) => {
  const cls = classifyFace(face);
  return assembleReport({ id: 'pcr_t', now: '2026-11-24T00:00:00.000Z', faceSessionId: 'f', face, bodySessionId: null, body: null, gender: 'male', userSelected: false, classification: cls, narrative: templateNarrative(cls, face, 'male'), narrativeSource: 'mock' });
};

describe('codex #2 턱만 측정', () => {
  it('⑭ skin-measurement / skin-uniformity 문구', () => {
    const reasons = core(['forehead', 'leftCheek', 'rightCheek']);
    const chin = FACE.skin.regions.find((r) => r.region === 'chin') ?? FACE.skin.regions[0];
    const face = { ...FACE, skin: { ...FACE.skin, regions: [{ ...chin, region: 'chin' as const }], regionSpreadDeltaE: 0, confidence: 0.8, confidenceReasons: reasons } };
    const f = build(face).confidence.factors.filter((x) => x.key === 'skin-measurement' || x.key === 'skin-uniformity');
    console.log('[chin-only]', JSON.stringify(f.map((x) => [x.key, x.score, x.detail]), null, 0));
  });
});

describe('codex #6 ⑬ 끝 공백', () => {
  it('trailing space', () => {
    const face = { ...FACE, warnings: [{ code: 'face-dark', severity: 'error' as const, message: '정면 — 얼굴이 어둡습니다. ' }] };
    console.log('[trail]', JSON.stringify(build(face).cautions.items.filter((t) => t.startsWith('이번 촬영'))));
  });
});

describe('codex #3 업로드 전송 중단', () => {
  it('content-length 있고 첫 청크 전에 끊김', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcr-probe-'));
    process.env.CELEBER_DATA_DIR = tmp;
    process.env.CELEBER_FORCE_MOCK = '1';
    const R = await import('../../../../pocs/personal-color-report/src/routes');
    const mk = (body: ReadableStream) => new Request('http://localhost/api/uploads', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=XYZ', 'content-length': '128' }, body, duplex: 'half' } as RequestInit);
    for (const [tag, s] of [['error', new ReadableStream({ start: (c) => c.error(new Error('aborted')) })], ['close', new ReadableStream({ start: (c) => c.close() })]] as const) {
      const res = await R.uploadPOST(mk(s));
      console.log('[abort]', tag, res.status, JSON.stringify(await res.json()));
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
