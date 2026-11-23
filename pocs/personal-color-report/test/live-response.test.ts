/**
 * 실제 서버 응답 JSON 계약 검증 (기본 건너뜀).
 * 실행: CELEBER_PCR_LIVE_DIR=<응답 JSON 폴더> pnpm --filter @celeber/personal-color-report exec vitest run test/live-response.test.ts
 * 폴더 규칙: api-*.json·ui-*.json = POST /api/report/generate 응답(ui-*는 {status, body}로 감쌈),
 * patch-*.json·get-*.json·latest.json = 리포트, list.json = 목록, inputs.json = 입력 후보.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PersonalColorReportSchema, PersonalColorReportSummarySchema } from '@celeber/core/contracts';
import { GenerateResponseSchema, InputsResponseSchema } from '../src/lib/api';

const dir = process.env.CELEBER_PCR_LIVE_DIR;
const files = dir ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir!, f), 'utf8'));

describe.skipIf(!dir)('실제 응답 계약', () => {
  it.each(files.filter((f) => /^(api|ui)-/.test(f)))('%s: 생성 응답이 계약을 통과하고 실제 AI 서술이다', (f) => {
    const raw = read(f);
    const g = GenerateResponseSchema.parse(f.startsWith('ui-') ? raw.body : raw);
    expect(g.aiSource).toBe('ai');
    expect(g.report.source).toBe('hybrid');
    expect(g.report.isMock).toBe(false);
    expect(g.report.aiOpinion).toBeDefined();
  });

  it.each(files.filter((f) => /^(patch|get)-|^latest/.test(f)))('%s: 리포트 계약', (f) => {
    PersonalColorReportSchema.parse(read(f));
  });

  it('목록·입력 후보 계약', () => {
    if (files.includes('list.json')) for (const s of read('list.json').reports) PersonalColorReportSummarySchema.parse(s);
    if (files.includes('inputs.json')) InputsResponseSchema.parse(read('inputs.json'));
  });
});
