/**
 * 환경 분석 요약: 광원 · 색온도 · 밝기 · 실내/실외 · 조명 품질 + 경고(재촬영 안내) + 근거.
 */
import type { EnvironmentAnalysis } from '@celeber/core/contracts';
import { Notice, ReportRow, ReportTable, Swatch } from '@celeber/ui';

export function EnvironmentSummary({ environment: e, showEvidence = true }: { environment: EnvironmentAnalysis; showEvidence?: boolean }) {
  const problems = e.warnings.filter((w) => w.severity !== 'info');
  const evidence = e.warnings.filter((w) => w.severity === 'info');
  return (
    <div className="cb-stack">
      <ReportTable>
        <ReportRow icon="bulb" label="광원" value={e.lightSourceLabel} />
        <ReportRow icon="sun" label="색온도" value={`${e.cctK.toLocaleString('ko-KR')}K`} note={`추정 신뢰도 ${Math.round(e.cctConfidence * 100)}%`} />
        <ReportRow icon="value" label="밝기" value={e.brightness.label} note={`중앙값 ${e.brightness.medianLuma ?? Math.round(e.brightness.meanLuma)}/255`} />
        <ReportRow icon="image" label="장소" value={e.settingLabel} note={`판단 신뢰도 ${Math.round(e.settingConfidence * 100)}%`} />
        <ReportRow icon="check-circle" label="조명 품질" value={`${Math.round(e.lightingQuality * 100)}점`} note={e.retakeRecommended ? '재촬영 권장' : problems.length ? '촬영 가능 · 주의' : '촬영하기 좋은 조명'} />
      </ReportTable>
      {e.referenceWhite ? (
        <div className="cb-row" style={{ gap: 12 }}>
          <Swatch hex={e.referenceWhite.hex} size={36} />
          <span className="cb-caption cb-muted">흰 종이 기준 백색 {e.referenceWhite.hex} — 피부색 보정에 이 값을 씁니다.</span>
        </div>
      ) : null}
      {problems.map((w) => (
        <Notice key={w.code + w.message} tone={w.severity === 'error' ? 'danger' : 'warn'}>
          {w.message}
        </Notice>
      ))}
      {e.aiNotes ? (
        <Notice tone="info" title="AI 보조 관찰">
          {e.aiNotes}
        </Notice>
      ) : null}
      {showEvidence && evidence.length ? (
        <ul className="cb-list cb-caption cb-muted" aria-label="판정 근거">
          {evidence.map((w) => (
            <li key={w.code + w.message}>{w.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
