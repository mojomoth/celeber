/**
 * 전신 비율 결과 뷰: 사진 → 관찰한 특징(비율·체형·자세·코디) → 적용할 변화(코디 제안) 순서.
 * 상태 없음(사진 패널만 클라이언트). 건너뜀 상태면 '전신 사진 추가' 자리표시를 보여준다.
 * 측정 실패 기록은 사진과 실패 사유만 보여 준다(잘린 사진에서 나온 눈금·체형 점수는 근거가 없다).
 */
import { BODY_FRAME_LABEL_KO, type BodyAnalysis } from '@celeber/core/contracts';
import { Button, Card, CheckList, Chips, EmptyState, MockBadge, Notice, ReportRow, ReportTable, SectionHeader } from '@celeber/ui';
import type { ReactNode } from 'react';
import { buildStylingGuide, formatRatio } from '../lib/interpret';
import { outfitSourceLabel, safeHex } from '../lib/outfit';
import { bodyIssues } from '../lib/summary';
import type { OutfitMeta } from '../lib/types';
import { BodyPhotoPanel } from './BodyPhotoPanel';
import { ProportionDiagram, RatioBars, SilhouetteDiagram } from './RatioViz';

/** 건너뛴 상태: 후행 리포트의 '전신 사진 추가' 자리 */
export function BodyAddPlaceholder({ href, onAdd, description }: { href?: string; onAdd?: () => void; description?: ReactNode }) {
  return (
    <Card tone="paper">
      <EmptyState
        title="전신 사진 추가"
        description={description ?? '전신 사진을 추가하면 등신, 상·하체, 어깨·골반 비율과 체형에 맞는 코디 제안을 함께 볼 수 있습니다.'}
        action={href ? <Button href={href} icon="body" variant="secondary">전신 사진 추가</Button> : onAdd ? <Button onClick={onAdd} icon="body" variant="secondary">전신 사진 추가</Button> : undefined}
      />
    </Card>
  );
}

const ISSUE_TONE = (s?: string) => (s === 'error' ? 'danger' : s === 'info' ? 'info' : 'warn') as 'danger' | 'info' | 'warn';

