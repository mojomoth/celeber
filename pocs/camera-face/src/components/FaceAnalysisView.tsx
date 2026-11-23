'use client';
/**
 * FaceAnalysis 결과 뷰 (사진 → 관찰한 특징 → 적용할 변화).
 * 후행 PoC가 "@celeber/camera-face/components"로 그대로 쓸 수 있다.
 */
import { useState, type ReactNode } from 'react';
import type { FaceAnalysis, SkinColorMeasurement } from '@celeber/core/contracts';
import { ITA_CATEGORY_LABEL_KO } from '@celeber/core/color';
import { AxisBars, Card, CheckList, EmptyState, Gauge, Icon, MockBadge, Notice, ReportRow, ReportTable, SectionHeader, Swatch, SwatchRow, Tabs } from '@celeber/ui';
import { lowConfidenceReasons, profileEmptyMessage } from '../lib/analysis';
import { AnnotatedPhoto } from './AnnotatedPhoto';
import { EnvironmentSummary } from './EnvironmentSummary';

export const WB_METHOD_LABEL_KO: Record<SkinColorMeasurement['whiteBalance']['method'], string> = {
  none: '보정 없음',
  'gray-world': '장면 평균(gray-world)',
  'reference-white': '흰 종이 기준',
  cct: '색온도 기준',
  combined: '환경 사진 + 얼굴 배경 평균',
};
const REGION_LABEL_KO: Record<string, string> = { forehead: '이마', leftCheek: '왼쪽 볼', rightCheek: '오른쪽 볼', nose: '코', chin: '턱' };
const fmtLab = (l: { l: number; a: number; b: number }) => `L* ${l.l.toFixed(1)} · a* ${l.a.toFixed(1)} · b* ${l.b.toFixed(1)}`;
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;

export interface FaceAnalysisViewProps {
  analysis: FaceAnalysis;
  /** API 응답의 AI 폴백 경고 */
  aiWarning?: string;
  /** '다음 단계' 카드에 넣을 버튼 등 */
  actions?: ReactNode;
}

