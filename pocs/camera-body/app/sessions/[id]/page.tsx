import { AppHeader, Button, PageContainer } from '@celeber/ui';
import { notFound } from 'next/navigation';
import { BodyResultView } from '../../../src/components';
import { BODY_STATUS_LABEL_KO } from '../../../src/lib/summary';
import { getBodySession } from '../../../src/server';
import { DeleteSessionButton } from '../../_components/actions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getBodySession(id);
  if (!r) notFound();
  const a = r.session.analysis;
  const d = new Date(r.session.createdAt);
  return (
    <>
      <AppHeader title="전신 측정 결과" backHref="/sessions" />
      <PageContainer>
        <div className="cb-stack">
          <div>
            <h1 className="cb-screen-title">{a.status === 'complete' ? '몸의 비율' : BODY_STATUS_LABEL_KO[a.status]}</h1>
            <p className="cb-caption cb-muted" style={{ marginTop: 4 }}>
              {`${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`}
              {r.session.label ? ` · ${r.session.label}` : ''}
              {a.fromUpload === false ? ' · 카메라 촬영' : a.fromUpload ? ' · 업로드' : ''}
            </p>
          </div>
          <BodyResultView analysis={a} outfit={r.outfit} addHref="/capture" />
          <div className="cb-stack-sm" style={{ marginTop: 8 }}>
            <Button href="/capture" variant="secondary" block icon="refresh">
              다시 측정
            </Button>
            <DeleteSessionButton id={id} />
          </div>
        </div>
      </PageContainer>
    </>
  );
}
