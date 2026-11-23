'use client';
/**
 * 연예인 검색 플로우 (재사용): 이름/사진으로 후보 찾기 → 사용자가 확정 → 대표·최근·평소 전신 사진 선택.
 * 완료 시 onComplete({ celeb, selectedImages, uploadedPhoto }).
 * API는 apiBase + '/api/celeb/*', '/api/uploads'로 호출한다 (호스트 앱이 같은 경로를 재노출해야 함).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CelebImage, CelebImageCategory, ImageRef } from '@celeber/core/contracts';
import { Button, ConfirmDialog, MockBadge, Notice, SectionHeader } from '@celeber/ui';
import { CelebApiError, createCelebApi } from '../lib/api';
import { photoConfirmNote } from '../lib/candidates';
import { candidateKey } from '../lib/names';
import { photoFileProblem, photoErrorMessage } from '../lib/upload';
import { CATEGORY_ORDER } from '../lib/queries';
import type { CandidateItem, CelebDetailResponse, CelebSearchResult, CelebSummary, CollectImagesResponse, IdentifyResponse, SearchResponse } from '../lib/types';
import { CandidateList } from '../components/CandidateList';
import { CelebGallery } from '../components/CelebGallery';
import { CelebProfileHeader } from '../components/CelebProfileHeader';
import { CelebSearchBox } from '../components/CelebSearchBox';
import { IdentifyPanel } from '../components/IdentifyPanel';
import { SavedCelebList } from '../components/SavedCelebList';
import s from '../components/search-celeb.module.css';

export interface CelebSearchFlowProps {
  apiBase?: string;
  /** 사진 선택 방식 (기본 multiple). celeb-vibe-report처럼 한 장만 필요하면 'single' */
  selection?: 'multiple' | 'single';
  /** 처음부터 열 인물 (URL ?celeb= 등) */
  initialCelebId?: string | null;
  /** 인물 열기/닫기 (호스트가 URL 동기화에 사용) */
  onCelebChange?: (celebId: string | null) => void;
  onComplete?: (result: CelebSearchResult) => void;
  completeLabel?: string;
  /** 저장한 인물/최근 찾은 인물 목록 표시 (기본 true) */
  showLibrary?: boolean;
  /** 사진으로 찾기 표시 (기본 true) */
  allowPhoto?: boolean;
  /** 처음에 바로 검색할 이름 (URL ?q= 등) */
  initialQuery?: string | null;
}

type Busy = { kind: 'search' } | { kind: 'identify' } | { kind: 'confirm'; key: string } | null;

const errMsg = (e: unknown) => (e instanceof CelebApiError || e instanceof Error ? e.message : String(e));

