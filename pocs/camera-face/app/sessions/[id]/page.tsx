import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { AppHeader, Button, Card, EmptyState, Notice, PageContainer, SectionHeader } from '@celeber/ui';
import { EnvironmentSummary, FaceAnalysisView } from '../../../src/components';
import { getFaceSession } from '../../../src/server';

export const dynamic = 'force-dynamic';

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = getFaceSession(id);
  if (!s) notFound();
  const a = s.analysis;
  // 다음 앱으로 이어 가기: 같은 호스트의 퍼스널컬러 리포트(3105)·추구미 찾기(3106). 세션은 공유 DB에 있다.
  const host = (await headers()).get('host') ?? 'localhost';
  const hostname = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  const appUrl = (port: number, path: string) => `http://${hostname}:${port}${path}`;
  return (
    <>
      <AppHeader title={s.label ?? '얼굴 분석'} backHref="/sessions" />
      <PageContainer>
        <div className="cb-stack" style={{ paddingTop: 16 }}>
          {a ? (
            <>
              {a.isMock ? <Notice tone="info">AI 키가 없거나 사용할 수 없어 서술은 측정값 기반 템플릿입니다. 피부색·윤곽 측정값은 실제 사진에서 계산했습니다.</Notice> : null}
              <FaceAnalysisView
                analysis={a}
                actions={
                  <>
                    <Button href={appUrl(3105, `/new?face=${encodeURIComponent(s.id)}`)} icon="chevron-right" block>
                      이 얼굴로 퍼스널컬러 리포트 만들기
                    </Button>
                    <Button href={appUrl(3106, '/new')} variant="secondary" icon="search" block>
                      연예인 추구미 찾기
                    </Button>
                    <Button href="/capture" icon="camera" variant="secondary" block>
                      다시 촬영
                    </Button>
                    <Button href={`/api/face/sessions/${s.id}`} variant="secondary" block>
                      측정 데이터(JSON) 보기
                    </Button>
                  </>
                }
              />
            </>
          ) : (
            <>
              <EmptyState title="촬영이 끝나지 않은 세션입니다" description="환경 촬영 뒤 정면 촬영을 마치지 않았습니다." action={<Button href="/capture">새로 촬영</Button>} />
              {s.partial?.environment ? (
                <Card>
                  <SectionHeader title="환경 분석" />
                  <EnvironmentSummary environment={s.partial.environment} />
                </Card>
              ) : null}
            </>
          )}
        </div>
      </PageContainer>
    </>
  );
}
