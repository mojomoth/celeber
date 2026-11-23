'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { VibeAnalysis } from '@celeber/core/contracts';
import { Button, ConfirmDialog, Notice } from '@celeber/ui';
import { VibeResultView } from '../../src/components';
import { deleteVibeApi, patchVibeApi, reanalyzeVibeApi } from '../../src/flow';
import { editPatch } from '../../src/lib/summary';

/** 상세: 결과 뷰 + 이름 수정 / 다시 분석 / 삭제 */
export function DetailClient({ initial, warning: initialWarning, aiAvailable }: { initial: VibeAnalysis; warning?: string; aiAvailable: boolean }) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [warning, setWarning] = useState(initialWarning);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.celebName ?? '');
  const [look, setLook] = useState(initial.lookName);
  const [busy, setBusy] = useState<null | 'save' | 'reanalyze' | 'delete'>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actions = (
    <div className="cb-stack-sm">
      {editing ? (
        <form
          className="cb-stack-sm"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy('save');
            try {
              const patch = editPatch(a, { celebName: name, lookName: look });
              if (Object.keys(patch).length) setA(await patchVibeApi(a.id, patch));
              setEditing(false);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(null);
            }
          }}
        >
          <label className="cb-caption">
            인물 이름 (기록용)
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={inputStyle} />
          </label>
          <label className="cb-caption">
            룩 이름
            <input value={look} onChange={(e) => setLook(e.target.value)} maxLength={40} required style={inputStyle} />
          </label>
          <div className="cb-row">
            <Button type="submit" size="sm" loading={busy === 'save'}>
              저장
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              취소
            </Button>
          </div>
        </form>
      ) : (
        <div className="cb-row" style={{ flexWrap: 'wrap' }}>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => {
              // 다시 분석으로 바뀐 현재 값에서 시작한다
              setName(a.celebName ?? '');
              setLook(a.lookName);
              setEditing(true);
            }}
          >
            이름 수정
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="refresh"
            loading={busy === 'reanalyze'}
            disabled={busy !== null && busy !== 'reanalyze'}
            title={aiAvailable ? '저장된 측정값으로 AI 분석을 다시 실행합니다' : 'AI 키가 없으면 같은 데모 결과가 나옵니다'}
            onClick={async () => {
              setBusy('reanalyze');
              setError(null);
              try {
                const r = await reanalyzeVibeApi(a.id);
                setA(r.analysis);
                setWarning(r.warning);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(null);
              }
            }}
          >
            다시 분석
          </Button>
          <Button size="sm" variant="ghost" icon="trash" disabled={busy === 'reanalyze'} title={busy === 'reanalyze' ? '다시 분석이 끝난 뒤 삭제할 수 있습니다' : undefined} onClick={() => setConfirmDelete(true)}>
            삭제
          </Button>
        </div>
      )}
      {error ? (
        <Notice tone="danger" title="요청을 처리하지 못했습니다">
          {error}
        </Notice>
      ) : null}
    </div>
  );

  return (
    <>
      <VibeResultView analysis={a} warning={warning} actions={actions} />
      <ConfirmDialog
        open={confirmDelete}
        danger
        loading={busy === 'delete'}
        title="이 분석을 삭제할까요?"
        items={[`${a.celebName ?? '이름 없음'} · ${a.lookName}`, '코디·퍼스널컬러·분위기 분석 결과']}
        confirmLabel="삭제"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setBusy('delete');
          try {
            await deleteVibeApi(a.id);
            router.push('/analyses');
            router.refresh();
          } catch (err) {
            setError((err as Error).message);
            setBusy(null);
            setConfirmDelete(false);
          }
        }}
      />
    </>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  marginTop: 4,
  height: 44,
  borderRadius: 12,
  border: '1px solid var(--cb-line)',
  padding: '0 12px',
  font: 'inherit',
  fontSize: 16,
  background: 'var(--cb-card)',
  color: 'var(--cb-ink)',
} as const;
