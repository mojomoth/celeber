import { AppHeader, Button, EmptyState, PageContainer } from '@celeber/ui';

export default function NotFound() {
  return (
    <>
      <AppHeader title="퍼스널컬러" backHref="/" />
      <PageContainer>
        <EmptyState title="찾을 수 없습니다" description="삭제되었거나 없는 리포트입니다." action={<Button href="/reports">내 리포트</Button>} />
      </PageContainer>
    </>
  );
}
