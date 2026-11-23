import { AppHeader, Button, EmptyState, PageContainer } from '@celeber/ui';

export default function NotFound() {
  return (
    <>
      <AppHeader title="전신 비율" backHref="/" />
      <PageContainer>
        <EmptyState title="기록을 찾을 수 없습니다" description="삭제됐거나 주소가 잘못됐습니다." action={<Button href="/sessions" variant="secondary">기록 목록</Button>} />
      </PageContainer>
    </>
  );
}
