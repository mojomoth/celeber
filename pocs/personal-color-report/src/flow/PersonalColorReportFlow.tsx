'use client';
/**
 * 퍼스널컬러 리포트 입력 플로우.
 *   (a) 새로 촬영: camera-face FaceCaptureFlow(환경→정면→측면) → camera-body BodyCaptureFlow(전신, 건너뛰기 가능)
 *   (b) 저장된 세션 선택: face_sessions(완료) + body_sessions(측정 완료, 선택)
 *   → 리포트 스타일(성별 변형, 사진 기반 기본값) 확인 → POST /api/report/generate → onComplete(report)
 * 다른 앱: import { PersonalColorReportFlow } from '@celeber/personal-color-report/flow'
 *   호스트는 /api/report/*, /api/face/*, /api/body/*, /api/uploads 를 재노출해야 한다.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Gender, PersonalColorReport } from '@celeber/core/contracts';
import { AnalyzingOverlay, AppHeader, Button, Card, EmptyState, Icon, MockBadge, Notice, PageContainer, PhotoFrame, SectionHeader, Tabs } from '@celeber/ui';
import { FaceCaptureFlow } from '@celeber/camera-face/flow';
import { BodyCaptureFlow } from '@celeber/camera-body/flow';
import { bodyOneLiner } from '@celeber/camera-body/lib';
import { GENDER_LABEL_KO, type GenerateResponse, type InputBody, type InputFace, type InputsResponse } from '../lib/api';
import { ReportStyles } from '../components/styles';

export interface ReportFlowResult {
  report: PersonalColorReport;
  aiSource: GenerateResponse['aiSource'];
  warning?: string;
}

export interface PersonalColorReportFlowProps {
  /** API 경로 접두사 (기본 '') */
  apiBase?: string;
  onComplete: (r: ReportFlowResult) => void;
  onCancel?: () => void;
  /** 미리 고른 얼굴 세션 (예: 리포트에서 '전신 사진 추가') */
  initialFaceSessionId?: string;
  /** 시작 단계: choose(기본) | capture(바로 촬영) | body(얼굴 고정, 전신부터) */
  initialStep?: 'choose' | 'capture' | 'body';
  /** 헤더 표시 (기본 true) */
  showHeader?: boolean;
}

type Phase = 'choose' | 'face-capture' | 'body-capture' | 'confirm' | 'generating';
interface Picked {
  face: { id: string; thumbnailUrl: string | null; presentation: Gender; label?: string; isMock: boolean } | null;
  body: { id: string; thumbnailUrl?: string; summary: string } | null;
}

const STEPS = ['환경', '정면', '측면', '전신(선택)'];

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j.error?.message ?? `요청 실패 (${res.status})`;
  } catch {
    return `요청 실패 (${res.status})`;
  }
}

