import type { Metadata } from 'next';
import { PersonalColorResults } from '../../src/self/Results';

export const metadata: Metadata = { title: '퍼스널컬러 · CELEBER' };

export default async function Page({ searchParams }: { searchParams: Promise<{ report?: string | string[] }> }) {
  const { report } = await searchParams;
  return <PersonalColorResults reportId={typeof report === 'string' ? report : undefined} />;
}
