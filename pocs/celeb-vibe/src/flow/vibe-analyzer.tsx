'use client';
/**
 * 이미 업로드된 사진(ImageRef) 하나를 분석한다.
 *   1) 브라우저 측정 (MediaPipe)  2) 분석 가능성 사전 판정 표시  3) 사용자가 진행 → AI/규칙 분석 → 저장
 * celeb-vibe-report는 검색된 연예인 사진을 고른 뒤 이 컴포넌트를 그대로 쓴다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Analyzability, ImageRef, VibeAnalysis } from '@celeber/core/contracts';
import { AnalyzingOverlay, Button, Card, Notice, PhotoFrame } from '@celeber/ui';
import { AnalyzabilitySummary } from '../components/analyzability';
import type { VibeMeasurement } from '../lib/measurement';
import { analyzeVibeApi, precheckVibeApi } from './api';
import { measureVibeImage } from './measure';

export interface VibeAnalyzerProps {
  image: ImageRef;
  apiBase?: string;
  celebName?: string;
  celebId?: string;
  celebImageId?: string;
  /** 사전 판정이 '분석 가능'이면 확인 없이 바로 분석 */
  autoAnalyze?: boolean;
  onComplete: (result: { analysis: VibeAnalysis; warning?: string }) => void;
  /** '다른 사진 선택' (분석 불가 시 같은 인물의 다른 사진 고르기 등) */
  onPickAnother?: () => void;
  /** 사전 판정 결과 알림 (리포트에서 대체 사진 안내에 사용) */
  onPrecheck?: (a: Analyzability) => void;
}

type Phase = { kind: 'measuring'; step: string } | { kind: 'prechecked'; a: Analyzability; measured: boolean; dropped: boolean } | { kind: 'analyzing' } | { kind: 'error'; message: string };

export function VibeAnalyzer({ image, apiBase = '', celebName, celebId, celebImageId, autoAnalyze, onComplete, onPickAnother, onPrecheck }: VibeAnalyzerProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'measuring', step: '사진 불러오는 중' });
  const [measureNote, setMeasureNote] = useState<string | null>(null);
  const measurementRef = useRef<VibeMeasurement | undefined>(undefined);
  const startedFor = useRef<string | null>(null);
  const src = `${apiBase}${image.url}`;

  const analyze = useCallback(
    async (force: boolean) => {
      setPhase({ kind: 'analyzing' });
      try {
        const r = await analyzeVibeApi({ uploadId: image.uploadId, celebName, celebId, celebImageId, measurement: measurementRef.current, force }, apiBase);
        onComplete(r);
      } catch (e) {
        setPhase({ kind: 'error', message: (e as Error).message });
      }
    },
    [apiBase, celebId, celebImageId, celebName, image.uploadId, onComplete],
  );

  const run = useCallback(async () => {
    setPhase({ kind: 'measuring', step: '사진 불러오는 중' });
    let m: VibeMeasurement | undefined;
    try {
      m = await measureVibeImage(src, (step) => setPhase({ kind: 'measuring', step }));
      setMeasureNote(m.notes.length ? m.notes.join(' / ') : null);
    } catch (e) {
      setMeasureNote(`브라우저 측정을 하지 못해 사진 통계로만 판정합니다: ${(e as Error).message}`);
    }
    measurementRef.current = m;
    try {
      setPhase({ kind: 'measuring', step: '분석 가능 여부 판정 중' });
      const r = await precheckVibeApi(image.uploadId, m, apiBase);
      onPrecheck?.(r.analyzability);
      if (autoAnalyze && r.analyzability.analyzable) {
        await analyze(false);
        return;
      }
      setPhase({ kind: 'prechecked', a: r.analyzability, measured: r.measured, dropped: !!r.measurementDropped });
    } catch (e) {
      setPhase({ kind: 'error', message: (e as Error).message });
    }
  }, [analyze, apiBase, autoAnalyze, image.uploadId, onPrecheck, src]);

  useEffect(() => {
    if (startedFor.current === image.uploadId) return;
    startedFor.current = image.uploadId;
    void run();
  }, [image.uploadId, run]);

  const aspect = image.width && image.height ? `${image.width} / ${image.height}` : '3 / 4';
  const busy = phase.kind === 'measuring' || phase.kind === 'analyzing';

  return (
    <div className="cb-stack">
      <div style={{ position: 'relative' }}>
        <PhotoFrame src={src} alt={celebName ? `${celebName} 사진` : '선택한 사진'} label={celebName || '선택한 사진'} aspect={aspect} />
        {busy ? (
          <AnalyzingOverlay
            message={phase.kind === 'analyzing' ? '코디·퍼스널컬러·분위기 분석 중' : phase.step}
            sub={phase.kind === 'analyzing' ? 'AI 분석은 30초 이상 걸릴 수 있습니다' : '사진은 이 기기에서 먼저 측정합니다'}
          />
        ) : null}
      </div>

      {phase.kind === 'prechecked' ? (
        <Card>
          <h2 className="cb-row-title" style={{ marginBottom: 8 }}>
            분석 가능 여부
          </h2>
          <AnalyzabilitySummary analyzability={phase.a} compact />
          {!phase.measured && !phase.dropped ? (
            <p className="cb-caption cb-muted" style={{ marginTop: 8 }}>
              브라우저 측정 없이 사진 통계로만 판정했습니다. 퍼스널컬러는 참고용입니다.
            </p>
          ) : null}
          <div className="cb-stack-sm" style={{ marginTop: 16 }}>
            {phase.a.analyzable ? (
              <Button block onClick={() => void analyze(false)}>
                추구미 분석하기
              </Button>
            ) : (
              <>
                {onPickAnother ? (
                  <Button block onClick={onPickAnother} icon="image">
                    다른 사진 고르기
                  </Button>
                ) : null}
                <Button block variant="secondary" onClick={() => void analyze(true)}>
                  {phase.a.personCount > 1 ? '가장 큰 인물 기준으로 분석' : '그래도 분석하기'}
                </Button>
              </>
            )}
            {phase.a.analyzable && onPickAnother ? (
              <Button block variant="ghost" onClick={onPickAnother}>
                다른 사진 고르기
              </Button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {measureNote && phase.kind !== 'measuring' ? <p className="cb-caption cb-muted">측정 참고: {measureNote}</p> : null}

      {phase.kind === 'error' ? (
        <Notice tone="danger" title="분석하지 못했습니다">
          <p className="cb-body" style={{ margin: '0 0 8px' }}>
            {phase.message}
          </p>
          <div className="cb-row">
            <Button size="sm" variant="secondary" icon="refresh" onClick={() => void run()}>
              다시 시도
            </Button>
            {onPickAnother ? (
              <Button size="sm" variant="ghost" onClick={onPickAnother}>
                다른 사진
              </Button>
            ) : null}
          </div>
        </Notice>
      ) : null}
    </div>
  );
}
