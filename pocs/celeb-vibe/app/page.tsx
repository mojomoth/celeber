import Link from 'next/link';
import { AppHeader, Button, PageContainer } from '@celeber/ui';
import { VibeSummaryRow } from '../src/components';
import { listVibeAnalyses } from '../src/server';
import { NewVibe } from './_components/new-vibe';

export const dynamic = 'force-dynamic';

export default function Page() {
  const recent = listVibeAnalyses({ limit: 3 });
  return (
    <>
      <AppHeader
        title="추구미 추출"
        right={
          <Link className="cb-icon-btn" href="/analyses" aria-label="분석 기록" style={{ fontSize: 14, fontWeight: 600, width: 'auto', padding: '0 8px' }}>
            기록
          </Link>
        }
      />
      <PageContainer>
        <h1 className="cb-screen-title">추구미 추출</h1>
        <p className="cb-body cb-muted" style={{ marginBottom: 24 }}>
          사진 한 장에서 코디, 퍼스널컬러, 분위기를 뽑아 기록합니다.
        </p>
        <NewVibe />
        {recent.length ? (
          <section className="cb-section">
            <div className="cb-row" style={{ marginBottom: 4 }}>
              <h2 className="cb-row-title">최근 분석</h2>
              <span className="cb-spacer" />
              <Button href="/analyses" variant="ghost" size="sm">
                전체 보기
              </Button>
            </div>
            {recent.map((r) => (
              <VibeSummaryRow key={r.id} item={r} href={`/analyses/${r.id}`} />
            ))}
          </section>
        ) : null}
      </PageContainer>
    </>
  );
}
