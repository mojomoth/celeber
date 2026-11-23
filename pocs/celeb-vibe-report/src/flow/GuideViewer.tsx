'use client';
/**
 * 저장된 가이드 다시보기 (상태 보유): 저장 토글, 룩 이름 수정, 다시 만들기(같은 id), 삭제(확인 단계).
 * 다른 앱: import { GuideViewer } from '@celeber/celeb-vibe-report/flow'
 */
import { type ReactNode, useMemo, useState } from 'react';
import type { VibeAnalysis, VibeGuide } from '@celeber/core/contracts';
import { Button, ConfirmDialog, Notice } from '@celeber/ui';
import { VibeGuideView } from '../components/VibeGuideView';
import { createGuideApi } from '../lib/api';
import type { MyReportBrief } from '../lib/types';
import s from '../components/guide.module.css';

export interface GuideViewerProps {
  guide: VibeGuide;
  vibe?: VibeAnalysis | null;
  myReport?: MyReportBrief | null;
  apiBase?: string;
  warning?: string;
  reportHref?: string;
  bodyAddHref?: string;
  /** 다른 룩 보기(새 가이드) 링크 */
  newHref?: string;
  /** 삭제 후 호출 (없으면 삭제 버튼 숨김) */
  onDeleted?: () => void;
  extraActions?: ReactNode;
}

export function GuideViewer({ guide: initial, vibe, myReport, apiBase = '', warning: initialWarning, reportHref, bodyAddHref, newHref, onDeleted, extraActions }: GuideViewerProps) {
  const api = useMemo(() => createGuideApi(apiBase), [apiBase]);
  const [guide, setGuide] = useState(initial);
  // 다시 만들기에서 받은 경고가 있으면 그것을, 아니면 호스트가 준 경고를 보인다
  const [regenWarning, setWarning] = useState<string | undefined>();
  const warning = regenWarning ?? initialWarning;
  const [busy, setBusy] = useState<null | 'save' | 'regen' | 'name'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lookName, setLookName] = useState(initial.lookName);

  const run = async (kind: 'save' | 'regen' | 'name', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleSave = () => run('save', async () => setGuide(await api.patch(guide.id, { saved: !guide.saved })));
  const regenerate = () =>
    run('regen', async () => {
      const r = await api.regenerate(guide.id);
      setGuide(r.guide);
      setWarning(r.warning);
    });
  const saveName = () =>
    run('name', async () => {
      setGuide(await api.patch(guide.id, { lookName: lookName.trim() }));
      setEditing(false);
    });

  const actions = (
    <div className="cb-stack-sm">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {editing ? (
        <div className={s.inputRow}>
          <label className="cb-caption cb-muted" htmlFor="cvr-look-name">
            룩 이름
          </label>
          <input id="cvr-look-name" className={s.input} value={lookName} maxLength={40} onChange={(e) => setLookName(e.target.value)} />
          <div className="cb-row">
            <Button size="sm" onClick={() => void saveName()} loading={busy === 'name'} disabled={!lookName.trim()}>
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setEditing(false), setLookName(guide.lookName))}>
              취소
            </Button>
          </div>
        </div>
      ) : null}
      <div className="cb-row" style={{ flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" icon="refresh" onClick={() => void regenerate()} loading={busy === 'regen'}>
          다시 만들기
        </Button>
        {!editing ? (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            룩 이름 수정
          </Button>
        ) : null}
        {onDeleted ? (
          <Button size="sm" variant="ghost" icon="trash" onClick={() => setConfirm(true)}>
            삭제
          </Button>
        ) : null}
        {extraActions}
      </div>
    </div>
  );

  return (
    <>
      <VibeGuideView guide={guide} vibe={vibe} myReport={myReport} apiBase={apiBase} warning={warning} actions={actions} reportHref={reportHref} bodyAddHref={bodyAddHref} />
      <div className={s.footerBar}>
        <Button variant={guide.saved ? 'secondary' : 'primary'} icon={guide.saved ? 'check' : undefined} onClick={() => void toggleSave()} loading={busy === 'save'}>
          {guide.saved ? '저장됨' : '가이드 저장'}
        </Button>
        {newHref ? (
          <Button variant="secondary" href={newHref}>
            다른 룩 보기
          </Button>
        ) : (
          <span />
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="이 가이드를 삭제할까요?"
        description="가이드만 지워집니다. 내 퍼스널컬러 리포트와 연예인 사진 분석은 남습니다."
        items={[`${guide.celebName} · ${guide.lookName}`]}
        confirmLabel="삭제"
        cancelLabel="취소"
        danger
        loading={deleting}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await api.remove(guide.id);
            setConfirm(false);
            onDeleted?.();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setConfirm(false);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </>
  );
}
