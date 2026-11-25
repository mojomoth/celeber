import type { Metadata } from 'next';
import { Muse } from '../../src/muse/Muse';

export const metadata: Metadata = { title: '추구미 · CELEBER' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === 'string' ? params[key] : undefined;
  const guideId = value('guide');
  const celebId = value('celeb');
  const query = value('q')?.slice(0, 60);
  const reportId = value('report');
  return <Muse key={JSON.stringify([guideId, celebId, query, reportId])} guideId={guideId} celebId={celebId} query={query} reportId={reportId} />;
}