export function FaceAnalysisView({ analysis: a, aiWarning, actions }: FaceAnalysisViewProps) {
  const [overlay, setOverlay] = useState<'lines' | 'photo'>('lines');
  const s = a.skin;
  const g = a.geometry;
  const fc = a.featureColors;
  const pr = g.profile;
  const fw = a.front.image.width ?? 900;
  const fh = a.front.image.height ?? 1200;
  const problems = a.warnings.filter((w) => w.severity !== 'info');
  const lowReasons = lowConfidenceReasons(a);
  // 측면·환경 칸은 한 줄에 놓이므로, 사진이 없는 칸은 옆 사진 비율을 따라 높이를 맞춘다.
  const ratioOf = (img?: { width?: number; height?: number } | null) => (img?.width && img?.height ? `${img.width} / ${img.height}` : null);
  const pairRatio = ratioOf(a.side?.image) ?? ratioOf(a.environment.image) ?? '3 / 4';
  const topShapes = Object.entries(g.shapeScores)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4);
  const shapeLabel = (k: string) => ({ oval: '계란형', round: '둥근형', square: '각진형', oblong: '긴형', heart: '하트형', diamond: '다이아몬드형', triangle: '삼각형' })[k] ?? k;
  const featureSwatches = [
    fc.hair && { hex: fc.hair.hex, name: '헤어', caption: fc.hair.nameKo },
    fc.eyes && { hex: fc.eyes.hex, name: '눈동자', caption: fc.eyes.nameKo },
    fc.brows && { hex: fc.brows.hex, name: '눈썹', caption: fc.brows.nameKo },
    fc.lips && { hex: fc.lips.hex, name: '입술', caption: fc.lips.nameKo },
  ].filter(Boolean) as { hex: string; name: string; caption: string }[];
  const nextSteps: string[] = [];
  if (a.environment.retakeRecommended) nextSteps.push('조명 경고가 있습니다. 창을 마주 보는 자연광에서 다시 촬영하면 피부색이 더 정확해집니다.');
  if (!a.environment.referenceWhite) nextSteps.push('흰 종이를 얼굴 옆에 두고 환경을 촬영한 뒤 종이를 눌러 기준 백색을 지정하면 보정 정확도가 올라갑니다.');
  if (!pr) nextSteps.push(a.side ? '고개를 60° 정도 돌린 측면 사진으로 다시 찍으면 이마–코–입–턱 옆선과 E-라인을 확인할 수 있습니다.' : '측면 사진을 추가하면 이마–코–입–턱 옆선과 E-라인을 확인할 수 있습니다.');
  nextSteps.push(`보정 후 피부색 ${s.corrected.hex}(${s.corrected.nameKo})를 퍼스널컬러 리포트의 입력으로 사용합니다.`);

  return (
    <div className="cb-stack" style={{ gap: 'var(--cb-s5)' }}>
      {lowReasons.length ? (
        <Notice tone="warn" title="신뢰도가 낮은 결과">
          {lowReasons.join(' · ')}. 밝은 정면 사진으로 다시 촬영하면 정확해집니다.
        </Notice>
      ) : null}
      {/* 사진 */}
      <section className="cb-stack-sm">
        <SectionHeader title="촬영한 사진" right={<Tabs label="오버레이" items={[{ value: 'lines', label: '윤곽선' }, { value: 'photo', label: '사진만' }]} value={overlay} onChange={setOverlay} />} />
        <AnnotatedPhoto
          src={a.front.image.url}
          width={fw}
          height={fh}
          alt="정면 사진과 얼굴 윤곽선"
          label="정면"
          contour={overlay === 'lines' ? g.contour : null}
          features={overlay === 'lines' ? (g.featureOutlines ?? null) : null}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cb-s2)' }}>
          {a.side ? (
            <AnnotatedPhoto src={a.side.image.url} width={a.side.image.width ?? 900} height={a.side.image.height ?? 1200} alt="측면 사진과 옆선" label="측면" profile={overlay === 'lines' ? (pr ?? null) : null} />
          ) : (
            <div className="cb-photo" style={{ aspectRatio: pairRatio, display: 'grid', placeItems: 'center' }}>
              <span className="cb-caption cb-muted">측면 없음</span>
            </div>
          )}
          {a.environment.image ? (
            <AnnotatedPhoto src={a.environment.image.url} width={a.environment.image.width ?? 900} height={a.environment.image.height ?? 1200} alt="환경 사진" label="환경" />
          ) : (
            <div className="cb-photo" style={{ aspectRatio: pairRatio, display: 'grid', placeItems: 'center', padding: 12, textAlign: 'center' }}>
              <span className="cb-caption cb-muted">환경은 얼굴 사진 배경으로 추정</span>
            </div>
          )}
        </div>
      </section>

      {/* ① 피부색 */}
      <Card>
        <SectionHeader no={1} title="피부색" subtitle={`ROI ${s.regions.length}곳 · ${s.sampleCount.toLocaleString('ko-KR')}px · 하위 ${Math.round(s.trim.lowPct * 100)}%/상위 ${Math.round(s.trim.highPct * 100)}% 밝기 컷`} />
        <div className="cb-row" style={{ justifyContent: 'center', gap: 16, margin: '8px 0 16px' }}>
          <Swatch hex={s.raw.hex} size={72} name="보정 전" showHex />
          <Icon name="chevron-right" size={22} aria-hidden="true" />
          <Swatch hex={s.corrected.hex} size={72} name="보정 후" showHex selected />
        </div>
        <p className="cb-body" style={{ textAlign: 'center', margin: '0 0 12px' }}>
          <strong>{s.corrected.nameKo}</strong> · ITA {Math.round(s.corrected.ita)}° ({ITA_CATEGORY_LABEL_KO[s.corrected.itaCategory]})
        </p>
        <ReportTable>
          <ReportRow label="sRGB" value={`${s.corrected.hex}`} note={`R ${s.corrected.rgb.r} · G ${s.corrected.rgb.g} · B ${s.corrected.rgb.b} (보정 전 ${s.raw.hex})`} />
          <ReportRow label="CIELAB" value={fmtLab(s.corrected.lab)} note={`보정 전 ${fmtLab(s.raw.lab)}`} />
          <ReportRow label="ITA°" value={`${s.corrected.ita.toFixed(1)}°`} note={`${ITA_CATEGORY_LABEL_KO[s.corrected.itaCategory]} (보정 전 ${s.raw.ita.toFixed(1)}°)`} />
          <ReportRow label="색상각 h" value={`${s.corrected.lch.h.toFixed(1)}°`} note="낮을수록 붉은 기, 높을수록 노란 기" />
          <ReportRow label="채도 C*" value={s.corrected.lch.c.toFixed(1)} note="높을수록 선명한 피부색" />
          <ReportRow label="보정" value={WB_METHOD_LABEL_KO[s.whiteBalance.method]} note={`게인 R ${s.whiteBalance.gains.r.toFixed(3)} · B ${s.whiteBalance.gains.b.toFixed(3)} · 강도 ${s.whiteBalance.strength} · 보정량 ΔE ${s.whiteBalance.deltaE}`} />
        </ReportTable>
        <h3 className="cb-row-title" style={{ marginTop: 16 }}>부위별 측정</h3>
        <ReportTable>
          {s.regions.map((r) => (
            <ReportRow
              key={r.region}
              label={
                <span className="cb-row" style={{ gap: 8 }}>
                  <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 9, background: r.corrected.hex, border: '1px solid var(--cb-line)', flex: 'none' }} />
                  {REGION_LABEL_KO[r.region] ?? r.region}
                </span>
              }
              value={r.corrected.hex}
              note={`${fmtLab(r.corrected.lab)} · ${r.pixelCount.toLocaleString('ko-KR')}px`}
            />
          ))}
        </ReportTable>
        <p className="cb-caption cb-muted" style={{ marginTop: 8 }}>
          부위 간 색 차이 ΔE2000 {s.regionSpreadDeltaE} (2 이하 매우 균일 · 6 이상이면 조명이 고르지 않음)
        </p>
        <div className="cb-row" style={{ gap: 16, marginTop: 16, alignItems: 'flex-start' }}>
          <Gauge value={s.confidence * 100} label="측정 신뢰도" size={88} />
          <ul className="cb-list cb-caption" style={{ marginTop: 0, flex: 1 }}>
            {s.confidenceReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      </Card>

      {/* ② 부위 색 */}
      <Card>
        <SectionHeader no={2} title="헤어 · 눈 · 입술 색" subtitle="퍼스널컬러 대비감 계산에 쓰입니다" />
        {featureSwatches.length ? <SwatchRow items={featureSwatches} size={52} columns={4} showHex /> : <p className="cb-body cb-muted">측정된 부위 색이 없습니다.</p>}
        <ul className="cb-list cb-caption cb-muted">
          {fc.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Card>

      {/* ③ 얼굴형 */}
      <Card>
        <SectionHeader no={3} title="얼굴 윤곽" subtitle="정면 랜드마크 비율 기반 (경험값 기준)" />
        <p className="cb-section-title" style={{ margin: '4px 0 12px' }}>
          {g.shapeLabel}
        </p>
        <AxisBars axes={topShapes.map(([k, v]) => ({ key: k, label: shapeLabel(k), value: Math.round(v * 100) }))} />
        <ul className="cb-list cb-caption" style={{ marginTop: 12 }}>
          {g.shapeEvidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
        <h3 className="cb-row-title" style={{ marginTop: 16 }}>이목구비 비율</h3>
        <ReportTable>
          {g.interpretations.map((i) => (
            <ReportRow key={i.key} label={i.label} value={i.value} note={i.comment} />
          ))}
        </ReportTable>
      </Card>

      {/* ④ 측면 */}
      <Card>
        <SectionHeader no={4} title="측면 옆선" subtitle="이마–코–입–턱 라인과 E-라인(코끝–턱끝)" />
        {pr ? (
          <>
            <ReportTable>
              <ReportRow label="옆선 형태" value={pr.convexityLabel} />
              {pr.eLine ? <ReportRow label="E-라인" value={pr.eLine.label} note={`윗입술 ${pct(pr.eLine.upperLipOffset)} · 아랫입술 ${pct(pr.eLine.lowerLipOffset)} (얼굴 길이 대비, + = 라인 앞)`} /> : null}
              {pr.noseProjection !== undefined ? <ReportRow label="코 돌출" value={`얼굴 길이의 ${(pr.noseProjection * 100).toFixed(1)}%`} note="비근(콧대 시작)에서 코끝까지 앞쪽 거리" /> : null}
            </ReportTable>
            <ul className="cb-list cb-caption cb-muted">
              {pr.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </>
        ) : (
          <EmptyState title="옆선 분석 없음" description={profileEmptyMessage(a)} />
        )}
      </Card>

      {/* ⑤ 환경 */}
      <Card>
        <SectionHeader no={5} title="촬영 환경" subtitle={a.environment.image ? '환경 사진 분석' : '얼굴 사진 배경으로 추정'} />
        <EnvironmentSummary environment={a.environment} />
      </Card>

      {/* ⑥ 서술 */}
      {a.ai ? (
        <Card>
          <SectionHeader no={6} title={a.source === 'hybrid' ? 'AI 관찰 서술' : '측정값 기반 서술'} right={a.isMock ? <MockBadge /> : null} />
          {aiWarning ? <Notice tone="warn">{aiWarning}</Notice> : null}
          <ReportTable>
            <ReportRow icon="hair" label="헤어스타일" value={a.ai.hairStyle} />
            <ReportRow icon="hair" label="헤어 색" value={a.ai.hairColorDescription} />
            <ReportRow icon="keyword" label="인상" value={a.ai.impression} />
            {a.ai.environmentNotes ? <ReportRow icon="sun" label="조명 영향" value={a.ai.environmentNotes} /> : null}
          </ReportTable>
          {a.ai.features.length ? (
            <div style={{ marginTop: 12 }}>
              <CheckList items={a.ai.features} />
            </div>
          ) : null}
          <p className="cb-caption cb-muted" style={{ marginTop: 8 }}>
            얼굴로 신원을 판단하지 않으며, 사진에서 보이는 특징만 서술합니다.
          </p>
        </Card>
      ) : null}

      {/* 적용할 변화 */}
      <Card tone="paper">
        <SectionHeader title="다음 단계" />
        {problems.length ? (
          <div className="cb-stack-sm" style={{ marginBottom: 12 }}>
            {problems.slice(0, 4).map((w) => (
              <Notice key={w.code + w.message} tone={w.severity === 'error' ? 'danger' : 'warn'}>
                {w.message}
              </Notice>
            ))}
          </div>
        ) : null}
        <CheckList items={nextSteps} icon="check" />
        {actions ? <div className="cb-stack-sm" style={{ marginTop: 16 }}>{actions}</div> : null}
      </Card>
    </div>
  );
}
