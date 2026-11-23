import Link from 'next/link';
import { AppHeader, Button, Card, PageContainer, SectionHeader } from '@celeber/ui';
import { FaceSessionList } from '../src/components';
import { listFaceSessions } from '../src/server';

export const dynamic = 'force-dynamic';

const STEPS = [
  { title: '환경', desc: '광원 · 색온도 · 밝기 · 실내/실외를 먼저 확인합니다. 흰 종이를 담으면 보정 기준이 됩니다.' },
  { title: '정면', desc: '이마·볼·턱 피부 영역에서 그림자와 반사광을 빼고 피부색을 재고, 얼굴 윤곽 비율을 계산합니다.' },
  { title: '측면', desc: '이마–코–입–턱 옆선과 E-라인을 확인합니다. 건너뛸 수 있습니다.' },
];

export default function Page() {
  const recent = listFaceSessions({ limit: 3 });
  return (
    <>
      <AppHeader title="얼굴 촬영" right={<Link className="cb-caption" href="/sessions" style={{ color: 'var(--cb-iris-deep)', fontWeight: 650 }}>기록</Link>} />
      <PageContainer>
        <div className="cb-stack" style={{ paddingTop: 16 }}>
          <div>
            <h1 className="cb-screen-title">피부색과 얼굴 윤곽</h1>
            <p className="cb-body cb-muted" style={{ marginTop: 8 }}>
              환경 → 정면 → 측면 순서로 촬영해 조명을 보정한 피부색과 얼굴 비율을 측정합니다.
            </p>
          </div>
          <Card>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }} className="cb-stack-sm">
              {STEPS.map((s, i) => (
                <li key={s.title} className="cb-row" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <span className="cb-num">{i + 1}</span>
                  <span>
                    <span className="cb-row-title" style={{ display: 'block' }}>{s.title}</span>
                    <span className="cb-caption cb-muted">{s.desc}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Button href="/capture" block icon="camera">
            촬영 시작
          </Button>
          <section className="cb-section">
            <SectionHeader title="최근 분석" right={<Link href="/sessions" className="cb-caption" style={{ color: 'var(--cb-iris-deep)' }}>전체 보기</Link>} />
            <FaceSessionList sessions={recent} />
          </section>
        </div>
      </PageContainer>
    </>
  );
}
