import { AppHeader, Button, EmptyState, PageContainer } from '@celeber/ui';

export default function NotFound() {
  return (
    <>
      <AppHeader title="추구미 분석" backHref="/analyses" />
      <PageContainer>
        <EmptyState title="찾을 수 없습니다" description="삭제되었거나 없는 분석 기록입니다." action={<Button href="/analyses">추구미 기록</Button>} />
      </PageContainer>
    </>
  );
}
