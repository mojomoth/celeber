import Link from 'next/link';
import { AppHeader, Button, Card, PageContainer, SectionHeader } from '@celeber/ui';
import { ReportList } from '../src/components';
import { listReports } from '../src/server';

export const dynamic = 'force-dynamic';

export default function Page() {
  const reports = listReports(5);
  return (
    <>
      <AppHeader title="퍼스널컬러" />
      <PageContainer>
        <div className="cb-stack">
          <div>
            <h1 className="cb-screen-title">퍼스널컬러 리포트</h1>
            <p className="cb-body cb-muted">
              촬영한 얼굴의 피부색을 측정해 타입을 판정하고, 얼굴 옆에 천을 대어 본 비교와 옷·헤어·악세서리 색을 정리합니다. 전신 사진을 더하면 체형 비율에 맞춘 실루엣도 함께 봅니다.
            </p>
          </div>
          <Button href="/new" block icon="camera">
            리포트 만들기
          </Button>
          <Card tone="paper">
            <SectionHeader title="진행 순서" as="h3" />
            <ol className="cb-list" style={{ margin: 0 }}>
              <li>환경 · 정면 · 측면 촬영, 전신은 선택 (저장된 분석을 골라도 됩니다)</li>
              <li>보정한 피부색 · 헤어 · 눈동자 색으로 12톤 판정</li>
              <li>리포트: 첫인상부터 신뢰도까지 14개 항목</li>
            </ol>
          </Card>
          <section className="cb-stack-sm" aria-label="최근 리포트">
            <SectionHeader title="최근 리포트" as="h3" right={reports.length ? <Link className="cb-caption" href="/reports">전체 보기</Link> : undefined} />
            <ReportList reports={reports} />
          </section>
        </div>
      </PageContainer>
    </>
  );
}