/** 측정 실패/주의 사유 목록 */
export function BodyIssues({ analysis }: { analysis: BodyAnalysis }) {
  const issues = bodyIssues(analysis);
  if (!issues.length) return null;
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity !== 'error');
  return (
    <div className="cb-stack-sm">
      {errors.length ? (
        <Notice tone="danger" title="측정할 수 없는 이유">
          <ul className="cb-list">
            {errors.map((e) => (
              <li key={e.code}>{e.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {warns.length ? (
        <Notice tone={ISSUE_TONE(warns[0].severity)} title="정확도에 영향을 주는 조건">
          <ul className="cb-list">
            {warns.map((e) => (
              <li key={e.code}>{e.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}

export interface BodyResultViewProps {
  analysis: BodyAnalysis;
  outfit?: OutfitMeta | null;
  apiBase?: string;
  /** 건너뜀 상태에서 '전신 사진 추가' 링크 */
  addHref?: string;
  onAdd?: () => void;
  /** 섹션 축약 (리포트 내 임베드용): 사진+요약+비율 막대만 */
  compact?: boolean;
}

export function BodyResultView({ analysis: a, outfit, apiBase = '', addHref, onAdd, compact }: BodyResultViewProps) {
  if (a.status === 'skipped') return <BodyAddPlaceholder href={addHref} onAdd={onAdd} />;
  if (a.status === 'failed') {
    return (
      <div className="cb-stack">
        {a.image ? <BodyPhotoPanel analysis={a} apiBase={apiBase} label="측정하지 못한 사진" showOverlay={false} showTabs={false} /> : null}
        <BodyIssues analysis={a} />
      </div>
    );
  }
  const r = a.ratios;
  const guide = r ? buildStylingGuide(r, a.frame?.type) : null;

  return (
    <div className="cb-stack">
      {a.image ? <BodyPhotoPanel analysis={a} apiBase={apiBase} label={a.isMock ? '데모 도식' : '전신 사진'} showTabs={!compact} /> : null}

      {a.isMock ? (
        <div className="cb-row" style={{ gap: 8 }}>
          <MockBadge />
          <span className="cb-caption cb-muted">도식 그림과 합성 관절점으로 만든 데모 결과입니다.</span>
        </div>
      ) : null}

      {r ? (
        <Card>
          <div className="cb-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div className="cb-caption cb-muted">키 대비 머리 비율</div>
              <div style={{ fontSize: 32, lineHeight: '39px', fontWeight: 800 }}>{formatRatio('headsTall', r.headsTall)}</div>
            </div>
            {a.frame ? (
              <div style={{ textAlign: 'right' }}>
                <div className="cb-caption cb-muted">체형</div>
                <div className="cb-row-title">{a.frame.label}</div>
              </div>
            ) : null}
          </div>
          <div style={{ marginTop: 12 }}>
            <Chips items={[`상·하체 ${formatRatio('upperToLower', r.upperToLower)}`, `다리 ${formatRatio('legToHeight', r.legToHeight)}`, `어깨/골반 ${r.shoulderToHip.toFixed(2)}`]} />
          </div>
        </Card>
      ) : null}

      <BodyIssues analysis={a} />

      {r ? (
        <section className="cb-section">
          <SectionHeader title="비율" subtitle="정수리~발바닥을 1로 보고 구간별 길이를 잽니다." />
          {!compact ? <ProportionDiagram analysis={a} /> : null}
          <RatioBars analysis={a} />
        </section>
      ) : null}

      {!compact && (a.frame || a.silhouette) ? (
        <section className="cb-section">
          <SectionHeader title="체형" subtitle="어깨·허리·골반 실루엣 폭으로 분류합니다." />
          <SilhouetteDiagram analysis={a} />
          {a.frame ? (
            <ul className="cb-list cb-body" style={{ marginTop: 8 }}>
              {a.frame.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
          {a.skeleton ? (
            <div style={{ marginTop: 12 }}>
              <ReportTable>
                <ReportRow icon="body" label="골격 참고 분류" value={`${a.skeleton.label} (신뢰도 ${Math.round(a.skeleton.confidence * 100)}%)`} note={a.skeleton.evidence.join(' ')} />
              </ReportTable>
            </div>
          ) : null}
        </section>
      ) : null}

      {!compact && a.posture ? (
        <section className="cb-section">
          <SectionHeader title="자세" subtitle="기울기가 크면 비율이 달라집니다." />
          <ReportTable>
            <ReportRow label="어깨 기울기" value={`${Math.abs(a.posture.shoulderTiltDeg).toFixed(1)}°`} note={Math.abs(a.posture.shoulderTiltDeg) > 4 ? '기울어짐' : '수평에 가까움'} />
            <ReportRow label="골반 기울기" value={`${Math.abs(a.posture.hipTiltDeg).toFixed(1)}°`} note={Math.abs(a.posture.hipTiltDeg) > 4 ? '기울어짐' : '수평에 가까움'} />
            <ReportRow label="몸통 기울기" value={`${Math.abs(a.posture.leanDeg).toFixed(1)}°`} note={Math.abs(a.posture.leanDeg) > 5 ? '수직에서 벗어남' : '곧게 섬'} />
          </ReportTable>
        </section>
      ) : null}

      {!compact && (a.outfitDescription || outfit) ? (
        <section className="cb-section">
          <SectionHeader title="현재 코디" right={outfit?.source === 'mock' || a.isMock ? <MockBadge /> : undefined} subtitle={outfitSourceLabel(outfit)} />
          {outfit?.warning ? <Notice tone="warn">{outfit.warning}</Notice> : null}
          {a.outfitDescription ? <p className="cb-body" style={{ marginTop: 8 }}>{outfit?.detail?.summary ?? a.outfitDescription}</p> : null}
          {outfit?.detail?.items.length ? (
            <div style={{ marginTop: 8 }}>
              <ReportTable>
                {outfit.detail.items.map((it, i) => {
                  const measuredColor = it.category === '상의' ? outfit.colors.top : it.category === '하의' ? outfit.colors.bottom : undefined;
                  const measuredHex = safeHex(measuredColor?.hex);
                  return (
                    <ReportRow
                      key={`${it.name}-${i}`}
                      label={it.category}
                      value={
                        <span className="cb-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                          {measuredHex ? <span aria-hidden style={{ width: 14, height: 14, borderRadius: 7, background: measuredHex, border: '1px solid rgba(37,34,43,0.2)' }} /> : null}
                          {it.colorName} {it.name !== it.category ? it.name : ''}
                        </span>
                      }
                    />
                  );
                })}
                {outfit.detail.accessories.length ? <ReportRow label="액세서리" value={outfit.detail.accessories.join(', ')} /> : null}
              </ReportTable>
            </div>
          ) : null}
          {outfit?.detail?.silhouetteNote ? <p className="cb-caption cb-muted" style={{ marginTop: 6 }}>{outfit.detail.silhouetteNote}</p> : null}
        </section>
      ) : null}

      {guide && guide.suggestions.length ? (
        <section className="cb-section">
          <SectionHeader title="적용할 변화" subtitle={a.frame ? `${BODY_FRAME_LABEL_KO[a.frame.type]} · ${formatRatio('headsTall', r!.headsTall)} 기준 코디 제안` : undefined} />
          <CheckList items={guide.suggestions.map((s) => (
            <span key={s.title}>
              <strong>{s.title}</strong> {s.detail}
            </span>
          ))} />
          {guide.avoid.length ? (
            <div style={{ marginTop: 12 }}>
              <div className="cb-caption cb-muted" style={{ fontWeight: 700 }}>
                피하면 좋은 것
              </div>
              <Chips items={guide.avoid} />
            </div>
          ) : null}
        </section>
      ) : null}

      {!compact && a.status === 'complete' ? (
        <p className="cb-caption cb-muted">
          카메라 높이, 렌즈 왜곡, 신발 굽, 옷 부피, 헤어 볼륨에 따라 수치가 달라집니다. 허리 높이에서 수평으로, 몸에 붙는 옷을 입고 찍으면 가장 정확합니다. 의학적 체형 진단이 아닌 스타일 참고용입니다.
        </p>
      ) : null}
    </div>
  );
}
