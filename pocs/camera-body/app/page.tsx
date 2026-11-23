import Link from 'next/link';
import { AppHeader, Button, Card, EmptyState, PageContainer, SectionHeader } from '@celeber/ui';
import { listBodySessions } from '../src/server';
import { DemoButton } from './_components/actions';
import { SessionList } from './_components/SessionList';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function Page() {
  const items = listBodySessions(5);
  return (
    <>
      <AppHeader title="전신 비율" />
      <PageContainer>
        <div className="cb-stack">
          <div>
            <h1 className="cb-screen-title">전신 비율</h1>
            <p className="cb-body cb-muted" style={{ marginTop: 8 }}>
              정면 전신 사진 한 장으로 등신, 상·하체, 어깨·골반 비율과 체형을 측정하고 코디 방향을 제안합니다.
            </p>
          </div>
          <div className="cb-stack-sm">
            <Button href="/capture" variant="primary" block icon="body">
              측정 시작
            </Button>
            <DemoButton />
          </div>
          <Card tone="paper">
            <ol className="cb-list cb-body" style={{ margin: 0 }}>
              <li>전신 사진 업로드 또는 촬영 (건너뛰기 가능)</li>
              <li>기기에서 관절점·실루엣 검출</li>
              <li>비율 그래픽과 수치별 한 줄 해석</li>
              <li>기록 저장과 다시보기</li>
            </ol>
          </Card>
          <section className="cb-section">
            <SectionHeader title="최근 기록" right={items.length ? <Link className="cb-caption" href="/sessions" style={{ color: 'var(--cb-iris-deep)', fontWeight: 700, padding: 12 }}>전체 보기</Link> : undefined} />
            {items.length ? <SessionList items={items} /> : <EmptyState title="아직 기록이 없습니다" description="측정을 시작하거나 데모 데이터로 결과 화면을 확인해 보세요." />}
          </section>
        </div>
      </PageContainer>
    </>
  );
}
