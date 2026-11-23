/**
 * 저장된 리포트 목록 (썸네일 · 타입 · 날짜 · 데모 배지). 상태 없음.
 */
import type { ReactNode } from 'react';
import type { PersonalColorReportSummary } from '@celeber/core/contracts';
import { getToneProfile } from '@celeber/core/personal-color';
import { EmptyState, Icon, MockBadge } from '@celeber/ui';
import { ReportStyles } from './styles';

export function ReportList({ reports, hrefFor = (id) => `/reports/${id}`, emptyAction }: { reports: PersonalColorReportSummary[]; hrefFor?: (id: string) => string; emptyAction?: ReactNode }) {
  if (!reports.length) return <EmptyState title="저장된 리포트가 없습니다" description="얼굴을 촬영하거나 저장된 얼굴 분석을 골라 리포트를 만드세요." action={emptyAction} />;
  return (
    <div className="pcr-list">
      <ReportStyles />
      {reports.map((r) => {
        const p = getToneProfile(r.tone);
        const d = new Date(r.createdAt);
        return (
          <a key={r.id} className="pcr-list__item" href={hrefFor(r.id)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {r.thumbnail ? <img src={r.thumbnail.url} alt="" /> : <span />}
            <span style={{ display: 'grid', gap: 4 }}>
              <span className="pcr-list__name">
                <span className="pcr-dot" style={{ background: p.accentHex, verticalAlign: -3, marginRight: 6 }} />
                {r.nameKo}
              </span>
              <span className="pcr-list__meta">
                {p.nameEn} · {d.toLocaleDateString('ko-KR')} {d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {r.isMock ? <span><MockBadge /></span> : null}
            </span>
            <Icon name="chevron-right" size={18} />
          </a>
        );
      })}
    </div>
  );
}
