import { notFound } from 'next/navigation';
import { getCapabilities } from '@celeber/core/server/env';
import { AppHeader, PageContainer } from '@celeber/ui';
import { getVibeAnalysis } from '../../../src/server';
import { DetailClient } from '../../_components/detail-client';

export const dynamic = 'force-dynamic';

export default async function DetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ warning?: string }> }) {
  const { id } = await params;
  const { warning } = await searchParams;
  const a = getVibeAnalysis(id);
  if (!a) notFound();
  return (
    <>
      <AppHeader title="추구미 분석" backHref="/analyses" />
      <PageContainer>
        <div style={{ height: 16 }} />
        <DetailClient initial={a} warning={warning} aiAvailable={getCapabilities().ai} />
      </PageContainer>
    </>
  );
}
