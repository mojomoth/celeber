/**
 * 분석 가능성 요약 (짧게): 판정 한 줄 + 코디/퍼스널컬러/분위기 가능 여부 + 사유.
 * 상태 없음 → 서버/클라이언트 양쪽에서 사용 가능.
 */
import type { CSSProperties } from 'react';
import type { Analyzability } from '@celeber/core/contracts';
import { Icon } from '@celeber/ui';
import { FRAMING_LABEL_KO, PC_REFERENCE_ONLY_MESSAGE, REASON_LABEL_KO } from '../lib/analyzability';

export function analyzabilityHeadline(a: Analyzability): { tone: 'ok' | 'warn' | 'danger'; text: string } {
  const p = a.partial;
  if (!a.analyzable) return { tone: 'danger', text: '이 사진은 분석하기 어렵습니다' };
  if (p.outfit && p.personalColor && p.mood) return { tone: 'ok', text: '코디·퍼스널컬러·분위기 모두 분석할 수 있습니다' };
  const ok = [p.outfit && '코디', p.personalColor && '퍼스널컬러', p.mood && '분위기'].filter(Boolean).join('·');
  if (!ok) return { tone: 'warn', text: '참고용 결과만 볼 수 있습니다' };
  return { tone: 'warn', text: `${ok}만 분석할 수 있습니다` };
}

const PILL: Record<'ok' | 'no', CSSProperties> = {
  ok: { background: 'var(--cb-ok-bg)', color: 'var(--cb-ok)' },
  no: { background: 'var(--cb-paper)', color: 'var(--cb-text-2)', textDecoration: 'line-through' },
};

export function AnalyzabilitySummary({ analyzability: a, compact }: { analyzability: Analyzability; compact?: boolean }) {
  const h = analyzabilityHeadline(a);
  const color = h.tone === 'ok' ? 'var(--cb-ok)' : h.tone === 'warn' ? 'var(--cb-warn)' : 'var(--cb-danger)';
  const parts: [string, boolean][] = [
    ['코디', a.partial.outfit],
    ['퍼스널컬러', a.partial.personalColor],
    ['분위기', a.partial.mood],
  ];
  const reasons = compact ? a.reasons.filter((r) => r.severity !== 'info') : a.reasons;
  return (
    <div className="cb-stack-sm" aria-live="polite">
      <div className="cb-row" style={{ color, fontWeight: 700, fontSize: 15 }}>
        <Icon name={h.tone === 'ok' ? 'check-circle' : 'warn'} size={18} />
        <span>{h.text}</span>
      </div>
      <div className="cb-row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {parts.map(([label, ok]) => (
          <span key={label} className="cb-caption" style={{ ...PILL[ok ? 'ok' : 'no'], padding: '3px 10px', borderRadius: 999, fontWeight: 600 }}>
            {label}
          </span>
        ))}
        <span className="cb-caption cb-muted" style={{ marginLeft: 4 }}>
          {FRAMING_LABEL_KO[a.framing]} · {statsOnly(a) ? '인물 수 미확인 (사진 통계 추정)' : `인물 ${a.personCount}명`}
        </span>
      </div>
      {reasons.length ? (
        <ul className="cb-caption" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
          {reasons.map((r) => (
            <li key={r.code + r.message} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <strong style={{ flex: 'none', color: r.severity === 'error' ? 'var(--cb-danger)' : r.severity === 'info' ? 'var(--cb-text-2)' : 'var(--cb-warn)' }}>{REASON_LABEL_KO[r.code]}</strong>
              <span className="cb-muted">{r.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * 브라우저 측정 없이 사진 통계로만 판정했는지 (이때 personCount=1은 측정값이 아니라 가정).
 * 검출기가 정상 동작해 0명을 찾은 경우('인물 없음')는 측정 결과이므로 여기에 넣지 않는다 → '인물 0명'으로 표시.
 */
export function statsOnly(a: Analyzability): boolean {
  return a.reasons.some((r) => r.code === 'other' && r.message.includes(PC_REFERENCE_ONLY_MESSAGE));
}
