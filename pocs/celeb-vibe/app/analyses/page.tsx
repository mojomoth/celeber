import { AppHeader, Button, EmptyState, PageContainer } from '@celeber/ui';
import { VibeSummaryRow } from '../../src/components';
import { listVibeAnalyses } from '../../src/server';
import { ResetButton } from '../_components/reset-button';

export const dynamic = 'force-dynamic';

export default function AnalysesPage() {
  const items = listVibeAnalyses({ limit: 200 });
  return (
    <>
      <AppHeader title="추구미 기록" backHref="/" />
      <PageContainer>
        <div className="cb-row" style={{ alignItems: 'flex-end' }}>
          <h1 className="cb-screen-title">추구미 기록</h1>
          <span className="cb-spacer" />
          <span className="cb-caption cb-muted" style={{ marginBottom: 12 }}>
            {items.length}건
          </span>
        </div>
        {items.length === 0 ? (
          <EmptyState
            title="아직 분석한 사진이 없습니다"
            description="연예인 사진을 올리면 코디·퍼스널컬러·분위기를 기록합니다."
            action={<Button href="/">사진 분석하기</Button>}
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((it) => (
              <li key={it.id} style={{ borderBottom: '1px solid var(--cb-line)' }}>
                <VibeSummaryRow item={it} href={`/analyses/${it.id}`} />
              </li>
            ))}
          </ul>
        )}
        <div className="cb-section cb-row">
          <Button href="/" icon="camera">
            새 사진 분석
          </Button>
          <span className="cb-spacer" />
          <ResetButton count={items.length} />
        </div>
      </PageContainer>
    </>
  );
}
