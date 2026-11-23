'use client';
/**
 * 추구미 가이드 플로우 (재사용).
 *   1) 내 퍼스널컬러 리포트 선택 (없으면 리포트 만들기 경로 안내)
 *   2) 추구미 사진: 이름 검색(search-celeb CelebSearchFlow) / 사진 올리기 / 이전 분석
 *   3) 분석 가능 여부 → 분석 (celeb-vibe VibeAnalyzer). 분석 불가면 사유를 보여주고 같은 인물의 대표·최근·평소 사진에서 다시 고른다.
 *   4) 분석 결과 확인 (VibeResultView) → 가이드 생성 → onComplete
 * API: apiBase + '/api/guide/*', '/api/celeb/*', '/api/vibe/*', '/api/uploads' (호스트가 재노출).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Analyzability, ImageRef, VibeAnalysis } from '@celeber/core/contracts';
import { AnalyzingOverlay, Button, Card, EmptyState, FileButton, Notice, SectionHeader, StepIndicator, Tabs } from '@celeber/ui';
import { CelebSearchFlow } from '@celeber/search-celeb/flow';
import { ACCEPT_IMAGES, VibeAnalyzer, uploadVibeImage } from '@celeber/celeb-vibe/flow';
import { VibeResultView, VibeSummaryRow } from '@celeber/celeb-vibe/components';
import type { VibeAnalysisSummary } from '@celeber/celeb-vibe/lib';
import { type GenerateGuideResponse, GuideApiError, createGuideApi } from '../lib/api';
import type { MyReportBrief } from '../lib/types';
import { analysisLimits } from '../lib/limits';
import { MAX_UPLOAD_MB, checkUploadFile, friendlyUploadError } from '../lib/upload-check';
import { MyReportCard } from '../components/GuideGrid';
import s from '../components/guide.module.css';

export interface VibeGuideFlowProps {
  apiBase?: string;
  /** 미리 고른 내 리포트 (?report=) */
  initialReportId?: string | null;
  /** 이미 분석한 연예인 사진으로 바로 시작 (?vibe=) */
  initialVibeId?: string | null;
  /** 처음부터 열 인물 (?celeb=) */
  initialCelebId?: string | null;
  /** 처음 검색어 (?q=) */
  initialQuery?: string | null;
  /** 리포트가 없을 때 '리포트 만들기' 링크 (기본 '/report/new') */
  reportNewHref?: string;
  /** 리포트 다시보기 링크 */
  reportHref?: (id: string) => string;
  /** Claude 서술 건너뛰기 */
  skipAi?: boolean;
  onComplete: (r: GenerateGuideResponse) => void;
}

type Step = 'report' | 'celeb' | 'analyze' | 'review';
type Source = 'search' | 'upload' | 'saved';
const STEPS = ['내 리포트', '추구미 사진', '분석 확인', '가이드'];
const STEP_INDEX: Record<Step, number> = { report: 0, celeb: 1, analyze: 2, review: 2 };

interface Target {
  image: ImageRef;
  celebName?: string;
  celebId?: string;
  celebImageId?: string;
}

const errMsg = (e: unknown) => (e instanceof GuideApiError || e instanceof Error ? e.message : String(e));

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as unknown;
  if (!res.ok) throw new Error((body as { error?: { message?: string } } | null)?.error?.message ?? `요청 실패 (${res.status})`);
  return body as T;
}

/** 분석 불가 사유 한 줄 */
export function analyzabilityReasonText(a: Analyzability | null): string {
  if (!a) return '분석하기 어려운 사진입니다';
  const rs = [...a.reasons].sort((x, y) => (x.severity === 'error' ? -1 : 0) - (y.severity === 'error' ? -1 : 0));
  const msgs = rs.map((r) => r.message.trim().replace(/[.。]$/, '')).slice(0, 2);
  return msgs.length ? msgs.join(' / ') : '분석하기 어려운 사진입니다';
}

