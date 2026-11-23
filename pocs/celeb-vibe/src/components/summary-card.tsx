/**
 * 저장된 추구미 목록 행: 썸네일 · 이름 · 룩 이름 (DESIGN.md 추구미 기록 규칙).
 * 상태 없음 → 서버/클라이언트 양쪽에서 사용 가능.
 */
import type { ReactNode } from 'react';
import { Icon, MockBadge } from '@celeber/ui';
import type { VibeAnalysisSummary } from '../lib/summary';

export function VibeSummaryRow({ item, href, apiBase = '', right }: { item: VibeAnalysisSummary; href?: string; apiBase?: string; right?: ReactNode }) {
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${apiBase}${item.image.url}`} alt="" width={56} height={72} style={{ width: 56, height: 72, objectFit: 'cover', borderRadius: 10, background: 'var(--cb-paper)', flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="cb-row-title" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.celebName ?? '이름 없음'}
        </span>
        <span className="cb-body" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.lookName}
        </span>
        <span className="cb-row" style={{ gap: 4, marginTop: 4 }}>
          {item.palette.map((hex) => (
            <span key={hex} aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: hex, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
          ))}
          <span className="cb-caption cb-muted" style={{ marginLeft: 4 }}>
            {[item.toneNameKo ? `${item.toneNameKo}${item.toneReferenceOnly ? ' (참고용)' : ''}` : null, !item.analyzable ? '분석 제한' : null].filter(Boolean).join(' · ')}
          </span>
        </span>
      </span>
      {item.isMock ? <MockBadge /> : null}
      {right}
      {href ? <Icon name="chevron-right" size={18} /> : null}
    </>
  );
  const style = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', color: 'inherit', textDecoration: 'none', minHeight: 44 } as const;
  return href ? (
    <a href={href} style={style}>
      {body}
    </a>
  ) : (
    <div style={style}>{body}</div>
  );
}
