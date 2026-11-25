'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { VibeGuideFlow } from '@celeber/celeb-vibe-report/flow';
import { LookRecolor, SubstitutionTable } from '@celeber/celeb-vibe-report/components';
import { analysisLimits, createGuideApi, GuideApiError, reportBrief } from '@celeber/celeb-vibe-report/lib';
import { statsOnly } from '@celeber/celeb-vibe/components';
import type { NamedColor, PersonalColorReport, VibeAnalysis, VibeGuide } from '@celeber/core/contracts';
import { ROUTES } from '@/lib/routes';
import { MuseGuide, MusePortrait, MuseScreen } from '@/screens/05-style-muse';
import { Button, ButtonPair, SectionTitle } from '@/ui';
import { readCurrent } from '../current';
import { fetchSelfJson, MissingAnalysis } from '../self/api';
import { ensureCurrentReport, getReportById } from '../self/report';
import { guideHref, reportHref } from './links';
import s from './muse.module.css';

const apiBase = '/muse';
const api = createGuideApi(apiBase);

export function Muse({ guideId, ...flow }: { guideId?: string; reportId?: string; celebId?: string; query?: string }) {
  return guideId ? <SavedGuide id={guideId} /> : <NewGuide {...flow} />;
}

function NewGuide({ reportId, celebId, query }: { reportId?: string; celebId?: string; query?: string }) {
  const router = useRouter();
  const [currentId, setCurrentId] = useState<string | null | undefined>(reportId);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function prepare() {
      if (reportId || !readCurrent()) return reportId ?? null;
      try {
        return (await ensureCurrentReport()).id;
      } catch (cause) {
        if (cause instanceof MissingAnalysis) return null;
        throw cause;
      }
    }
    prepare().then(
      (id) => { if (active) setCurrentId(id); },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, [attempt, reportId]);

  return (
    <MuseScreen>
      <div className={s.content}>
        {error ? (
          <div className={s.state}>
            <p role="alert">퍼스널컬러 리포트를 불러오지 못했어요.</p>
            <Button label="다시 시도" variant="line" onClick={() => { setError(false); setAttempt((n) => n + 1); }} />
            <Button label="저장한 리포트에서 고르기" variant="line" onClick={() => { setError(false); setCurrentId(null); }} />
          </div>
        ) : currentId === undefined ? <p role="status">퍼스널컬러 리포트를 준비하고 있어요.</p> : (
          <VibeGuideFlow
            apiBase={apiBase}
            initialReportId={currentId}
            initialCelebId={celebId}
            initialQuery={query}
            reportNewHref={ROUTES.capture}
            reportHref={reportHref}
            onComplete={({ guide }) => router.push(guideHref(guide.id))}
          />
        )}
      </div>
    </MuseScreen>
  );
}

type Result = { guide: VibeGuide; analysis: VibeAnalysis | null; report: PersonalColorReport | null };

function SavedGuide({ id }: { id: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      const guide = await api.get(id);
      const [analysis, report] = await Promise.all([
        fetchSelfJson<VibeAnalysis>(`${apiBase}/api/vibe/analyses/${encodeURIComponent(guide.vibeAnalysisId)}`).catch(() => null),
        getReportById(guide.reportId).catch(() => null),
      ]);
      if (active) setResult({ guide, analysis, report });
    }
    load().catch((cause: unknown) => {
      if (active) setError(cause instanceof GuideApiError && cause.status === 404 ? 'missing' : 'failed');
    });
    return () => { active = false; };
  }, [attempt, id]);

  if (result) return <GuideResult {...result} />;
  return (
    <MuseScreen searchHref={ROUTES.muse}>
      <div className={`${s.content} ${s.state}`}>
        {error ? <>
          <p role="alert">{error === 'missing' ? '가이드를 찾을 수 없어요.' : '가이드를 불러오지 못했어요.'}</p>
          {error === 'failed' ? <Button label="다시 시도" variant="line" onClick={() => { setError(null); setAttempt((n) => n + 1); }} /> : null}
          <Button href={ROUTES.library} label="내 기록 보기" variant="line" />
        </> : <p role="status">가이드를 불러오는 중이에요.</p>}
      </div>
    </MuseScreen>
  );
}

