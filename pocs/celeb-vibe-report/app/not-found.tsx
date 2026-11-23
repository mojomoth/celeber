import { AppHeader, Button, EmptyState, PageContainer } from '@celeber/ui';

export default function NotFound() {
  return (
    <>
      <AppHeader title="추구미" backHref="/" />
      <PageContainer>
        <EmptyState title="찾을 수 없습니다" description="삭제되었거나 주소가 잘못되었습니다." action={<Button href="/">처음으로</Button>} />
      </PageContainer>
    </>
  );
}
