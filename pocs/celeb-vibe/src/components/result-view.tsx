'use client';
/**
 * 추구미 분석 결과 뷰. 순서: 사진(+핫스팟, 팔레트) → 관찰한 특징(코디/퍼스널컬러/분위기) → 팔레트·체형.
 * celeb-vibe-report가 "@celeber/celeb-vibe/components"로 그대로 재사용한다.
 */
import { useState, type ReactNode } from 'react';
import type { NamedColor, VibeAnalysis } from '@celeber/core/contracts';
import { OUTFIT_CATEGORY_LABEL_KO } from '@celeber/core/contracts';
import { axisLevelLabel, getToneProfile } from '@celeber/core/personal-color';
import { AxisBars, Card, Chips, Gauge, MockBadge, Notice, ReportRow, ReportTable, SectionHeader, Swatch, SwatchRow } from '@celeber/ui';
import { AnalyzabilitySummary, statsOnly } from './analyzability';
import { HotspotPhoto, contrastText } from './hotspot-photo';

export interface VibeResultViewProps {
  analysis: VibeAnalysis;
  /** 이미지 URL 앞에 붙일 경로 (호스트 앱) */
  apiBase?: string;
  /** AI 폴백 사유 등 */
  warning?: string;
  /** 헤더 오른쪽/아래 동작 영역 */
  actions?: ReactNode;
  /** 섹션 번호 시작값 (리포트 안에 넣을 때) */
  startNo?: number;
  /** 헤더(룩 이름/인물 이름) 숨김 */
  hideHeader?: boolean;
}

const SOURCE_LABEL: Record<VibeAnalysis['source'], string> = {
  hybrid: '측정 + AI 분석',
  ai: 'AI 분석',
  rules: '규칙 측정',
  mock: '측정 + 데모 서술',
};

/** 팔레트가 비었을 때(인물 없는 사진을 강행했거나 코디 분석 불가) 표시 */
export const PALETTE_EMPTY_TEXT = '분석할 색이 없습니다.';

function PaletteLine({ label, colors }: { label: string; colors: NamedColor[] }) {
  if (!colors.length) return null;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'start', gap: 8 }}>
      <span className="cb-caption cb-muted" style={{ paddingTop: 14, fontWeight: 600 }}>
        {label}
      </span>
      <SwatchRow items={colors.map((c) => ({ hex: c.hex, name: c.name }))} size={44} showHex />
    </div>
  );
}

