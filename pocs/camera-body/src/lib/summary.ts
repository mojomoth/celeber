/**
 * 후행 PoC(personal-color-report, celeb-vibe-report)가 바로 쓰는 요약 헬퍼 (순수 함수).
 */
import type { BodyAnalysis, PersonalColorReport } from '@celeber/core/contracts';
import { FRAMING_FAILURE_CODES, POSTURE_ISSUE_CODES } from './analyze';
import { buildStylingGuide, formatRatio } from './interpret';

export type BodyStyling = NonNullable<PersonalColorReport['bodyStyling']>;

/** PersonalColorReport.bodyStyling 형태로 변환. 측정이 완료되지 않았으면 null */
export function toBodyStyling(a: BodyAnalysis | null | undefined): BodyStyling | null {
  if (!a || a.status !== 'complete' || !a.ratios) return null;
  const guide = buildStylingGuide(a.ratios, a.frame?.type);
  return {
    frameLabel: a.frame?.label ?? '측정됨',
    headsTall: a.ratios.headsTall,
    suggestions: guide.suggestions,
    avoid: guide.avoid,
  };
}

export const BODY_STATUS_LABEL_KO: Record<BodyAnalysis['status'], string> = {
  complete: '측정 완료',
  skipped: '전신 사진 추가',
  failed: '측정 실패',
};

/** 한 줄 요약 (예: '7.3등신 · 상하 48:52 · 직사각형'). 건너뜀/실패는 상태 문구 */
export function bodyOneLiner(a: BodyAnalysis | null | undefined): string {
  if (!a || a.status === 'skipped') return BODY_STATUS_LABEL_KO.skipped;
  if (a.status === 'failed' || !a.ratios) return `${BODY_STATUS_LABEL_KO.failed}${a.failureReasons[0] ? `: ${a.failureReasons[0].message}` : ''}`;
  const parts = [formatRatio('headsTall', a.ratios.headsTall), `상하 ${formatRatio('upperToLower', a.ratios.upperToLower).replace(' : ', ':')}`];
  if (a.frame) parts.push(a.frame.label);
  return parts.join(' · ');
}

/** 리포트 행 (관찰 항목 + 한 줄 결론) */
export function bodySummaryRows(a: BodyAnalysis | null | undefined): { key: string; label: string; value: string; note?: string }[] {
  if (!a || a.status !== 'complete' || !a.ratios) return [];
  const rows: { key: string; label: string; value: string; note?: string }[] = [];
  for (const ins of a.insights) rows.push({ key: ins.key, label: ins.label, value: ins.display, note: ins.comment });
  if (a.frame) rows.push({ key: 'frame', label: '체형', value: a.frame.label, note: a.frame.evidence[0] });
  if (a.skeleton) rows.push({ key: 'skeleton', label: '골격 참고', value: a.skeleton.label, note: a.skeleton.evidence[0] });
  return rows;
}

const FRAMING_FAILURES = new Set<string>(FRAMING_FAILURE_CODES);
const POSTURE_ISSUES = new Set<string>(POSTURE_ISSUE_CODES);

/** 측정 신뢰 경고(자세/촬영 조건) 전체. 머리·몸 옆이 잘렸거나 사진이 누웠으면 그 탓에 생긴 자세 판정과 '여러 사람'은 뺀다(이전에 저장된 기록 포함) */
export function bodyIssues(a: BodyAnalysis): { code: string; message: string; severity?: 'info' | 'warn' | 'error' }[] {
  const all = [...a.failureReasons, ...(a.posture?.warnings ?? [])];
  const rotated = all.some((i) => i.code === 'photo-rotated');
  if (rotated) return all.filter((i) => i.code === 'photo-rotated' || i.code === 'low-light');
  return all.some((i) => FRAMING_FAILURES.has(i.code)) ? all.filter((i) => !POSTURE_ISSUES.has(i.code) && i.code !== 'multiple-people') : all;
}
