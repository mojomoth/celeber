'use client';

import { DrapeThumb } from '@celeber/personal-color-report/components';
import { hexToRgb, relativeLuminance } from '@celeber/core/color';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ROUTES } from '@/lib/routes';
import { SelfAnalysisScreen } from '@/screens/03-self-analysis';
import { PersonalColorScreen } from '@/screens/04-personal-color';
import { Button, Header, PhotoTile, Screen } from '@/ui';
import { loadCurrentAnalysis } from './analysis';
import { MissingAnalysis } from './api';
import { mapPersonalColor } from './personal-color';
import { ensureCurrentReport, getReportById } from './report';
import s from './Results.module.css';

type ReadState<T> = { kind: 'pending' } | { kind: 'ready'; data: T } | { kind: 'missing'; message: string } | { kind: 'failed'; message: string };

function DataView<T>({ load, title, pending, nav, children }: {
  load: () => Promise<T>;
  title: string;
  pending: string;
  nav: 'analysis' | 'personalColor';
  children: (data: T) => ReactNode;
}) {
  const [state, setState] = useState<ReadState<T>>({ kind: 'pending' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    load().then(
      (data) => { if (active) setState({ kind: 'ready', data }); },
      (error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : '분석을 불러오지 못했어요.';
        setState({ kind: error instanceof MissingAnalysis ? 'missing' : 'failed', message });
      },
    );
    return () => { active = false; };
  }, [load, attempt]);

  if (state.kind === 'ready') return children(state.data);
  return (
    <Screen nav={nav}>
      <Header title={title} />
      <section className={s.status}>
        <p className="t-body" role={state.kind === 'failed' ? 'alert' : 'status'}>
          {state.kind === 'pending' ? pending : state.message}
        </p>
        {state.kind === 'missing' ? <Button label="촬영하기" href={ROUTES.capture} /> : null}
        {state.kind === 'failed' ? <Button label="다시 시도" onClick={() => { setState({ kind: 'pending' }); setAttempt((count) => count + 1); }} /> : null}
      </section>
    </Screen>
  );
}

export function AnalysisResults() {
  return (
    <DataView load={loadCurrentAnalysis} title="내 분석" pending="촬영 결과를 불러오는 중이에요." nav="analysis">
      {(data) => <SelfAnalysisScreen data={data} integrated />}
    </DataView>
  );
}

export function PersonalColorResults({ reportId }: { reportId?: string }) {
  const load = useCallback(() => reportId ? getReportById(reportId) : ensureCurrentReport(), [reportId]);
  return (
    <DataView key={reportId ?? 'current'} load={load} title="퍼스널컬러" pending={reportId ? '퍼스널컬러 리포트를 불러오는 중이에요.' : '피부색과 얼굴의 색 대비를 분석하는 중이에요.'} nav="personalColor">
      {(report) => (
        <PersonalColorScreen
          data={mapPersonalColor(report)}
          features={report.features.rows}
          integrated
          heroForeground={relativeLuminance(hexToRgb(report.type.accentHex)) > 0.2 ? '#17161A' : '#fff'}
          renderDrape={(drape) => {
            const { front, drapeAnchor } = report.photos;
            if (drape.photo !== front.url) {
              return <PhotoTile src={drape.photo} alt={`${drape.color.name} 적용 예시`} height={226} />;
            }
            if (drapeAnchor) {
              return <DrapeThumb src={front.url} anchor={drapeAnchor} hex={drape.color.hex} name={drape.color.name} width={226} aspect={0.86} />;
            }
            return (
              <div style={{ backgroundColor: drape.color.hex, paddingBottom: 28 }}>
                <PhotoTile src={front.url} alt={`${drape.color.name} 옆의 정면 사진`} height={198} />
              </div>
            );
          }}
        />
      )}
    </DataView>
  );
}
