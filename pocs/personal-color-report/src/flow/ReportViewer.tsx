'use client';
/**
 * 저장된 리포트 다시보기 (상태 보유): 성별/스타일 변형 변경(PATCH 저장) + 삭제(확인 단계).
 * 다른 앱: import { ReportViewer } from '@celeber/personal-color-report/flow'
 */
import { type ReactNode, useCallback, useState } from 'react';
import type { Gender, PersonalColorReport } from '@celeber/core/contracts';
import { Button, ConfirmDialog, Notice } from '@celeber/ui';
import { PersonalColorReportView } from '../components/PersonalColorReportView';

export interface ReportViewerProps {
  report: PersonalColorReport;
  apiBase?: string;
  warning?: string;
  bodyAddHref?: string;
  /** 삭제 후 호출 (없으면 삭제 버튼 숨김) */
  onDeleted?: () => void;
  /** 하단 추가 동작 */
  extraActions?: ReactNode;
}

export function ReportViewer({ report: initial, apiBase = '', warning, bodyAddHref, onDeleted, extraActions }: ReportViewerProps) {
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const changeGender = useCallback(
    async (gender: Gender) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/api/report/reports/${encodeURIComponent(report.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ gender }) });
        if (!res.ok) throw new Error(`저장하지 못했습니다 (${res.status})`);
        setReport((await res.json()) as PersonalColorReport);
      } catch (e) {
        setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
      } finally {
        setBusy(false);
      }
    },
    [apiBase, report.id],
  );

  const remove = useCallback(async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${apiBase}/api/report/reports/${encodeURIComponent(report.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`삭제하지 못했습니다 (${res.status})`);
      setConfirm(false);
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제하지 못했습니다.');
      setDeleting(false);
      setConfirm(false);
    }
  }, [apiBase, report.id, onDeleted]);

  return (
    <>
      <PersonalColorReportView
        report={report}
        warning={warning}
        onGenderChange={changeGender}
        genderBusy={busy}
        bodyAddHref={bodyAddHref}
        actions={
          <div className="cb-stack-sm">
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {extraActions}
            {onDeleted ? (
              <Button variant="danger" block icon="trash" onClick={() => setConfirm(true)}>
                이 리포트 삭제
              </Button>
            ) : null}
          </div>
        }
      />
      <ConfirmDialog
        open={confirm}
        danger
        title="이 리포트를 삭제할까요?"
        description="삭제한 리포트는 되돌릴 수 없습니다. 얼굴·전신 분석과 사진은 남습니다."
        items={[`${report.type.nameKo} 리포트 (${new Date(report.createdAt).toLocaleString('ko-KR')})`]}
        confirmLabel="삭제"
        loading={deleting}
        onConfirm={remove}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}
