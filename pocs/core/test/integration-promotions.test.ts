/** 통합 단계에서 앱 → core/ui로 승격한 기능 */
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { hexToLab } from '../src/color';
import { DARK_FEATURE_L_FLOOR, PHOTO_CLASSIFIER_OPTIONS, classifyMeasuredColors, classifyPersonalColor } from '../src/personal-color';
import { describeAiError } from '../src/server/ai';
import { mockNameFromQuery } from '../src/server/search';

describe('classifyMeasuredColors (personal-color-report 보정 승격)', () => {
  const skin = hexToLab('#EBCDBE');
  const hair = { l: 3, a: 1, b: 1 };
  it('PHOTO 프리셋 + L* 하한을 적용하고, inputs에는 실제 측정값을 남긴다', () => {
    const r = classifyMeasuredColors({ skin, hair });
    const manual = classifyPersonalColor({ skin, hair: { ...hair, l: DARK_FEATURE_L_FLOOR } }, PHOTO_CLASSIFIER_OPTIONS);
    expect(r.tone).toBe(manual.tone);
    expect(r.axes).toEqual(manual.axes);
    expect(r.inputs.hairLab?.l).toBe(3);
  });
  it('밝은 피부 + 검은 머리에서 대비 축이 포화되지 않는다 (기본 보정은 100)', () => {
    expect(classifyPersonalColor({ skin, hair }).axes.contrast).toBe(100);
    expect(classifyMeasuredColors({ skin, hair }).axes.contrast).toBeLessThan(100);
  });
  it('결정적', () => {
    expect(classifyMeasuredColors({ skin, hair })).toEqual(classifyMeasuredColors({ skin, hair }));
  });
});

describe('Mock 이미지 검색 이름 파싱', () => {
  it('공백이 든 이름을 키워드 앞까지 유지한다', () => {
    expect(mockNameFromQuery('강 이안 배우 화보 전신')).toBe('강 이안');
    expect(mockNameFromQuery('윤하람 2026 공항패션')).toBe('윤하람');
    expect(mockNameFromQuery('윤하람 사복 전신')).toBe('윤하람');
    expect(mockNameFromQuery('윤하람')).toBe('윤하람');
    expect(mockNameFromQuery('  ')).toBe('데모');
  });
});

describe('describeAiError: 화면용 짧은 한국어 요약', () => {
  it('API 오류 본문(JSON·request_id)을 그대로 노출하지 않는다', () => {
    const body = { type: 'error', error: { type: 'invalid_request_error', message: 'You have reached your specified API usage limits.' }, request_id: 'req_abc' };
    const e = new Anthropic.BadRequestError(400, body, JSON.stringify(body), new Headers());
    const msg = describeAiError(e);
    expect(msg).toBe('API 사용 한도 초과');
    expect(msg).not.toContain('req_');
    const other = new Anthropic.BadRequestError(400, { request_id: 'req_x' }, '{"request_id":"req_x"}', new Headers());
    expect(describeAiError(other)).not.toContain('req_x');
  });
  it('일반 오류는 첫 줄 120자', () => {
    expect(describeAiError(new Error('a\nb')).length).toBe(1);
    expect(describeAiError(new Error('x'.repeat(500))).length).toBe(120);
  });
});
