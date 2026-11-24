import { headers } from 'next/headers';
import { dbHealth } from '@celeber/core/server/db';
import { getCapabilities, mockReasons } from '@celeber/core/server/env';
import { BI, Button, Chips, Icon, MockBadge, Notice, PageContainer, SectionHeader } from '@celeber/ui';
import { HUB_PORT, POCS, UI_MOCKUP, dependentsOf, pocByKey, pocUrl } from '../src/pocs';
import { probeAll, type PocStatus } from '../src/status';
import { FlowDiagram } from './_components/FlowDiagram';
import { TokenPreview } from './_components/TokenPreview';

export const dynamic = 'force-dynamic';

const TABLE_LABEL: Record<string, string> = {
  face_sessions: '얼굴 세션',
  body_sessions: '전신 세션',
  celebs: '인물',
  celeb_images: '인물 사진',
  vibe_analyses: '추구미 분석',
  personal_color_reports: '퍼스널컬러 리포트',
  vibe_guides: '추구미 가이드',
  uploads: '업로드',
};

export default async function HubPage() {
  const host = (await headers()).get('host');
  const [statuses, db] = await Promise.all([probeAll(), Promise.resolve(dbHealth())]);
  const caps = getCapabilities();
  const reasons = mockReasons(caps, ['ai', 'imageSearch', 'reverseImageSearch']);
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const runningCount = statuses.filter((s) => s.running).length;

  return (
    <>
      {/* 01 랜딩: logo-on-dark + color-halo-background + 시작하기 */}
      <section className="hub-landing" aria-label="CELEBER">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="hub-landing__bg" src={BI.haloBackground} alt="" aria-hidden />
        <div className="hub-landing__scrim" aria-hidden />
        <svg className="hub-landing__drape" viewBox="0 0 390 520" preserveAspectRatio="xMidYMax slice" aria-hidden>
          <defs>
            <linearGradient id="d1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#91A6BE" stopOpacity="0.85" />
              <stop offset="1" stopColor="#39455E" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="d2" x1="0" y1="0" x2="1" y2="0.6">
              <stop offset="0" stopColor="#A7A0B9" stopOpacity="0.9" />
              <stop offset="1" stopColor="#9B748A" stopOpacity="0.85" />
            </linearGradient>
            <linearGradient id="d3" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FB603C" stopOpacity="0.75" />
              <stop offset="1" stopColor="#A13942" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <path d="M-40 300 C 60 220, 160 330, 260 260 S 420 200, 440 230 L 440 520 L -40 520 Z" fill="url(#d2)" />
          <path d="M-40 380 C 40 330, 140 420, 230 360 S 360 330, 440 360 L 440 520 L -40 520 Z" fill="url(#d1)" />
          <path d="M150 520 C 200 420, 300 430, 440 330 L 440 520 Z" fill="url(#d3)" />
        </svg>
        <div className="hub-landing__inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hub-landing__logo" src={BI.logoOnDark} alt="CELEBER" width={184} />
          <p className="hub-landing__tagline">사진으로 확인하는 내 퍼스널컬러와 연예인 추구미</p>
          <div className="hub-landing__spacer" />
          <a className="hub-start" href="#pocs">
            <span>시작하기</span>
            <Icon name="chevron-right" size={20} />
          </a>
          <p className="hub-landing__note">기능 프로토타입 6종 · 포트 {HUB_PORT}</p>
        </div>
      </section>

      <PageContainer className="hub-page">
        <div id="pocs" className="hub-anchor" />
        <h1 className="cb-screen-title">PoC 허브</h1>
        <p className="cb-body cb-muted">
          촬영 → 진단 → 추구미 가이드 순서로 이어지는 6개 앱입니다. 모든 앱이 같은 SQLite DB를 쓰므로 한 앱에서 저장한 세션을 다음 앱에서 바로 고를 수 있습니다.
        </p>

        {/* 모드 상태 */}
        <section className="cb-section" aria-labelledby="mode-title">
          <SectionHeader title={<span id="mode-title">실행 모드</span>} right={reasons.length ? <MockBadge /> : null} />
          <div className="hub-modes">
            <ModeRow
              icon="bulb"
              label="AI 분석 (Claude)"
              real={caps.ai}
              value={caps.ai ? `실제 · ${caps.model}` : caps.aiBlockedReason ? `데모 · 일시 중단 (${caps.aiBlockedReason})` : caps.forceMock ? '데모 · CELEBER_FORCE_MOCK=1' : '데모 · 키 없음 (규칙·템플릿)'}
            />
            <ModeRow icon="image" label="이미지 검색" real={caps.imageSearch !== 'mock'} value={caps.imageSearch === 'naver' ? '실제 · 네이버' : caps.imageSearch === 'serpapi' ? '실제 · SerpAPI' : '데모 · 데모 실루엣 이미지'} />
            <ModeRow
              icon="search"
              label="역이미지 검색"
              real={caps.reverseImageSearch}
              value={caps.reverseImageSearch ? (caps.reverseImageSearchUploads ? '실제 · Google Lens' : '실제 · 공개 URL만 (CELEBER_PUBLIC_BASE_URL 없음)') : '데모 · 이름 검색 안내'}
            />
            <ModeRow icon="clipboard" label="공유 DB" real={db.ok} value={db.ok ? `정상 · SQLite ${db.sqliteVersion}` : `오류 · ${db.error ?? ''}`} />
          </div>
          <p className="cb-caption cb-muted hub-mono">{db.path}</p>
          {db.ok ? (
            <div className="hub-counts">
              {Object.entries(TABLE_LABEL).map(([t, label]) => (
                <div key={t} className="hub-count">
                  <span className="hub-count__n">{db.tables[t] ?? 0}</span>
                  <span className="cb-caption">{label}</span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="cb-caption cb-muted">
            AI 상태는 앱 프로세스마다 다릅니다. 사용 한도 초과 같은 오류를 한 번 받으면 그 앱은 10분 동안 데모 데이터로 동작합니다. 앱별 상태는 아래 카드에 표시합니다.
          </p>
        </section>

        {/* 선행관계 */}
        <section className="cb-section" aria-labelledby="flow-title">
          <SectionHeader title={<span id="flow-title">선행관계</span>} subtitle={`실행 중 ${runningCount} / ${POCS.length}`} />
          <FlowDiagram statuses={statuses} host={host} />
          <p className="cb-caption cb-muted">화살표는 앞 앱의 촬영 플로우·API를 뒤 앱이 그대로 가져다 쓴다는 뜻입니다. 전신(2)은 선택 입력입니다.</p>
          {runningCount < POCS.length ? (
            <Notice tone="info" title="꺼진 앱이 있습니다">
              루트에서 <code className="hub-code">pnpm dev:all</code>로 허브와 6개 앱을 함께 띄우거나, <code className="hub-code">pnpm dev:&lt;앱 폴더&gt;</code>로 하나씩 띄웁니다.
            </Notice>
          ) : null}
        </section>

        {/* PoC 카드 */}
        <section className="cb-section" aria-labelledby="list-title">
          <SectionHeader title={<span id="list-title">PoC 6종</span>} />
          <div className="cb-stack">
            {POCS.map((p) => (
              <PocCard key={p.key} pocKey={p.key} status={byKey.get(p.key)} host={host} />
            ))}
          </div>
        </section>

        {/* UI 목업 */}
        <section className="cb-section" aria-labelledby="mockup-title">
          <SectionHeader title={<span id="mockup-title">{UI_MOCKUP.title}</span>} subtitle={`:${UI_MOCKUP.port} · pocs/${UI_MOCKUP.dir}`} />
          <p className="cb-body">{UI_MOCKUP.summary}</p>
          <div className="hub-links">
            <Button href={pocUrl(UI_MOCKUP, host, '/')} variant="primary" size="sm">
              목업 열기
            </Button>
          </div>
          <p className="cb-caption cb-muted hub-mono">pnpm dev:ui-mockup</p>
        </section>

        {/* 디자인 토큰 */}
        <section className="cb-section" aria-labelledby="tokens-title">
          <SectionHeader title={<span id="tokens-title">디자인 토큰</span>} subtitle="docs/ui/design/DESIGN.md · @celeber/ui" />
          <TokenPreview />
        </section>

        <p className="cb-caption cb-muted hub-foot">
          인물 식별 정책: 얼굴 특징으로 신원을 판단하지 않습니다. 이름 검색이 기본이고, 사진은 역이미지 검색 결과 제목과 사진 속 글자로 후보만 제시한 뒤 사용자가 확정합니다.
        </p>
      </PageContainer>
    </>
  );
}

function ModeRow({ icon, label, value, real }: { icon: 'bulb' | 'image' | 'search' | 'clipboard'; label: string; value: string; real: boolean }) {
  return (
    <div className="hub-mode">
      <span className="hub-mode__icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="hub-mode__label">{label}</span>
      <span className={real ? 'hub-pill hub-pill--ok' : 'hub-pill hub-pill--demo'}>{value}</span>
    </div>
  );
}

function PocCard({ pocKey, status, host }: { pocKey: (typeof POCS)[number]['key']; status?: PocStatus; host: string | null }) {
  const p = pocByKey(pocKey);
  const deps = dependentsOf(p.key);
  const running = !!status?.running;
  const appCaps = status?.capabilities;
  const appReasons = appCaps ? mockReasons(appCaps, p.uses) : [];
  return (
    <article className="hub-card">
      <div className="hub-card__head">
        <span className="cb-num">{p.no}</span>
        <div className="hub-card__title">
          <h3 className="cb-row-title">{p.title}</h3>
          <span className="cb-caption cb-muted hub-card__path">{`:${p.port} · pocs/${p.key}`}</span>
        </div>
        <span className={running ? 'hub-pill hub-pill--ok' : 'hub-pill hub-pill--off'}>{running ? `실행 중${status?.ms != null ? ` · ${status.ms}ms` : ''}` : '중지'}</span>
      </div>
      <p className="cb-body">{p.summary}</p>
      <dl className="hub-meta">
        <dt>선행</dt>
        <dd>{p.requires.length ? p.requires.map((k) => `${pocByKey(k).no} ${pocByKey(k).title}`).join(' · ') : '없음'}</dd>
        <dt>후행</dt>
        <dd>{deps.length ? deps.map((d) => `${d.no} ${d.title}`).join(' · ') : '없음'}</dd>
        <dt>API</dt>
        <dd className="hub-mono">{`/api/${p.apiNamespace}/*`}</dd>
        <dt>모드</dt>
        <dd>{!running ? '앱이 꺼져 있어 확인할 수 없음' : appReasons.length ? `데모 데이터 (${appReasons.length}개 기능)` : '실제 API'}</dd>
      </dl>
      {appReasons.length ? <Chips items={appReasons.map((r) => r.split(':')[0])} /> : null}
      <div className="hub-links">
        {p.pages.map((pg, i) =>
          running ? (
            <Button key={pg.path} href={pocUrl(p, host, pg.path)} variant={i === 0 ? 'primary' : 'secondary'} size="sm">
              {pg.label}
            </Button>
          ) : (
            <span key={pg.path} className="hub-link-off">
              {pg.label}
            </span>
          ),
        )}
      </div>
      {!running ? <p className="cb-caption cb-muted hub-mono">pnpm dev:{p.key}</p> : null}
    </article>
  );
}
