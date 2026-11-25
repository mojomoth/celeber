'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createGuideApi, formatDate, type GuideSummary, type MyReportBrief } from '@celeber/celeb-vibe-report/lib';
import { ROUTES } from '@/lib/routes';
import { MyLibraryScreen } from '@/screens/06-my-library';
import { BottomSheet, Button, ButtonPair } from '@/ui';
import { clearCurrent, readCurrent } from '../current';
import { guideHref, reportHref } from './links';
import s from './muse.module.css';

const api = createGuideApi('/muse');
const resetApi = createGuideApi();
type Preview = Awaited<ReturnType<typeof resetApi.myDataPreview>>;
type Load<T> = { value: T } | { failed: true } | null;

export function Library() {
  const [guides, setGuides] = useState<Load<GuideSummary[]>>(null);
  const [report, setReport] = useState<Load<MyReportBrief | null>>(null);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState<'preview' | 'reset' | null>(null);
  const [resetError, setResetError] = useState('');
  const [done, setDone] = useState('');
  const resetLock = useRef(false);

  useEffect(() => {
    let active = true;
    const currentId = readCurrent()?.reportId;
    api.list({ saved: true, limit: 200 }).then(
      ({ items }) => { if (active) setGuides({ value: items }); },
      () => { if (active) setGuides({ failed: true }); },
    );
    api.myReports(100).then(
      ({ items }) => {
        if (active) setReport({ value: items.find((item) => item.id === currentId) ?? items[0] ?? null });
      },
      () => { if (active) setReport({ failed: true }); },
    );
    return () => { active = false; };
  }, [attempt]);

  function reload() {
    setGuides(null);
    setReport(null);
    setAttempt((n) => n + 1);
  }

  async function openReset() {
    if (resetLock.current) return;
    resetLock.current = true;
    setPending('preview');
    setResetError('');
    setDone('');
    try {
      setPreview(await resetApi.myDataPreview());
    } catch {
      setResetError('삭제할 항목을 확인하지 못했어요. 다시 시도해 주세요.');
    } finally {
      resetLock.current = false;
      setPending(null);
    }
  }

  const closeReset = useCallback(() => {
    if (!resetLock.current) setPreview(null);
  }, []);

  async function reset() {
    if (resetLock.current || !preview?.items.length) return;
    resetLock.current = true;
    setPending('reset');
    setResetError('');
    try {
      const result = await resetApi.resetMyData();
      clearCurrent();
      setPreview(null);
      const count = Object.values(result.deleted).reduce((sum, value) => sum + value, 0);
      setDone(`기록 ${count}개와 사진 ${result.photos}장을 삭제했어요.`);
      reload();
    } catch {
      setPreview(null);
      setResetError('초기화를 완료하지 못했어요. 삭제할 항목을 다시 확인해 주세요.');
      reload();
    } finally {
      resetLock.current = false;
      setPending(null);
    }
  }

  const items = guides && 'value' in guides ? guides.value : [];
  const personal = report && 'value' in report ? report.value : null;
  const firstAction = (href: string, label: string) => <Button href={href} label={label} variant="line" />;
  const retry = <Button onClick={reload} label="다시 시도" variant="line" />;

  return (
    <MyLibraryScreen
      data={{
        muses: items.map((item) => ({ id: item.id, name: item.celebName, look: item.lookName, photo: item.thumbnail?.url })),
        sortLabel: '최근 수정순',
        personalColor: personal ? {
          photo: personal.thumbnail?.url,
          type: personal.nameKo,
          dots: personal.best.map((color) => color.hex),
          date: formatDate(personal.createdAt),
        } : null,
        analysis: { title: '내 분석 다시 보기', sub: '촬영한 얼굴과 전신 분석을 확인해요.' },
        reset: {
          title: '내 정보 초기화',
          sub: '내 분석, 퍼스널컬러 리포트, 추구미 가이드와 내 사진을 지워요.',
        },
      }}
      actions={{
        guideHref,
        personalColorHref: personal ? reportHref(personal.id) : ROUTES.personalColor,
        analysisHref: ROUTES.analysis,
        onReset: () => void openReset(),
        guideStatus: guides === null ? <p role="status">저장한 가이드를 불러오는 중이에요.</p> :
          'failed' in guides ? <div className={s.state}><p role="alert">가이드를 불러오지 못했어요.</p>{retry}</div> :
            !items.length ? <div className={s.state}><p>아직 저장한 가이드가 없어요.</p>{firstAction(ROUTES.muse, '추구미 찾기')}</div> : null,
        colorStatus: report === null ? <p role="status">퍼스널컬러 기록을 불러오는 중이에요.</p> :
          'failed' in report ? <div className={s.state}><p role="alert">퍼스널컬러 기록을 불러오지 못했어요.</p>{retry}</div> :
            <div className={s.state}><p>아직 퍼스널컬러 리포트가 없어요.</p>{firstAction(ROUTES.personalColor, '퍼스널컬러 보기')}</div>,
        resetDialog: <>
          {pending === 'preview' ? <p className={s.feedback} role="status">삭제할 항목을 확인하는 중이에요.</p> : null}
          {resetError ? <p className={s.feedback} role="alert">{resetError}</p> : null}
          {done ? <p className={s.feedback} role="status">{done}</p> : null}
          <BottomSheet open={!!preview} onClose={closeReset} labelledBy="library-reset-title" className={s.resetSheet} initialFocus={(el) => el.querySelector<HTMLButtonElement>('button:last-child')}>
            {preview ? <>
              <h2 id="library-reset-title" className="t-h2">{preview.items.length ? '내 정보를 모두 지울까요?' : '지울 내 정보가 없어요'}</h2>
              {preview.items.length ? <>
                <p className="t-body">삭제한 기록은 복구할 수 없어요.</p>
                <ul>{preview.items.map((item) => <li key={item}>{item}</li>)}</ul>
              </> : null}
              <p className="t-body">연예인 검색 기록과 사진 분석, 여기에 연결된 사진은 남아요.</p>
              {pending === 'reset' ? <p role="status" tabIndex={-1} ref={(el) => el?.focus()}>삭제하는 중이에요.</p> : preview.items.length ?
                <ButtonPair className={s.resetActions} danger primary={{ label: '모두 삭제', onClick: () => void reset() }} secondary={{ label: '취소', onClick: closeReset }} /> :
                <Button label="닫기" variant="line" onClick={closeReset} />}
            </> : null}
          </BottomSheet>
        </>,
      }}
    />
  );
}
