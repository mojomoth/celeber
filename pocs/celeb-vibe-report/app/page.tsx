import Link from 'next/link';
import { AppHeader, Button, PageContainer, SectionHeader } from '@celeber/ui';
import { GuideGrid, MyReportCard } from '../src/components';
import { listGuides, listMyReports } from '../src/server';
import s from '../src/components/guide.module.css';

export const dynamic = 'force-dynamic';

export default function Page() {
  const reports = listMyReports(5);
  const saved = listGuides({ saved: true, limit: 6 });
  const recent = listGuides({ saved: false, limit: 4 });
  const latest = reports[0];
  return (
    <>
      <AppHeader title="추구미" right={<Link href="/guides" className="cb-caption" style={{ fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>내 기록</Link>} />
      <PageContainer>
        <div className="cb-stack">
          <div>
            <h1 className="cb-screen-title">추구미 가이드</h1>
            <p className="cb-body cb-muted">좋아하는 연예인의 룩을 내 퍼스널컬러 팔레트로 옮기고, 나와의 차이와 바꿀 순서를 보여줍니다.</p>
          </div>
          <Button href={latest ? `/new?report=${encodeURIComponent(latest.id)}` : '/new'} block icon="search">
            추구미 찾기
          </Button>

          <section aria-label="내 퍼스널컬러">
            <SectionHeader title="내 퍼스널컬러" as="h2" />
            {latest ? (
              <div className="cb-stack-sm">
                <MyReportCard report={latest} href={`/report/${encodeURIComponent(latest.id)}`} />
                {reports.length > 1 ? <p className="cb-caption cb-muted" style={{ margin: 0 }}>리포트 {reports.length}개 중 가장 최근 리포트입니다. 가이드를 만들 때 다른 리포트를 고를 수 있습니다.</p> : null}
              </div>
            ) : (
              <div className="cb-stack-sm">
                <p className="cb-body cb-muted" style={{ margin: 0 }}>아직 리포트가 없습니다. 얼굴을 촬영해 퍼스널컬러 리포트를 먼저 만드세요.</p>
                <Button href="/report/new" variant="secondary" block icon="camera">
                  퍼스널컬러 리포트 만들기
                </Button>
              </div>
            )}
          </section>

          <section aria-label="저장한 추구미">
            <SectionHeader title={`저장한 추구미 ${saved.length ? saved.length : ''}`.trim()} as="h2" right={saved.length ? <Link className="cb-caption" href="/guides">전체 보기</Link> : undefined} />
            <GuideGrid items={saved} />
          </section>

          {recent.length ? (
            <section aria-label="최근 만든 가이드">
              <SectionHeader title="저장하지 않은 가이드" subtitle="가이드 화면에서 저장하면 위 목록에 올라갑니다." as="h2" />
              <GuideGrid items={recent} />
            </section>
          ) : null}

          <section aria-label="기타">
            <Link className={s.linkRow} href="/guides">
              <span>
                <span className={s.linkRowTitle} style={{ display: 'block' }}>내 기록</span>
                <span className={s.linkRowSub}>찾은 추구미 전체 · 가이드 초기화</span>
              </span>
              <span aria-hidden>›</span>
            </Link>
          </section>
        </div>
      </PageContainer>
    </>
  );
}
