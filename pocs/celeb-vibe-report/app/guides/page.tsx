import Link from 'next/link';
import type { Metadata } from 'next';
import { AppHeader, Button, PageContainer, SectionHeader } from '@celeber/ui';
import { GuideGrid, MyReportCard } from '../../src/components';
import { listGuides, listMyReports } from '../../src/server';
import { ResetGuides } from '../_components/ResetGuides';
import { ResetMyData } from '../_components/ResetMyData';

export const metadata: Metadata = { title: 'CELEBER · 내 기록' };
export const dynamic = 'force-dynamic';

export default function GuidesPage() {
  const all = listGuides({ limit: 200 });
  const saved = all.filter((g) => g.saved);
  const unsaved = all.filter((g) => !g.saved);
  const reports = listMyReports(3);
  return (
    <>
      <AppHeader title="내 기록" backHref="/" />
      <PageContainer>
        <div className="cb-stack">
          <section aria-label="찾은 추구미">
            <SectionHeader title={`찾은 추구미 ${saved.length}`} subtitle="저장한 순서가 아니라 최근 수정한 순서입니다." right={<Link className="cb-caption" href="/new">새로 찾기</Link>} />
            <GuideGrid items={saved} emptyAction={<Button href="/new" icon="search">추구미 찾기</Button>} />
          </section>
          {unsaved.length ? (
            <section aria-label="저장하지 않은 가이드">
              <SectionHeader title="저장하지 않은 가이드" as="h2" />
              <GuideGrid items={unsaved} />
            </section>
          ) : null}
          <section aria-label="내 퍼스널컬러">
            <SectionHeader title="내 퍼스널컬러" as="h2" />
            {reports.length ? (
              <div className="cb-stack-sm">
                {reports.map((r) => (
                  <MyReportCard key={r.id} report={r} href={`/report/${encodeURIComponent(r.id)}`} />
                ))}
              </div>
            ) : (
              <Button href="/report/new" variant="secondary" block icon="camera">
                퍼스널컬러 리포트 만들기
              </Button>
            )}
          </section>
          <section aria-label="초기화">
            <ResetGuides count={all.length} />
            <ResetMyData />
          </section>
        </div>
      </PageContainer>
    </>
  );
}
