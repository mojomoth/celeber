import { AppHeader, PageContainer } from '@celeber/ui';
import { HomeClient } from './home-client';

export default async function Page({ searchParams }: { searchParams: Promise<{ celeb?: string | string[]; q?: string | string[] }> }) {
  const sp = await searchParams;
  const celeb = typeof sp.celeb === 'string' ? sp.celeb : null;
  const q = typeof sp.q === 'string' ? sp.q.slice(0, 60) : null;
  return (
    <>
      <AppHeader title="연예인 검색" />
      <PageContainer>
        <div style={{ padding: 'var(--cb-s4) 0 var(--cb-s6)' }}>
          {celeb ? null : (
            <div style={{ marginBottom: 'var(--cb-s5)' }}>
              <h1 className="cb-screen-title">추구미 인물 찾기</h1>
              <p className="cb-body cb-muted" style={{ margin: 'var(--cb-s2) 0 0' }}>
                이름으로 찾거나 사진을 올려 후보를 확인하세요. 찾은 인물의 대표·최근·평소 전신 사진을 모읍니다.
              </p>
            </div>
          )}
          <HomeClient initialCelebId={celeb} initialQuery={q} />
        </div>
      </PageContainer>
    </>
  );
}