export async function generateReport(apiBase: string, body: { faceSessionId: string; bodySessionId?: string | null; gender?: Gender; skipAi?: boolean }): Promise<GenerateResponse> {
  const res = await fetch(`${apiBase}/api/report/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as GenerateResponse;
}

export async function fetchReportInputs(apiBase: string): Promise<InputsResponse> {
  const res = await fetch(`${apiBase}/api/report/inputs`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as InputsResponse;
}

function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('ko-KR')} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
}

function FaceChoice({ f, selected, onSelect }: { f: InputFace; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className="pcr-choice" aria-pressed={selected} onClick={onSelect}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {f.thumbnailUrl ? <img src={f.thumbnailUrl} alt="" /> : <span className="pcr-choice__ph"><Icon name="user" /></span>}
      <span style={{ display: 'grid', gap: 3 }}>
        <span className="cb-row-title" style={{ fontSize: 14 }}>{fmt(f.createdAt)}</span>
        <span className="cb-caption cb-muted">
          {f.skinHex ? <span className="pcr-dot" style={{ background: f.skinHex, width: 12, height: 12, verticalAlign: -2, marginRight: 4 }} /> : null}
          {f.skinName ?? '피부색'} · {f.lightSourceLabel ?? '광원 미상'}
          {f.hasSide ? ' · 측면 포함' : ''}
        </span>
        {f.isMock ? <span><MockBadge label="데모 서술" /></span> : null}
      </span>
      <span className="pcr-choice__check" aria-hidden><Icon name="check" size={14} /></span>
    </button>
  );
}

function BodyChoice({ b, selected, onSelect }: { b: InputBody | null; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className="pcr-choice" aria-pressed={selected} onClick={onSelect}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {b?.thumbnailUrl ? <img src={b.thumbnailUrl} alt="" /> : <span className="pcr-choice__ph"><Icon name={b ? 'body' : 'skip'} /></span>}
      <span style={{ display: 'grid', gap: 3 }}>
        <span className="cb-row-title" style={{ fontSize: 14 }}>{b ? fmt(b.createdAt) : '전신 없이 만들기'}</span>
        <span className="cb-caption cb-muted">{b ? b.summary : '리포트에 "전신 사진 추가" 카드가 표시됩니다.'}</span>
      </span>
      <span className="pcr-choice__check" aria-hidden><Icon name="check" size={14} /></span>
    </button>
  );
}

export function PersonalColorReportFlow({ apiBase = '', onComplete, onCancel, initialFaceSessionId, initialStep = 'choose', showHeader = true }: PersonalColorReportFlowProps) {
  const [phase, setPhase] = useState<Phase>(initialStep === 'capture' ? 'face-capture' : initialStep === 'body' && initialFaceSessionId ? 'body-capture' : 'choose');
  const [inputs, setInputs] = useState<InputsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked>({ face: null, body: null });
  const [gender, setGender] = useState<Gender>('unspecified');
  const [genderTouched, setGenderTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickFace = useCallback((f: Picked['face']) => {
    setPicked((p) => ({ ...p, face: f }));
    if (f) setGender(f.presentation);
    setGenderTouched(false);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchReportInputs(apiBase)
      .then((r) => {
        if (!alive) return;
        setInputs(r);
        const pre = initialFaceSessionId ? r.face.find((f) => f.id === initialFaceSessionId) : undefined;
        if (pre) pickFace({ id: pre.id, thumbnailUrl: pre.thumbnailUrl, presentation: pre.presentation, label: pre.label, isMock: pre.isMock });
        else if (initialFaceSessionId && initialStep === 'body') pickFace({ id: initialFaceSessionId, thumbnailUrl: null, presentation: 'unspecified', isMock: false });
      })
      .catch((e: unknown) => {
        if (alive) setLoadError(e instanceof Error ? e.message : '저장된 세션을 불러오지 못했습니다.');
      });
    return () => {
      alive = false;
    };
  }, [apiBase, initialFaceSessionId, initialStep, pickFace]);

  const generate = useCallback(async () => {
    if (!picked.face) return;
    setPhase('generating');
    setError(null);
    try {
      const r = await generateReport(apiBase, { faceSessionId: picked.face.id, bodySessionId: picked.body?.id ?? null, gender: genderTouched ? gender : undefined });
      onComplete({ report: r.report, aiSource: r.aiSource, warning: r.warning });
    } catch (e) {
      setError(e instanceof Error ? e.message : '리포트를 만들지 못했습니다.');
      setPhase('confirm');
    }
  }, [apiBase, picked, gender, genderTouched, onComplete]);

  if (phase === 'face-capture') {
    return (
      <FaceCaptureFlow
        apiBase={apiBase}
        steps={STEPS}
        onCancel={() => setPhase('choose')}
        onComplete={({ sessionId, analysis }) => {
          pickFace({ id: sessionId, thumbnailUrl: analysis.front.image.url, presentation: analysis.ai?.presentation ?? 'unspecified', isMock: analysis.isMock });
          setPhase('body-capture');
        }}
      />
    );
  }

  if (phase === 'body-capture') {
    return (
      <BodyCaptureFlow
        apiBase={apiBase}
        steps={STEPS}
        currentStep={3}
        allowSkip
        onClose={() => setPhase(picked.face ? 'confirm' : 'choose')}
        onSkip={() => {
          setPicked((p) => ({ ...p, body: null }));
          setPhase('confirm');
        }}
        onComplete={(r) => {
          const ok = r.session && r.analysis.status === 'complete';
          setPicked((p) => ({ ...p, body: ok && r.session ? { id: r.session.id, thumbnailUrl: r.analysis.image?.url, summary: bodyOneLiner(r.analysis) } : null }));
          setPhase('confirm');
        }}
      />
    );
  }

  const header = showHeader ? <AppHeader title="퍼스널컬러 리포트 만들기" right={onCancel ? <button type="button" className="cb-icon-btn" onClick={onCancel} aria-label="닫기"><Icon name="close" size={22} /></button> : undefined} /> : null;

  if (phase === 'confirm' || phase === 'generating') {
    const f = picked.face;
    return (
      <>
        <ReportStyles />
        {header}
        <PageContainer>
          <div className="cb-stack">
            <div>
              <h1 className="cb-screen-title" style={{ fontSize: 26, lineHeight: '33px' }}>진단 준비</h1>
              <p className="cb-body cb-muted">이 사진으로 피부색 측정값을 분류하고 리포트를 만듭니다.</p>
            </div>
            <div style={{ position: 'relative', width: '100%', maxWidth: 240, margin: '0 auto' }}>
              <PhotoFrame src={f?.thumbnailUrl ?? undefined} alt="진단에 사용할 정면 사진" label="업로드한 사진" aspect="4 / 5" />
              {phase === 'generating' ? <AnalyzingOverlay message="퍼스널컬러 분석 중" sub="측정값 분류 · 서술 생성 · 드레이핑 준비" /> : null}
            </div>
            <Card tone="paper">
              <SectionHeader title="전신 (선택)" as="h3" right={<Button size="sm" variant="secondary" icon="body" onClick={() => setPhase('body-capture')} disabled={phase === 'generating'}>{picked.body ? '다시 선택' : '추가'}</Button>} />
              <p className="cb-body" style={{ margin: 0 }}>{picked.body ? picked.body.summary : '전신 없이 만듭니다. 리포트에 "전신 사진 추가" 카드가 표시됩니다.'}</p>
            </Card>
            <div className="cb-stack-sm">
              <SectionHeader title="리포트 스타일" as="h3" subtitle="상의·아우터·악세서리·그루밍 항목명과 예시가 바뀝니다. 퍼스널컬러 판정은 같습니다." />
              <Tabs
                label="리포트 스타일"
                value={gender}
                onChange={(g) => {
                  setGender(g);
                  setGenderTouched(true);
                }}
                items={(['male', 'female', 'unspecified'] as const).map((g) => ({ value: g, label: GENDER_LABEL_KO[g] }))}
              />
              <span className="cb-caption cb-muted">{genderTouched ? '직접 선택했습니다.' : `사진 기반 기본값: ${GENDER_LABEL_KO[f?.presentation ?? 'unspecified']}`}</span>
            </div>
            {error ? <Notice tone="danger" title="리포트를 만들지 못했습니다">{error}</Notice> : null}
            <Button block onClick={generate} loading={phase === 'generating'} disabled={!f}>
              리포트 만들기
            </Button>
            <Button block variant="ghost" onClick={() => setPhase('choose')} disabled={phase === 'generating'}>
              다른 얼굴 사진 고르기
            </Button>
          </div>
        </PageContainer>
      </>
    );
  }

  // choose
  return (
    <>
      <ReportStyles />
      {header}
      <PageContainer>
        <div className="cb-stack">
          <div>
            <h1 className="cb-screen-title" style={{ fontSize: 26, lineHeight: '33px' }}>무엇으로 진단할까요</h1>
            <p className="cb-body cb-muted">새로 촬영하거나 저장된 얼굴 분석을 골라 주세요. 전신은 선택입니다.</p>
          </div>
          <Button block icon="camera" onClick={() => setPhase('face-capture')}>
            새로 촬영하기 (환경 · 정면 · 측면 · 전신)
          </Button>

          <section className="cb-stack-sm" aria-label="저장된 얼굴 분석">
            <SectionHeader title="저장된 얼굴 분석" as="h3" />
            {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
            {!inputs && !loadError ? <p className="cb-caption cb-muted">불러오는 중</p> : null}
            {inputs && !inputs.face.length ? <EmptyState title="저장된 얼굴 분석이 없습니다" description="새로 촬영하기로 시작하세요." /> : null}
            {inputs?.face.map((fc) => (
              <FaceChoice key={fc.id} f={fc} selected={picked.face?.id === fc.id} onSelect={() => pickFace({ id: fc.id, thumbnailUrl: fc.thumbnailUrl, presentation: fc.presentation, label: fc.label, isMock: fc.isMock })} />
            ))}
          </section>

          {picked.face ? (
            <section className="cb-stack-sm" aria-label="전신 측정 (선택)">
              <SectionHeader title="전신 측정 (선택)" as="h3" right={<Button size="sm" variant="secondary" icon="body" onClick={() => setPhase('body-capture')}>새 전신</Button>} />
              <BodyChoice b={null} selected={!picked.body} onSelect={() => setPicked((p) => ({ ...p, body: null }))} />
              {inputs?.body.map((b) => (
                <BodyChoice key={b.id} b={b} selected={picked.body?.id === b.id} onSelect={() => setPicked((p) => ({ ...p, body: { id: b.id, thumbnailUrl: b.thumbnailUrl, summary: b.summary } }))} />
              ))}
            </section>
          ) : null}

          <Button block variant={picked.face ? 'primary' : 'secondary'} disabled={!picked.face} onClick={() => setPhase('confirm')}>
            다음
          </Button>
        </div>
      </PageContainer>
    </>
  );
}
