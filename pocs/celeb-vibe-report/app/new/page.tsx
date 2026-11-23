import type { Metadata } from 'next';
import { AppHeader, PageContainer } from '@celeber/ui';
import { NewGuideClient } from './NewGuideClient';

export const metadata: Metadata = { title: 'CELEBER · 추구미 찾기' };
export const dynamic = 'force-dynamic';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function NewGuidePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <>
      <AppHeader title="추구미 찾기" backHref="/" />
      <PageContainer>
        <NewGuideClient reportId={one(sp.report)} vibeId={one(sp.vibe)} celebId={one(sp.celeb)} query={one(sp.q)} />
      </PageContainer>
    </>
  );
}
