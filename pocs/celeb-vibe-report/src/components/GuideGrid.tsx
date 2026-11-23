/**
 * 저장한 추구미 목록 (레퍼런스 06 '내 기록'): 썸네일 → 이름 → 룩 이름 순.
 * 상태 없음 (서버/클라이언트 공용).
 */
import type { ReactNode } from 'react';
import { EmptyState, Icon, MockBadge } from '@celeber/ui';
import type { GuideSummary, MyReportBrief } from '../lib/types';
import { formatDate } from '../lib/summary';
import { Dot } from './GuideParts';
import s from './guide.module.css';

export function GuideGrid({ items, hrefFor = (id) => `/guides/${id}`, apiBase = '', emptyAction }: { items: GuideSummary[]; hrefFor?: (id: string) => string; apiBase?: string; emptyAction?: ReactNode }) {
  if (!items.length) return <EmptyState title="아직 저장한 추구미가 없습니다" description="연예인을 찾아 룩을 고르면 내 퍼스널컬러 기준 가이드를 만들어 드립니다." action={emptyAction} />;
  return (
    <div className={s.grid}>
      {items.map((g) => (
        <a key={g.id} className={s.card} href={hrefFor(g.id)}>
          <div className={s.cardImg}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {g.thumbnail ? <img src={`${apiBase}${g.thumbnail.url}`} alt="" /> : null}
            <span className={s.cardShade} />
            {g.isMock ? (
              <span className={s.cardBadge}>
                <MockBadge />
              </span>
            ) : null}
            <span className={s.cardName}>{g.celebName}</span>
          </div>
          <span className={s.cardLink}>
            가이드 보기 <Icon name="chevron-right" size={16} />
          </span>
          <span className={s.cardLook} style={{ display: 'block' }}>
            {g.lookName}
          </span>
          <span className={s.cardDots}>
            {g.myColors.map((h) => (
              <Dot key={h} hex={h} size="sm" />
            ))}
          </span>
        </a>
      ))}
    </div>
  );
}

/** 내 퍼스널컬러 카드 (선택 버튼 또는 링크) */
export function MyReportCard({ report, href, selected, onSelect, apiBase = '' }: { report: MyReportBrief; href?: string; selected?: boolean; onSelect?: () => void; apiBase?: string }) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {report.thumbnail ? <img className={s.meImg} src={`${apiBase}${report.thumbnail.url}`} alt="" /> : <span className={s.meImg} />}
      <span style={{ minWidth: 0 }}>
        <span className={s.meName} style={{ display: 'block' }}>
          {report.nameKo}
        </span>
        <span className={s.meSub}>
          {report.best.slice(0, 4).map((c) => (
            <Dot key={c.hex} hex={c.hex} size="sm" title={c.name} />
          ))}
          <span style={{ marginLeft: 4 }}>{formatDate(report.createdAt)} 진단</span>
          {report.hasBody ? <span>· 전신 포함</span> : null}
        </span>
        {report.isMock ? (
          <span style={{ display: 'inline-block', marginTop: 6 }}>
            <MockBadge />
          </span>
        ) : null}
      </span>
      <Icon name={selected ? 'check-circle' : 'chevron-right'} size={20} />
    </>
  );
  if (onSelect)
    return (
      <button type="button" className={s.me} aria-pressed={!!selected} onClick={onSelect}>
        {inner}
      </button>
    );
  return (
    <a className={s.me} href={href}>
      {inner}
    </a>
  );
}
