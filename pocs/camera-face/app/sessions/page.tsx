import { AppHeader, PageContainer } from '@celeber/ui';
import { FaceSessionList } from '../../src/components';
import { listFaceSessions } from '../../src/server';

export const dynamic = 'force-dynamic';

export default function SessionsPage() {
  const sessions = listFaceSessions({ limit: 100 });
  return (
    <>
      <AppHeader title="얼굴 분석 기록" backHref="/" />
      <PageContainer>
        <div style={{ paddingTop: 16 }}>
          <FaceSessionList sessions={sessions} />
        </div>
      </PageContainer>
    </>
  );
}
