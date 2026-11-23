/**
 * Gate 1 잔여(critic pcr-r2) 정리: ⑭ ROI 누락 안내(core 새 문구), ⑬ 마침표, 빈 업로드 문구, ② 적합도/신뢰도 구분.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FaceAnalysis, FaceAnalysisSchema } from '@celeber/core/contracts';
import { buildSkinMeasurement } from '@celeber/core/face';
import { assembleReport, classifyFace, skinReasonTexts, templateNarrative } from '../src/lib';
import fixture from './fixtures/face-analysis.json';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'celeber-pcr-g1b-'));
process.env.CELEBER_DATA_DIR = tmp;
process.env.CELEBER_FORCE_MOCK = '1';

type Routes = typeof import('../src/routes');
let R: Routes;
beforeAll(async () => {
  R = await import('../src/routes');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

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

/** core buildSkinMeasurement가 실제로 내는 사유 문구 (문구가 바뀌면 이 테스트가 잡는다) */
function coreReasons(missing: ('forehead' | 'leftCheek' | 'rightCheek' | 'chin')[]): string[] {
  const c = { rgb: { r: 200, g: 160, b: 140 }, used: 3000, total: 3200, lumaStd: 10, channelStd: { r: 5, g: 5, b: 5 } };
  const all = ['forehead', 'leftCheek', 'rightCheek', 'chin'] as const;
  const regions = Object.fromEntries(all.filter((r) => !missing.includes(r)).map((r) => [r, c]));
  return buildSkinMeasurement({ skin: { overall: c, regions, missing }, faceMeanLuma: 150 } as never, { method: 'none', gains: { r: 1, g: 1, b: 1 }, strength: 0 })
    .confidenceReasons;
}

describe('⑭ 피부 측정 품질: core ROI 누락 문구', () => {
  it('일부 ROI 누락 → 빠진 부위와 남은 개수를 안내', () => {
    const reasons = coreReasons(['leftCheek']);
    expect(skinReasonTexts(reasons)).toContain('왼쪽 볼 피부색을 읽지 못해 나머지 3곳으로 계산했습니다.');
    const d = build({ ...FACE, skin: { ...FACE.skin, confidenceReasons: reasons } }).confidence.factors.find((f) => f.key === 'skin-measurement')!.detail;
    expect(d).toContain('왼쪽 볼 피부색을 읽지 못해 나머지 3곳으로 계산했습니다.');
  });
  it('여러 곳 누락도 인식', () => {
    expect(skinReasonTexts(coreReasons(['forehead', 'chin']))).toContain('이마, 턱 피부색을 읽지 못해 나머지 2곳으로 계산했습니다.');
  });
  it('전부 누락 → 재촬영 안내', () => {
    expect(skinReasonTexts(coreReasons(['forehead', 'leftCheek', 'rightCheek', 'chin']))[0]).toBe('피부 영역을 하나도 측정하지 못했습니다. 밝고 고른 조명에서 다시 촬영해 주세요.');
  });
});

describe('⑬ 이번 촬영 안내 문장 끝', () => {
  it('camera-face 경고에 마침표가 없어도 리포트 문장은 마침표로 끝난다', () => {
    const face: FaceAnalysis = { ...FACE, warnings: [{ code: 'face-dark', severity: 'error', message: '정면 — 얼굴이 너무 어둡습니다. 빛을 마주 봐 주세요' }] };
    const items = build(face).cautions.items;
    expect(items).toContain('이번 촬영(정면): 얼굴이 너무 어둡습니다. 빛을 마주 봐 주세요.');
    for (const t of items) expect(t).toMatch(/[.!?]$/);
  });
});

describe('POST /api/uploads 빈 본문', () => {
  it('본문이 없으면 "끝까지 읽지 못했다" 대신 사진 선택 안내', async () => {
    for (const req of [
      new Request('http://x/api/uploads', { method: 'POST' }),
      new Request('http://x/api/uploads', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=XYZ', 'content-length': '0' }, body: '' }),
      new Request('http://x/api/uploads', { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=XYZ' }, body: new ReadableStream({ start: (c) => c.close() }), duplex: 'half' } as RequestInit),
    ]) {
      const res = await R.uploadPOST(req);
      expect(res.status).toBe(400);
      const j = await res.json();
      expect(j.error.message).toBe('첨부된 사진이 없습니다. 사진을 선택해 주세요.');
    }
  });
});

describe('② 12톤 막대', () => {
  it('막대 %가 상대 적합도이고 판정 신뢰도는 따로라는 안내를 화면에 표시', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { PersonalColorReportView } = await import('../src/components');
    const r = build(FACE);
    const html = renderToStaticMarkup(createElement(PersonalColorReportView, { report: r }));
    expect(html).toContain(`12톤 사이의 상대 적합도입니다. 촬영 조건까지 반영한 판정 신뢰도는 ${r.confidence.score}%입니다.`);
  });
});