export function VibeGuideFlow({
  apiBase = '',
  initialReportId = null,
  initialVibeId = null,
  initialCelebId = null,
  initialQuery = null,
  reportNewHref = '/report/new',
  reportHref,
  skipAi,
  onComplete,
}: VibeGuideFlowProps) {
  const api = useMemo(() => createGuideApi(apiBase), [apiBase]);
  const [step, setStep] = useState<Step>(initialReportId ? (initialVibeId ? 'review' : 'celeb') : 'report');
  const [reports, setReports] = useState<MyReportBrief[] | null>(null);
  const [reportId, setReportId] = useState<string | null>(initialReportId);
  const [source, setSource] = useState<Source>('search');
  const [search, setSearch] = useState<{ key: number; celebId: string | null; query: string | null }>({ key: 0, celebId: initialCelebId, query: initialQuery });
  const [target, setTarget] = useState<Target | null>(null);
  const [precheck, setPrecheck] = useState<Analyzability | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{ analysis: VibeAnalysis; warning?: string } | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<VibeAnalysisSummary[] | null>(null);
  /** ?report= 로 받은 리포트가 목록에 없음(삭제됨·잘못된 링크) */
  const [staleReport, setStaleReport] = useState(false);

  // 내 리포트 목록
  useEffect(() => {
    let alive = true;
    api
      .myReports()
      .then((r) => {
        if (!alive) return;
        setReports(r.items);
        if (initialReportId && !r.items.some((x) => x.id === initialReportId)) {
          // 링크의 리포트가 없으면 가장 최근 리포트를 미리 고르고 리포트 선택 단계로 돌아간다
          setStaleReport(true);
          setReportId(r.items[0]?.id ?? null);
          setStep('report');
          return;
        }
        // 기본값: 가장 최근 리포트 (사용자가 바꿀 수 있다)
        setReportId((cur) => cur ?? r.items[0]?.id ?? null);
      })
      .catch((e) => alive && (setReports([]), setError(errMsg(e))));
    return () => {
      alive = false;
    };
  }, [api, initialReportId]);

  // ?vibe= 로 시작: 저장된 분석 불러오기
  useEffect(() => {
    if (!initialVibeId) return;
    let alive = true;
    getJson<VibeAnalysis>(`${apiBase}/api/vibe/analyses/${encodeURIComponent(initialVibeId)}`)
      .then((a) => alive && (setAnalysis({ analysis: a }), setTarget({ image: a.image, celebName: a.celebName, celebId: a.celebId, celebImageId: a.celebImageId })))
      .catch((e) => alive && (setError(errMsg(e)), setStep('celeb')));
    return () => {
      alive = false;
    };
  }, [apiBase, initialVibeId]);

  // 이전 분석 탭
  useEffect(() => {
    if (source !== 'saved' || saved !== null) return;
    let alive = true;
    getJson<{ items: VibeAnalysisSummary[] }>(`${apiBase}/api/vibe/analyses?limit=30`)
      .then((r) => alive && setSaved(r.items))
      .catch((e) => alive && (setSaved([]), setError(errMsg(e))));
    return () => {
      alive = false;
    };
  }, [apiBase, saved, source]);

  const report = reports?.find((r) => r.id === reportId) ?? null;
  const limits = analysis ? analysisLimits(analysis.analysis.analyzability) : null;

  const startAnalyze = (t: Target) => {
    setTarget(t);
    setPrecheck(null);
    setAnalysis(null);
    setError(null);
    setStep('analyze');
  };

  /** 분석 불가 → 같은 인물의 다른 사진 고르기 */
  const goFallback = useCallback(
    (a: Analyzability | null) => {
      const name = target?.celebName?.trim();
      const lim = a ? analysisLimits(a) : null;
      const reason = lim?.limited ? `올린 사진은 분석하기 어렵습니다 (${lim.reasons.join(' / ')}). ` : '';
      setFallback(
        `${reason}${name ? `${name}의 대표·최근·평소 사진에서 다시 골라 주세요.` : '이름으로 인물을 찾아 대표·최근·평소 사진에서 골라 주세요.'}`,
      );
      setSource('search');
      setSearch((sv) => ({ key: sv.key + 1, celebId: target?.celebId ?? null, query: target?.celebId ? null : (name ?? null) }));
      setStep('celeb');
    },
    [target],
  );

  const onUpload = async (file: File) => {
    // 형식·크기는 올리기 전에 한국어로 막는다 (서버의 영어 원문 오류를 보이지 않게)
    const bad = checkUploadFile(file);
    if (bad) {
      setError(bad);
      return;
    }
    setBusy('사진 올리는 중');
    setError(null);
    try {
      const image = await uploadVibeImage(file, apiBase);
      setFallback(null);
      startAnalyze({ image, celebName: uploadName.trim() || undefined });
    } catch (e) {
      setError(friendlyUploadError(errMsg(e)));
    } finally {
      setBusy(null);
    }
  };

  const pickSaved = async (id: string) => {
    setBusy('분석 불러오는 중');
    setError(null);
    try {
      const a = await getJson<VibeAnalysis>(`${apiBase}/api/vibe/analyses/${encodeURIComponent(id)}`);
      setTarget({ image: a.image, celebName: a.celebName, celebId: a.celebId, celebImageId: a.celebImageId });
      setAnalysis({ analysis: a });
      setStep('review');
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    if (!reportId || !analysis) return;
    setBusy('내 팔레트로 가이드 만드는 중');
    setError(null);
    try {
      const r = await api.generate({ reportId, vibeAnalysisId: analysis.analysis.id, skipAi });
      onComplete(r);
    } catch (e) {
      setError(errMsg(e));
      setBusy(null);
      // 리포트가 그사이 삭제됐으면 리포트 선택으로 돌려보낸다
      if (e instanceof GuideApiError && e.code === 'report_not_found') {
        setStaleReport(true);
        setReportId(null);
        setReports(null);
        api
          .myReports()
          .then((r) => (setReports(r.items), setReportId(r.items[0]?.id ?? null)))
          .catch(() => setReports([]));
        setStep('report');
      }
    }
  };

  /* ------------------------------------------------------------ 렌더 */
  const reportBar =
    step !== 'report' && reports !== null && !report ? (
      <div className="cb-row" style={{ justifyContent: 'space-between', margin: '4px 0 16px' }}>
        <span className="cb-caption cb-muted">내 리포트를 아직 고르지 않았습니다</span>
        <button type="button" className="cb-caption" style={{ background: 'none', border: 0, color: 'var(--cb-iris-deep)', fontWeight: 700, minHeight: 44, cursor: 'pointer' }} onClick={() => setStep('report')}>
          리포트 고르기
        </button>
      </div>
    ) : step !== 'report' && report ? (
      <div className="cb-row" style={{ justifyContent: 'space-between', margin: '4px 0 16px' }}>
        <span className="cb-caption cb-muted">
          내 타입 <b style={{ color: 'var(--cb-ink)' }}>{report.nameKo}</b>
        </span>
        <button type="button" className="cb-caption" style={{ background: 'none', border: 0, color: 'var(--cb-iris-deep)', fontWeight: 700, minHeight: 44, cursor: 'pointer' }} onClick={() => setStep('report')}>
          리포트 바꾸기
        </button>
      </div>
    ) : null;

  return (
    <div>
      <div style={{ margin: '8px 0 16px' }}>
        <StepIndicator steps={STEPS} current={STEP_INDEX[step]} />
      </div>
      {reportBar}
      {error ? (
        <div style={{ marginBottom: 12 }}>
          <Notice tone="danger">{error}</Notice>
        </div>
      ) : null}

      {step === 'report' ? (
        <section>
          <SectionHeader title="내 퍼스널컬러 리포트" subtitle="가이드의 기준이 될 리포트를 고르세요." />
          {staleReport ? (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="warn" title="링크의 리포트를 찾을 수 없습니다">
                삭제되었거나 잘못된 링크입니다. 가이드의 기준이 될 리포트를 다시 골라 주세요.
              </Notice>
            </div>
          ) : null}
          {reports === null ? (
            <p className="cb-body cb-muted">불러오는 중…</p>
          ) : reports.length ? (
            <div className="cb-stack-sm">
              {reports.map((r) => (
                <MyReportCard key={r.id} report={r} apiBase={apiBase} selected={r.id === reportId} onSelect={() => setReportId(r.id)} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="아직 퍼스널컬러 리포트가 없습니다"
              description="얼굴을 촬영하거나 저장된 얼굴 분석으로 리포트를 먼저 만들어야 내 팔레트 기준 가이드를 받을 수 있습니다."
              action={
                <Button href={reportNewHref} icon="camera">
                  퍼스널컬러 리포트 만들기
                </Button>
              }
            />
          )}
          {reports?.length ? (
            <div className="cb-stack-sm" style={{ marginTop: 16 }}>
              <Button block disabled={!reportId} onClick={() => (setStaleReport(false), setError(null), setStep(analysis ? 'review' : 'celeb'))}>
                이 리포트로 계속
              </Button>
              {reportId && reportHref ? (
                <Button block variant="ghost" href={reportHref(reportId)}>
                  리포트 다시보기
                </Button>
              ) : null}
              <Button block variant="secondary" href={reportNewHref}>
                새 리포트 만들기
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 'celeb' ? (
        <section>
          <SectionHeader title="추구미 사진" subtitle="연예인을 이름으로 찾거나 사진을 올리세요." />
          {fallback ? (
            <div style={{ marginBottom: 12 }}>
              <Notice tone="warn" title="다른 사진을 골라 주세요">
                {fallback}
              </Notice>
            </div>
          ) : null}
          <Tabs<Source>
            items={[
              { value: 'search', label: '이름으로 찾기', icon: 'search' },
              { value: 'upload', label: '사진 올리기', icon: 'upload' },
              { value: 'saved', label: '이전 분석', icon: 'image' },
            ]}
            value={source}
            onChange={setSource}
          />
          <div style={{ marginTop: 16 }}>
            {source === 'search' ? (
              <CelebSearchFlow
                key={search.key}
                apiBase={apiBase}
                selection="single"
                completeLabel="이 사진으로 분석"
                initialCelebId={search.celebId}
                initialQuery={search.query}
                onComplete={({ celeb, selectedImages }) => {
                  const im = selectedImages[0];
                  if (!im?.cached) {
                    setError('선택한 사진을 불러오지 못했습니다. 다른 사진을 골라 주세요.');
                    return;
                  }
                  startAnalyze({ image: im.cached, celebName: celeb.name, celebId: celeb.id, celebImageId: im.id });
                }}
              />
            ) : null}
            {source === 'upload' ? (
              <Card>
                <div className={s.inputRow}>
                  <label className="cb-row-title" htmlFor="cvr-upload-name">
                    인물 이름 (선택)
                  </label>
                  <input id="cvr-upload-name" className={s.input} value={uploadName} maxLength={40} placeholder="예: 한서도" onChange={(e) => setUploadName(e.target.value)} />
                  <p className="cb-caption cb-muted" style={{ margin: 0 }}>
                    이름을 적으면 사진을 분석할 수 없을 때 같은 인물의 대표·최근·평소 사진을 바로 찾아 드립니다. 사진으로 인물을 판별하지는 않습니다.
                  </p>
                  <div style={{ position: 'relative', marginTop: 8 }}>
                    <FileButton variant="primary" block accept={ACCEPT_IMAGES} onFile={(f) => void onUpload(f)}>
                      {busy ? busy : '전신 사진 올리기'}
                    </FileButton>
                  </div>
                  <p className="cb-caption cb-muted" style={{ margin: 0 }}>
                    JPEG · PNG · WebP, {MAX_UPLOAD_MB}MB 이하. 한 사람의 전신 또는 상반신이 보이는 사진이 좋습니다.
                  </p>
                </div>
              </Card>
            ) : null}
            {source === 'saved' ? (
              saved === null ? (
                <p className="cb-body cb-muted">불러오는 중…</p>
              ) : saved.length ? (
                <div>
                  {saved.map((it) => (
                    <VibeSummaryRow
                      key={it.id}
                      item={it}
                      apiBase={apiBase}
                      right={
                        <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void pickSaved(it.id)}>
                          선택
                        </Button>
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState title="이전에 분석한 사진이 없습니다" description="이름으로 찾거나 사진을 올려 주세요." />
              )
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 'analyze' && target ? (
        <section>
          <SectionHeader title="분석 가능 여부" subtitle={target.celebName ? `${target.celebName} 사진` : '올린 사진'} />
          <VibeAnalyzer
            key={target.image.uploadId}
            image={target.image}
            apiBase={apiBase}
            celebName={target.celebName}
            celebId={target.celebId}
            celebImageId={target.celebImageId}
            onPrecheck={setPrecheck}
            onPickAnother={() => goFallback(precheck)}
            onComplete={(r) => {
              setAnalysis(r);
              setFallback(null);
              setStep('review');
            }}
          />
        </section>
      ) : null}

      {step === 'review' ? (
        analysis ? (
          <section style={{ position: 'relative' }}>
            {busy ? (
              <div style={{ position: 'fixed', inset: 0, zIndex: 40, display: 'grid' }}>
                <AnalyzingOverlay message={busy} sub="연예인 룩의 색을 내 팔레트로 옮기고 갭을 계산합니다" />
              </div>
            ) : null}
            <VibeResultView
              analysis={analysis.analysis}
              apiBase={apiBase}
              warning={analysis.warning}
              actions={
                limits?.limited ? (
                  <Notice tone="warn" title="분석이 제한된 사진입니다">
                    {limits.reasons.join(' / ')}. 가이드 정확도가 낮을 수 있습니다.{limits.noPerson ? ' 인물을 찾지 못해 코디 색 치환과 얼굴 색 비교는 하지 않습니다.' : ''}
                  </Notice>
                ) : limits?.colorCaution ? (
                  <Notice tone="warn" title="색이 실제와 다를 수 있는 사진입니다">
                    {limits.colorReasons.join(' / ')}. {limits.colorUnusable ? '가이드에서 피부·헤어 색 비교는 하지 않고, ' : ''}코디 색 치환은 참고용으로만 보여 줍니다.
                  </Notice>
                ) : undefined
              }
            />
            <div className={s.footerBar}>
              <Button variant="secondary" onClick={() => goFallback(limits?.limited ? analysis.analysis.analyzability : null)}>
                다른 사진
              </Button>
              <Button onClick={() => void generate()} disabled={!reportId || !!busy} loading={!!busy}>
                가이드 만들기
              </Button>
            </div>
            {!reportId ? <Notice tone="warn">먼저 내 퍼스널컬러 리포트를 골라 주세요.</Notice> : null}
          </section>
        ) : (
          <p className="cb-body cb-muted">분석 결과를 불러오는 중…</p>
        )
      ) : null}
    </div>
  );
}
