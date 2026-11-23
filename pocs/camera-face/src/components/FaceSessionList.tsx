'use client';
/**
 * 얼굴 세션 목록 (썸네일 · 라벨 · 피부색 · 얼굴형) + 개별/전체 삭제(확인 단계).
 */
import { useState } from 'react';
import { Button, ConfirmDialog, EmptyState, Icon, MockBadge, Notice } from '@celeber/ui';
import type { FaceSessionSummary } from '../lib/api';

export interface FaceSessionListProps {
  sessions: FaceSessionSummary[];
  apiBase?: string;
  /** 상세 링크 (기본 /sessions/<id>) */
  hrefFor?: (id: string) => string;
  /** 시작 링크 (빈 상태) */
  startHref?: string;
}

export function FaceSessionList({ sessions: initial, apiBase = '', hrefFor = (id) => `/sessions/${id}`, startHref = '/capture' }: FaceSessionListProps) {
  const [sessions, setSessions] = useState(initial);
  const [target, setTarget] = useState<FaceSessionSummary | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const url = target === 'all' ? `${apiBase}/api/face/sessions?confirm=1` : `${apiBase}/api/face/sessions/${target.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (!res.ok) throw new Error(`삭제 실패 (HTTP ${res.status})`);
      setSessions((s) => (target === 'all' ? [] : s.filter((x) => x.id !== target.id)));
      setTarget(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!sessions.length) {
    return <EmptyState title="저장된 얼굴 분석이 없습니다" description="환경 → 정면 → 측면 순서로 촬영하면 여기에 저장됩니다." action={<Button href={startHref}>촬영 시작</Button>} />;
  }
  return (
    <div className="cb-stack-sm">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sessions.map((s) => (
          <li key={s.id} className="cb-row" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--cb-line)' }}>
            <a href={hrefFor(s.id)} className="cb-row" style={{ gap: 12, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
              <span className="cb-photo" style={{ width: 56, height: 72, flex: 'none' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.thumbnailUrl ? <img src={s.thumbnailUrl} alt="" /> : null}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span className="cb-row-title" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {shortLabel(s.label) ?? s.createdAt.slice(0, 16)}
                </span>
                <span className="cb-caption cb-muted" style={{ display: 'block' }}>
                  {s.status === 'complete' ? [s.skinName && `피부 ${s.skinName}`, s.shapeLabel, s.hasSide ? '측면 포함' : '정면만'].filter(Boolean).join(' · ') : s.status === 'in-progress' ? '촬영 진행 중 (완료되지 않음)' : '실패'}
                </span>
                {/* 스와치·데모 배지는 둘째 줄로 내려 제목 폭을 확보한다 (390px에서 제목이 3줄로 접히던 문제) */}
                {s.skinHex || s.isMock ? (
                  <span className="cb-row" style={{ gap: 6, marginTop: 4 }}>
                    {s.skinHex ? <span aria-label={`피부색 ${s.skinHex}`} style={{ width: 16, height: 16, borderRadius: 8, background: s.skinHex, border: '1px solid var(--cb-line)', flex: 'none' }} /> : null}
                    {s.isMock ? <MockBadge /> : null}
                  </span>
                ) : null}
              </span>
            </a>
            <button type="button" className="cb-icon-btn" aria-label={`${s.label ?? '세션'} 삭제`} onClick={() => setTarget(s)}>
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="ghost" size="sm" icon="trash" onClick={() => setTarget('all')}>
          얼굴 분석 전체 삭제
        </Button>
      </div>
      <ConfirmDialog
        open={target !== null}
        title={target === 'all' ? '얼굴 분석을 모두 삭제할까요?' : '이 얼굴 분석을 삭제할까요?'}
        description="삭제하면 되돌릴 수 없습니다. 퍼스널컬러 리포트가 이 분석을 참조하고 있다면 다시 촬영해야 합니다."
        items={target === 'all' ? [`얼굴 세션 ${sessions.length}개 (환경·정면·측면 측정값, 피부색, 윤곽)`] : target ? [`${target.label ?? target.id}: 환경·정면·측면 측정값, 피부색 ${target.skinHex ?? '-'}, 얼굴형 ${target.shapeLabel ?? '-'}`] : []}
        confirmLabel="삭제"
        danger
        loading={busy}
        onConfirm={confirm}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}

/** '11. 23. 오후 11:10 · 백열등 ·전구색 조명' → '11. 23. 오후 11:10 · 백열등' (광원 라벨의 보충 설명 제거) */
export function shortLabel(label: string | undefined): string | undefined {
  if (!label) return label;
  const parts = label.split('·').map((x) => x.trim()).filter(Boolean);
  return parts.slice(0, 2).join(' · ');
}