function distinctColors(colors: NamedColor[]) {
  return [...new Map(colors.map((color) => [color.hex, color])).values()].slice(0, 5);
}

function GuideResult({ guide: initial, analysis, report }: Result) {
  const [guide, setGuide] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const lock = useRef(false);

  async function save() {
    if (lock.current || guide.saved) return;
    lock.current = true;
    setSaving(true);
    setError(false);
    try {
      setGuide(await api.patch(guide.id, { saved: true }));
    } catch {
      setError(true);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  const nextQuery = new URLSearchParams({ ...(report ? { report: report.id } : {}) });
  if (guide.celebId) nextQuery.set('celeb', guide.celebId);
  else if (analysis?.celebName) nextQuery.set('q', analysis.celebName);
  const nextLookHref = `${ROUTES.muse}${nextQuery.size ? `?${nextQuery}` : ''}`;
  const photo = guide.thumbnail?.url;
  const photoSource = analysis?.image.sourceUrl ?? guide.thumbnail?.sourceUrl;
  const substitutions = guide.outfit.substitutions;
  const limits = analysis ? analysisLimits(analysis.analyzability) : null;
  const recolor = analysis && photo && !limits?.noPerson && !statsOnly(analysis.analyzability) && substitutions.some((item) => !item.keepOriginal);
  const personal = report ? reportBrief(report) : null;
  const theirColors = distinctColors(guide.paletteMapping.map((item) => item.celeb));
  const myColors = personal?.best.length ? personal.best : distinctColors(guide.paletteMapping.map((item) => item.mine));

  return (
    <MuseScreen searchHref={ROUTES.muse}>
      {photo ? <MusePortrait src={photo} name={guide.celebName} /> : null}
      {photoSource && /^https?:\/\//i.test(photoSource) ? (
        <a href={photoSource} target="_blank" rel="noopener noreferrer" className={`${s.photoSource} t-caption`}>사진 출처</a>
      ) : null}
      <MuseGuide
        data={{
          guide: { eyebrow: guide.lookName, title: `${guide.celebName} 추구미 가이드`, body: [guide.summary] },
          palettes: [
            ...(theirColors.length ? [{ who: guide.celebName, type: '', colors: theirColors }] : []),
            ...(myColors.length ? [{ who: '내 팔레트', type: personal?.nameKo ?? '', colors: myColors }] : []),
          ],
          points: [
            { k: '얼굴', v: [guide.face.summary] },
            { k: '코디', v: [guide.outfit.summary] },
            { k: '분위기', v: [guide.mood.summary] },
          ],
        }}
        comparison={substitutions.length ? (
          <section className={`${s.content} ${s.comparison}`}>
            <SectionTitle>코디 색 바꾸기</SectionTitle>
            {recolor ? <LookRecolor src={photo} items={analysis.outfit.items} substitutions={substitutions} celebName={guide.celebName} /> : null}
            <SubstitutionTable substitutions={substitutions} />
          </section>
        ) : undefined}
      />
      <div className={`${s.content} ${s.state}`}>
        {guide.limitations?.length ? <p className="t-body">{guide.limitations.join(' ')}</p> : null}
        {guide.isMock ? <p className="t-body">사진 분석과 퍼스널컬러 규칙으로 가이드를 만들었어요.</p> : null}
        {guide.actions.length ? (
          <section className={s.actions}>
            <SectionTitle>이렇게 입어 보세요</SectionTitle>
            <ol>{guide.actions.map((action) => <li key={action.priority}><b>{action.title}</b><p className="t-body">{action.detail}</p></li>)}</ol>
          </section>
        ) : null}
        {report ? <Button label="기준 리포트 다시 보기" href={reportHref(report.id)} variant="line" /> : null}
      </div>
      {error ? <p className={s.feedback} role="alert">가이드를 저장하지 못했어요. 다시 시도해 주세요.</p> : null}
      {saving ? <p className={s.feedback} role="status">가이드를 저장하는 중이에요.</p> : null}
      <ButtonPair
        primary={guide.saved ? { label: '저장했어요', href: ROUTES.library } : { label: saving ? '저장 중' : '가이드 저장', onClick: () => void save() }}
        secondary={{ label: '다른 룩 보기', href: nextLookHref }}
      />
    </MuseScreen>
  );
}
