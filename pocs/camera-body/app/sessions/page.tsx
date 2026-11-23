import { AppHeader, Button, EmptyState, PageContainer } from '@celeber/ui';
import { listBodySessions } from '../../src/server';
import { DeleteAllButton } from '../_components/actions';
import { SessionList } from '../_components/SessionList';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function SessionsPage() {
  const items = listBodySessions(200);
  return (
    <>
      <AppHeader title="전신 측정 기록" backHref="/" right={<DeleteAllButton count={items.length} />} />
      <PageContainer>
        <div className="cb-stack">
          <h1 className="cb-screen-title">기록</h1>
          {items.length ? (
            <SessionList items={items} />
          ) : (
            <EmptyState title="기록이 없습니다" action={<Button href="/capture" variant="primary">측정 시작</Button>} />
          )}
        </div>
      </PageContainer>
    </>
  );
}