export function CelebSearchFlow({
  apiBase = '',
  selection = 'multiple',
  initialCelebId = null,
  onCelebChange,
  onComplete,
  completeLabel = '이 사진으로 계속',
  showLibrary = true,
  allowPhoto = true,
  initialQuery = null,
}: CelebSearchFlowProps) {
  const api = useMemo(() => createCelebApi(apiBase), [apiBase]);

  // 검색 단계
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchResponse | null>(null);
  const [preview, setPreview] = useState<string | undefined>();
  const [identify, setIdentify] = useState<IdentifyResponse | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [pendingPhotoCandidate, setPendingPhotoCandidate] = useState<CandidateItem | null>(null);
  const [library, setLibrary] = useState<{ saved: CelebSummary[]; recent: CelebSummary[] }>({ saved: [], recent: [] });

  // 인물 단계
  const [celebId, setCelebId] = useState<string | null>(initialCelebId);
  const [detail, setDetail] = useState<CelebDetailResponse | null>(null);
  const [category, setCategory] = useState<CelebImageCategory>('signature');
  const [collecting, setCollecting] = useState<Partial<Record<CelebImageCategory, boolean>>>({});
  const [notices, setNotices] = useState<Partial<Record<CelebImageCategory, string[]>>>({});
  const [saving, setSaving] = useState(false);
  const [uploadedPhoto, setUploadedPhoto] = useState<ImageRef | undefined>();
  const attempted = useRef(new Set<string>());

  const loadLibrary = useCallback(async () => {
    if (!showLibrary) return;
    try {
      const [saved, recent] = await Promise.all([api.list({ saved: true, limit: 30 }), api.list({ saved: false, limit: 8 })]);
      setLibrary({ saved: saved.items, recent: recent.items });
    } catch {
      /* 목록 실패는 검색을 막지 않는다 */
    }
  }, [api, showLibrary]);

  useEffect(() => {
    // 마운트 시 저장 목록을 불러온다 (외부 API와 동기화)
    void loadLibrary();
  }, [loadLibrary]);

  useEffect(() => () => {
    if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  /* ------------------------------------------------------------ 인물 열기 */
  const openCeleb = useCallback(
    (id: string | null) => {
      setCelebId(id);
      setDetail(null);
      setNotices({});
      setCategory('signature');
      setError(null);
      onCelebChange?.(id);
      if (!id) void loadLibrary();
    },
    [onCelebChange, loadLibrary],
  );

  useEffect(() => {
    if (!celebId) return;
    let alive = true;
    api
      .get(celebId)
      .then((d) => alive && setDetail(d))
      .catch((e) => {
        if (!alive) return;
        setError(errMsg(e));
        setCelebId(null);
        onCelebChange?.(null);
      });
    return () => {
      alive = false;
    };
  }, [api, celebId, onCelebChange]);

  const applyCollect = useCallback((r: CollectImagesResponse) => {
    setDetail((d) => (d && d.celeb.id === r.celebId ? { ...d, images: { ...d.images, [r.category]: r.images } } : d));
    setNotices((n) => ({ ...n, [r.category]: r.notices }));
  }, []);

  const collect = useCallback(
    async (id: string, cat: CelebImageCategory, refresh = false) => {
      setCollecting((c) => ({ ...c, [cat]: true }));
      try {
        applyCollect(await api.collect(id, cat, refresh));
      } catch (e) {
        setNotices((n) => ({ ...n, [cat]: [`사진을 모으지 못했습니다: ${errMsg(e)}`] }));
      } finally {
        setCollecting((c) => ({ ...c, [cat]: false }));
      }
    },
    [api, applyCollect],
  );

  // 비어 있는 카테고리를 현재 탭부터 차례로 수집 (검색 결과는 DB에 캐시되어 다음에는 바로 열린다)
  useEffect(() => {
    if (!detail) return;
    const id = detail.celeb.id;
    const order = [category, ...CATEGORY_ORDER.filter((c) => c !== category)];
    const todo = order.filter((c) => !detail.images[c].length && !attempted.current.has(`${id}:${c}`));
    if (!todo.length || Object.values(collecting).some(Boolean)) return;
    const next = todo[0];
    attempted.current.add(`${id}:${next}`);
    void collect(id, next);
  }, [detail, category, collecting, collect]);

  /* ------------------------------------------------------------ 검색 */
  const runSearch = async (q: string) => {
    setBusy({ kind: 'search' });
    setError(null);
    try {
      setSearch(await api.search(q));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const closePhoto = () => {
    setIdentify(null);
    setPreview(undefined);
  };

  const runIdentify = async (file: File) => {
    setError(null);
    setIdentify(null);
    const problem = photoFileProblem(file);
    if (problem) {
      // 서버로 보내지 않고 바로 알린다 (25MB 초과, 사진 아님)
      setPreview(undefined);
      setError(problem);
      return;
    }
    setPreview(URL.createObjectURL(file));
    setIdentifying(true);
    let stage: 'upload' | 'identify' = 'upload';
    try {
      const rec = await api.uploadPhoto(file);
      stage = 'identify';
      setIdentify(await api.identify(rec.id));
    } catch (e) {
      // 실패하면 패널을 닫는다. 미리보기와 '찾고 있습니다' 문구가 오류와 함께 남지 않게
      closePhoto();
      setError(photoErrorMessage(stage, e));
    } finally {
      setIdentifying(false);
    }
  };

  const confirm = async (c: CandidateItem, fromPhoto: boolean) => {
    if (c.celebId) {
      setUploadedPhoto(fromPhoto ? identify?.upload : undefined);
      openCeleb(c.celebId);
      return;
    }
    setBusy({ kind: 'confirm', key: candidateKey(c) });
    setError(null);
    try {
      const { celebId: _omit, saved: _saved, ...candidate } = c;
      void _omit;
      void _saved;
      const { celeb } = await api.confirm(candidate);
      setUploadedPhoto(fromPhoto ? identify?.upload : undefined);
      openCeleb(celeb.id);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  // 처음 검색어가 있으면 마운트 시 한 번 검색
  const initialRun = useRef(false);
  useEffect(() => {
    if (initialRun.current || !initialQuery?.trim() || initialCelebId) return;
    initialRun.current = true;
    void runSearch(initialQuery.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery, initialCelebId]);

  /* ------------------------------------------------------------ 선택 */
  const allImages = useMemo(() => (detail ? CATEGORY_ORDER.flatMap((c) => detail.images[c]) : []), [detail]);
  const selectedIds = allImages.filter((i) => i.selected).map((i) => i.id);

  const patchLocal = (ids: string[], selected: boolean) =>
    setDetail((d) => {
      if (!d) return d;
      const images = { ...d.images };
      for (const c of CATEGORY_ORDER) images[c] = images[c].map((im) => (ids.includes(im.id) ? { ...im, selected } : im));
      return { ...d, images };
    });

  const toggle = async (im: CelebImage) => {
    const on = !im.selected;
    const off = on && selection === 'single' ? selectedIds.filter((x) => x !== im.id) : [];
    patchLocal([im.id], on);
    if (off.length) patchLocal(off, false);
    try {
      await Promise.all([api.select(im.id, on), ...off.map((x) => api.select(x, false))]);
    } catch (e) {
      patchLocal([im.id], !on);
      if (off.length) patchLocal(off, true);
      setError(errMsg(e));
    }
  };

  const toggleSave = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const { celeb } = await api.setSaved(detail.celeb.id, !detail.celeb.saved);
      setDetail((d) => (d ? { ...d, celeb } : d));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------ 렌더 */
  if (celebId) {
    const selected = allImages.filter((i) => i.selected);
    return (
      <div className="cb-stack" style={{ gap: 'var(--cb-s5)' }}>
        <div>
          <button type="button" className={s.linkBtn} onClick={() => openCeleb(null)}>
            다른 인물 찾기
          </button>
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {detail ? (
          <>
            <CelebProfileHeader celeb={detail.celeb} apiBase={apiBase} onToggleSave={toggleSave} saving={saving} />
            <section>
              <SectionHeader title="전신 룩" subtitle={selection === 'single' ? '분석할 사진 한 장을 고르세요.' : '참고할 사진을 고르세요. 여러 장 선택할 수 있습니다.'} />
              <CelebGallery
                images={detail.images}
                category={category}
                onCategoryChange={setCategory}
                selectedIds={selectedIds}
                onToggle={toggle}
                apiBase={apiBase}
                loading={collecting}
                notices={notices}
                onRefresh={(c) => void collect(detail.celeb.id, c, true)}
              />
            </section>
            {selected.length ? (
              <section>
                <SectionHeader title="선택한 사진" subtitle={`${selected.length}장 · 대표/최근/평소 탭에 걸쳐 유지됩니다.`} />
                <div className={s.selectedStrip}>
                  {selected.map((im) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={im.id} src={`${apiBase}${im.cached?.url ?? ''}`} alt="선택한 사진" />
                  ))}
                </div>
              </section>
            ) : null}
            {onComplete ? (
              <div className={s.footer}>
                <span className={s.count}>{selected.length}장 선택</span>
                <Button variant="primary" block disabled={!selected.length} onClick={() => onComplete({ celeb: detail.celeb, selectedImages: selected, uploadedPhoto })}>
                  {completeLabel}
                </Button>
              </div>
            ) : null}
          </>
        ) : (
          <div className={s.skeleton} aria-busy="true" aria-label="불러오는 중">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="cb-stack" style={{ gap: 'var(--cb-s5)' }}>
      <CelebSearchBox
        apiBase={apiBase}
        initialQuery={initialQuery ?? ''}
        busy={busy?.kind === 'search'}
        onSearch={runSearch}
        onPhoto={allowPhoto ? runIdentify : undefined}
        onPickSuggestion={(it) => (it.celebId ? openCeleb(it.celebId) : void runSearch(it.name))}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {preview || identify ? (
        <section>
          <SectionHeader title="사진으로 찾기" right={identifying ? undefined : <button type="button" className={s.linkBtn} onClick={closePhoto}>닫기</button>} />
          <IdentifyPanel previewUrl={preview} result={identify} loading={identifying} apiBase={apiBase} />
          {identify?.candidates.length ? (
            <div style={{ marginTop: 'var(--cb-s4)' }}>
              <div className="cb-row" style={{ justifyContent: 'space-between' }}>
                <span className="cb-row-title">{identify.needsNameSearch ? '데모 후보' : '사진 단서로 찾은 후보'}</span>
                {identify.isMock ? <MockBadge /> : null}
              </div>
              <CandidateList items={identify.candidates} apiBase={apiBase} busyKey={busy?.kind === 'confirm' ? busy.key : null} onSelect={(c) => setPendingPhotoCandidate(c)} selectLabel="확인" />
            </div>
          ) : null}
        </section>
      ) : null}

      {search ? (
        <section>
          <SectionHeader
            title="검색 결과"
            subtitle={`"${search.query}" · 이름과 사진을 보고 맞는 인물을 고르세요.`}
            right={search.isMock ? <MockBadge /> : undefined}
          />
          {search.notices.map((n) => (
            <div key={n} style={{ marginBottom: 8 }}>
              <Notice>{n}</Notice>
            </div>
          ))}
          <CandidateList items={search.candidates} apiBase={apiBase} busyKey={busy?.kind === 'confirm' ? busy.key : null} onSelect={(c) => void confirm(c, false)} />
        </section>
      ) : null}

      {showLibrary ? (
        <>
          <section>
            <SectionHeader title="저장한 인물" />
            <SavedCelebList
              items={library.saved}
              apiBase={apiBase}
              onOpen={(id) => openCeleb(id)}
              onDelete={async (id) => {
                await api.remove(id);
                await loadLibrary();
              }}
            />
          </section>
          {library.recent.length ? (
            <section>
              <SectionHeader title="최근 찾은 인물" subtitle="저장하지 않은 인물입니다." />
              <SavedCelebList
                items={library.recent}
                apiBase={apiBase}
                onOpen={(id) => openCeleb(id)}
                onDelete={async (id) => {
                  await api.remove(id);
                  await loadLibrary();
                }}
              />
            </section>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={!!pendingPhotoCandidate}
        title={`${pendingPhotoCandidate?.name ?? ''}(으)로 확정할까요?`}
        description={pendingPhotoCandidate ? photoConfirmNote(pendingPhotoCandidate.source) : ''}
        items={pendingPhotoCandidate?.evidence.slice(0, 3)}
        confirmLabel="이 인물로 확정"
        cancelLabel="다시 고르기"
        loading={busy?.kind === 'confirm'}
        onCancel={() => setPendingPhotoCandidate(null)}
        onConfirm={async () => {
          const c = pendingPhotoCandidate;
          if (!c) return;
          await confirm(c, true);
          setPendingPhotoCandidate(null);
        }}
      />
    </div>
  );
}