export function VibeResultView({ analysis: a, apiBase = '', warning, actions, startNo = 1, hideHeader }: VibeResultViewProps) {
  const [active, setActive] = useState<number | null>(null);
  const pc = a.personalColor;
  const profile = pc.tone ? getToneProfile(pc.tone) : undefined;
  const aspect = a.image.width && a.image.height ? `${a.image.width} / ${a.image.height}` : '3 / 4';
  const n = (k: number) => startNo + k;
  const allPalette = [...a.palette.main, ...a.palette.sub, ...a.palette.accent];

  return (
    <div className="cb-stack" style={{ gap: 24 }}>
      {!hideHeader ? (
        <header className="cb-stack-sm">
          <div className="cb-row" style={{ flexWrap: 'wrap' }}>
            {a.celebName ? <span className="cb-row-title">{a.celebName}</span> : <span className="cb-row-title cb-muted">이름 없음</span>}
            <span className="cb-spacer" />
            {a.isMock ? <MockBadge title="AI 키가 없거나 호출에 실패해 측정값 기반 데모 서술을 표시합니다." /> : null}
          </div>
          <h1 className="cb-screen-title" style={{ margin: 0 }}>
            {a.lookName}
          </h1>
          <p className="cb-caption cb-muted">
            {SOURCE_LABEL[a.source]} · {new Date(a.createdAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
            {a.model ? ` · ${a.model}` : ''}
          </p>
          {actions}
        </header>
      ) : null}

      {warning ? (
        <Notice tone="warn" title="데모 데이터로 표시합니다">
          {warning}
        </Notice>
      ) : null}
      {a.isMock ? (
        <p className="cb-caption cb-muted" style={{ margin: 0 }}>
          {statsOnly(a.analyzability)
            ? '인물을 검출하지 못해 사진 중앙 통계로 추정한 색입니다(코디·퍼스널컬러 모두 참고용). 아이템 종류·소재·분위기 문장은 AI 없이 규칙으로 만든 데모 서술입니다.'
            : '피부·의상 색과 위치는 사진에서 직접 측정한 값입니다. 아이템 종류·소재·분위기 문장은 AI 없이 규칙으로 만든 데모 서술입니다.'}
        </p>
      ) : null}

      {/* 사진 → 팔레트 (ColorMo 패턴: 큰 사진 바로 아래 원형 견본) */}
      <section className="cb-stack-sm" aria-label="분석한 사진">
        <HotspotPhoto src={`${apiBase}${a.image.url}`} alt={a.celebName ? `${a.celebName} 사진` : '분석한 사진'} items={a.outfit.items} active={active} onSelect={setActive} aspect={aspect} />
        {allPalette.length ? <SwatchRow items={allPalette.map((c) => ({ hex: c.hex, name: c.name }))} size={40} columns={Math.min(5, allPalette.length)} /> : null}
      </section>

      <Card tone="paper">
        <AnalyzabilitySummary analyzability={a.analyzability} />
      </Card>

      {/* ① 코디 */}
      <section>
        <SectionHeader no={n(0)} title="코디" subtitle="사진의 번호를 누르면 아이템 위치를 표시합니다" />
        {a.outfit.items.length ? (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
            {a.outfit.items.map((it, i) => {
              const meta = [it.material, it.fit, it.pattern].filter(Boolean).join(' · ');
              return (
                <li key={`${it.category}-${i}`}>
                  <button
                    type="button"
                    onClick={() => setActive(active === i ? null : i)}
                    aria-pressed={active === i}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      display: 'grid',
                      gridTemplateColumns: '24px 44px 1fr',
                      gap: 12,
                      alignItems: 'center',
                      padding: '10px 8px',
                      border: 0,
                      borderRadius: 12,
                      background: active === i ? 'var(--cb-iris-soft)' : 'transparent',
                      cursor: 'pointer',
                      color: 'inherit',
                      font: 'inherit',
                      minHeight: 44,
                    }}
                  >
                    <span className="cb-num" style={{ background: it.color.hex, color: contrastText(it.color.hex), boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }}>
                      {i + 1}
                    </span>
                    <Swatch hex={it.color.hex} size={44} />
                    <span style={{ minWidth: 0 }}>
                      <span className="cb-caption cb-muted" style={{ display: 'block' }}>
                        {OUTFIT_CATEGORY_LABEL_KO[it.category]}
                      </span>
                      <span className="cb-row-title" style={{ display: 'block' }}>
                        {it.name}
                      </span>
                      <span className="cb-caption" style={{ display: 'block' }}>
                        {it.color.name} <span className="cb-mono cb-muted">{it.color.hex}</span>
                        {it.secondaryColors?.length ? <span className="cb-muted"> + {it.secondaryColors.map((c) => c.name).join(', ')}</span> : null}
                      </span>
                      {meta ? (
                        <span className="cb-caption cb-muted" style={{ display: 'block' }}>
                          {meta}
                        </span>
                      ) : null}
                      {it.note && active === i ? (
                        <span className="cb-caption cb-muted" style={{ display: 'block', marginTop: 2 }}>
                          {it.note}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="cb-body cb-muted">코디 아이템을 찾지 못했습니다.</p>
        )}
        <div className="cb-stack-sm" style={{ marginTop: 12 }}>
          {a.outfit.styleKeywords.length ? <Chips items={a.outfit.styleKeywords} /> : null}
          <ReportTable>
            <ReportRow icon="body" label="실루엣" value={a.outfit.silhouette} />
            <ReportRow icon="keyword" label="요약" value={a.outfit.summary} />
          </ReportTable>
        </div>
      </section>

      {/* ② 퍼스널컬러 */}
      <section>
        <SectionHeader no={n(1)} title="퍼스널컬러" subtitle={pc.measured ? '얼굴 랜드마크로 피부 영역을 직접 측정' : '사진 판단 기반 추정 (측정값 없음)'} />
        <div className="cb-stack-sm">
          {profile ? (
            <div style={{ background: profile.accentHex, color: contrastText(profile.accentHex), borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ fontSize: 24, lineHeight: '30px', fontWeight: 800 }}>{pc.toneNameKo ?? profile.nameKo}</div>
              <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.9 }}>{profile.nameEn}</div>
              <div className="cb-caption" style={{ marginTop: 6, opacity: 0.9 }}>
                {[pc.undertone ? `언더톤 ${pc.undertone === 'warm' ? '웜' : pc.undertone === 'cool' ? '쿨' : '뉴트럴'}` : '언더톤 판정 보류', !a.analyzability.partial.personalColor ? (pc.measured ? '사진 조건 때문에 참고용' : '얼굴을 측정하지 않아 참고용') : null].filter(Boolean).join(' · ')}
              </div>
            </div>
          ) : (
            <Notice tone="info" title="톤을 추정하지 않았습니다">
              이 사진에서는 피부색을 믿을 만하게 읽을 수 없습니다.
            </Notice>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center' }}>
            <div className="cb-row" style={{ gap: 16, flexWrap: 'wrap' }}>
              {pc.skin ? <Swatch hex={pc.skin.hex} name="피부" caption={pc.skin.nameKo} size={48} /> : null}
              {pc.hair ? <Swatch hex={pc.hair.hex} name="헤어" caption={pc.hair.nameKo} size={48} /> : null}
              {pc.eyes ? <Swatch hex={pc.eyes.hex} name="눈동자" caption={pc.eyes.nameKo} size={48} /> : null}
            </div>
            <Gauge value={Math.round(pc.confidence * 100)} label="신뢰도" size={88} />
          </div>

          {pc.axes ? (
            <>
              <AxisBars
                axes={[
                  { key: 'warmth', label: '웜·쿨', value: pc.axes.warmth, poles: ['쿨', '웜'] },
                  { key: 'value', label: '명도', value: pc.axes.value, poles: ['딥', '라이트'] },
                  { key: 'chroma', label: '채도', value: pc.axes.chroma, poles: ['뮤트', '비비드'] },
                  { key: 'contrast', label: '대비', value: pc.axes.contrast, poles: ['낮음', '높음'] },
                  { key: 'clarity', label: '청탁', value: pc.axes.clarity, poles: ['탁함', '맑음'] },
                ]}
              />
              <p className="cb-caption cb-muted" style={{ margin: 0 }}>
                {pc.undertone ? axisLevelLabel('warmth', pc.axes.warmth) : '웜·쿨 보류'} · 명도 {axisLevelLabel('value', pc.axes.value)} · 채도 {axisLevelLabel('chroma', pc.axes.chroma)} · 대비 {axisLevelLabel('contrast', pc.axes.contrast)} · {axisLevelLabel('clarity', pc.axes.clarity)}
              </p>
            </>
          ) : null}

          {pc.evidence.length ? (
            <details>
              <summary className="cb-caption" style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32, display: 'flex', alignItems: 'center' }}>
                판정 근거 {pc.evidence.length}개
              </summary>
              <ul className="cb-caption cb-muted" style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                {pc.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <Notice tone="warn" title="사진 조명의 한계">
            {pc.lightingCaveat}
          </Notice>
        </div>
      </section>

      {/* ③ 분위기 */}
      <section>
        <SectionHeader no={n(2)} title="분위기" />
        {a.analyzability.partial.mood || a.mood.keywords.length ? (
          <div className="cb-stack-sm">
            <Chips items={a.mood.keywords} tone="iris" />
            <p className="cb-body" style={{ margin: 0 }}>
              {a.mood.firstImpression}
            </p>
            {a.mood.references.length ? (
              <ReportTable>
                <ReportRow icon="image" label="이미지 레퍼런스" value={a.mood.references.join(' / ')} />
              </ReportTable>
            ) : null}
          </div>
        ) : (
          <p className="cb-body cb-muted">분위기를 읽을 수 있는 인물이 없습니다.</p>
        )}
      </section>

      {/* ④ 팔레트 */}
      <section>
        <SectionHeader no={n(3)} title="컬러 팔레트" subtitle="주조색 · 보조색 · 포인트색" />
        {allPalette.length ? (
          <div className="cb-stack-sm">
            <PaletteLine label="주조" colors={a.palette.main} />
            <PaletteLine label="보조" colors={a.palette.sub} />
            <PaletteLine label="포인트" colors={a.palette.accent} />
          </div>
        ) : (
          <p className="cb-body cb-muted">{PALETTE_EMPTY_TEXT}</p>
        )}
      </section>

      {a.body?.measured ? (
        <section>
          <SectionHeader no={n(4)} title="사진 속 체형 비율" subtitle="전신 사진의 관절 좌표 기반 근사치" />
          <ReportTable>
            {a.body.headsTall ? <ReportRow icon="body" label="등신" value={`약 ${a.body.headsTall.toFixed(1)}등신`} /> : null}
            {a.body.upperToLower ? <ReportRow icon="body" label="상·하체 비" value={`1 : ${(1 / a.body.upperToLower).toFixed(2)}`} note="머리 꼭대기~골반 : 골반~발" /> : null}
            {a.body.legToHeight ? <ReportRow icon="body" label="다리 길이" value={`키의 ${Math.round(a.body.legToHeight * 100)}%`} /> : null}
            {a.body.shoulderToHip ? <ReportRow icon="body" label="어깨/골반" value={a.body.frameLabel ?? a.body.shoulderToHip.toFixed(2)} note={`관절 폭 비 ${a.body.shoulderToHip.toFixed(2)}`} /> : null}
          </ReportTable>
          <p className="cb-caption cb-muted" style={{ marginTop: 8 }}>
            {a.body.notes.join(' ')}
          </p>
        </section>
      ) : null}

      <p className="cb-caption cb-muted" style={{ textAlign: 'center' }}>
        인물의 신원은 판단하지 않습니다. 이름은 입력한 기록용 정보입니다.
      </p>
    </div>
  );
}
