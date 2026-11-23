'use client';
/**
 * 추구미 가이드 결과 뷰. 순서: 사진 → 관찰한 특징(팔레트·갭) → 적용할 변화(얼굴·코디·분위기·액션·주의).
 * 레퍼런스: docs/ui/drafts/v4/05-style-muse.png (팔레트 두 줄, 원본 룩 ↔ 내 팔레트 적용, 스타일링 포인트).
 */
import type { ReactNode } from 'react';
import type { NamedColor, VibeAnalysis, VibeGuide } from '@celeber/core/contracts';
import { Chips, Icon, MockBadge, Notice, PhotoFrame, SectionHeader } from '@celeber/ui';
import { VibeResultView, statsOnly } from '@celeber/celeb-vibe/components';
import { guideSourceLabel } from '../lib/ai';
import { wj } from '../lib/josa';
import { analysisLimits, guideLimitations, limitationNotice } from '../lib/limits';
import { formatDate } from '../lib/summary';
import type { MyReportBrief } from '../lib/types';
import { ActionList, DoNotCopyList, GapSection, GuideItems, PaletteCompare, PaletteMapping, StylingPoints, SubstitutionTable } from './GuideParts';
import { LookRecolor } from './LookRecolor';
import s from './guide.module.css';

export interface VibeGuideViewProps {
  guide: VibeGuide;
  /** 연예인 사진 분석 (있으면 색 바꾸기 미리보기·상세 분석 표시) */
  vibe?: VibeAnalysis | null;
  /** 내 리포트 요약 (팔레트 줄·타입 이름) */
  myReport?: MyReportBrief | null;
  apiBase?: string;
  warning?: string;
  /** 상단 오른쪽/하단 동작 */
  actions?: ReactNode;
  /** 내 전신이 없을 때 '전신 사진 추가' 링크 */
  bodyAddHref?: string;
  /** 내 리포트 다시보기 링크 */
  reportHref?: string;
}

export function VibeGuideView({ guide: g, vibe, myReport, apiBase = '', warning, actions, bodyAddHref, reportHref }: VibeGuideViewProps) {
  const photo = g.thumbnail ? `${apiBase}${g.thumbnail.url}` : undefined;
  const aspect = g.thumbnail?.width && g.thumbnail?.height ? `${g.thumbnail.width} / ${g.thumbnail.height}` : '3 / 4';
  const celebPalette: NamedColor[] = vibe ? [...vibe.palette.main, ...vibe.palette.sub, ...vibe.palette.accent] : g.paletteMapping.map((m) => m.celeb);
  const myPalette: NamedColor[] = myReport?.best.length ? myReport.best : g.paletteMapping.map((m) => m.mine);
  const groomingLabel = g.face.makeup.some((m) => m.title.includes('립')) ? '메이크업' : '그루밍';
  const originalCaption = vibe ? vibe.outfit.items.slice(0, 2).map((i) => `${i.color.name} ${i.name}`).join(' · ') : undefined;
  // 분석이 제한된 사진(강행 분석). 저장된 사유가 없으면(이전 가이드) 연예인 분석에서 다시 판단한다.
  const vibeLimits = vibe ? analysisLimits(vibe.analyzability) : null;
  const limitations = g.limitations?.length ? g.limitations : vibeLimits?.limited || vibeLimits?.colorCaution ? guideLimitations(vibeLimits) : [];
  // 색 축을 하나도 비교하지 못했거나 celeb-vibe가 퍼스널컬러 분석 불가로 본 사진이면 연예인 톤 라벨(추정)을 보여주지 않는다
  const colorCompared = g.gaps.some((x) => COLOR_GAP_AXES.has(x.axis) && !x.unavailable) && !vibeLimits?.colorUnusable;
  const celebTone = colorCompared ? (vibe?.personalColor.toneNameKo ?? undefined) : '톤 비교 불가';
  // 인물이 없는 사진: 저장된 가이드만 있을 때는 색 축 비교 사유로 판단한다
  const noPerson = vibeLimits ? vibeLimits.noPerson : g.gaps.some((x) => x.unavailable && x.comment.includes('인물을 찾지 못해'));
  const limitNotice = limitationNotice(limitations, vibeLimits, colorCompared);
  // 브라우저 측정 없이 사진 통계로 잡은 코디 색·위치는 부정확해 사진 위 색 바꾸기를 만들지 않는다
  const recolorBlocked = vibe ? statsOnly(vibe.analyzability) || !!vibeLimits?.noPerson : true;

  return (
    <article className={s.article}>
      <div className={s.hero}>
        <PhotoFrame src={photo} alt={`${g.celebName} 사진`} aspect={aspect} label={g.celebName} />
      </div>

      <header style={{ marginTop: 24 }}>
        {limitNotice ? (
          <div style={{ marginBottom: 12 }}>
            <Notice tone="warn" title={limitNotice.title}>
              {limitNotice.body}
            </Notice>
          </div>
        ) : null}
        <p className={s.eyebrow}>{wj(g.lookName, '로/으로')} 분석했어요</p>
        <h1 className={s.title}>{g.celebName}의 추구미 가이드</h1>
        <p className={s.lead}>{g.summary}</p>
        <div className={s.metaRow}>
          <span className={s.tag}>{guideSourceLabel(g)}</span>
          {myReport ? <span className={s.tag}>내 타입 {myReport.nameKo}</span> : null}
          <span className={s.tag}>{formatDate(g.updatedAt)}</span>
          {g.isMock ? <MockBadge /> : null}
        </div>
        {warning ? (
          <div style={{ marginTop: 12 }}>
            <Notice tone="warn">{warning}</Notice>
          </div>
        ) : null}
        {actions ? <div style={{ marginTop: 16 }}>{actions}</div> : null}
      </header>

      <section className={s.section}>
        <SectionHeader title="팔레트 비교" subtitle="연예인 룩의 색을 내 퍼스널컬러 안의 가장 가까운 색으로 옮겼습니다." />
        <PaletteCompare
          celebLabel={g.celebName}
          celebSub={celebTone}
          celebColors={celebPalette}
          mySub={myReport?.nameKo}
          myColors={myPalette}
        />
        <div style={{ marginTop: 12 }}>
          <PaletteMapping mapping={g.paletteMapping} />
        </div>
        {reportHref ? (
          <p className="cb-caption" style={{ marginTop: 8 }}>
            <a href={reportHref} style={{ color: 'var(--cb-iris-deep)', fontWeight: 700 }}>
              내 퍼스널컬러 리포트 다시보기
            </a>
          </p>
        ) : null}
      </section>

      <section className={s.section}>
        <SectionHeader title="코디 색 치환 예시" subtitle={noPerson ? undefined : '원본 룩의 구성은 두고 색만 내 팔레트로 바꿨습니다.'} />
        {vibe && photo && !recolorBlocked ? <LookRecolor src={photo} items={vibe.outfit.items} substitutions={g.outfit.substitutions} celebName={g.celebName} originalCaption={originalCaption} /> : null}
        {vibe && photo && recolorBlocked && g.outfit.substitutions.length ? (
          <p className="cb-caption cb-muted" style={{ margin: 0 }}>
            브라우저 측정 없이 사진 통계로 추정한 코디 색이라 사진 위 색 바꾸기 미리보기는 만들지 않았습니다. 아래 치환표만 참고하세요.
          </p>
        ) : null}
        <div style={{ marginTop: 16 }}>
          <SubstitutionTable substitutions={g.outfit.substitutions} emptyText={noPerson ? '인물을 찾지 못해 색 치환 예시는 만들지 않았습니다. 위 팔레트 매핑만 참고하세요.' : undefined} />
        </div>
      </section>

      <section className={s.section}>
        <SectionHeader title="스타일링 포인트" />
        <StylingPoints
          rows={[
            { key: '얼굴', value: g.face.summary },
            { key: '코디', value: g.outfit.summary },
            { key: '분위기', value: g.mood.summary },
          ]}
        />
      </section>

      <section className={s.section}>
        <SectionHeader title="나와 추구미의 차이" subtitle={gapSubtitle(g.gaps)} />
        <GapSection gaps={g.gaps} celebName={g.celebName} bodyAddHref={bodyAddHref} />
      </section>

      <section className={s.section}>
        <SectionHeader title="얼굴 가이드" subtitle={`헤어 · ${groomingLabel}`} />
        <GuideItems items={g.face.hair} />
        <h3 className="cb-row-title" style={{ margin: '16px 0 0' }}>
          {groomingLabel}
        </h3>
        <GuideItems items={g.face.makeup} />
      </section>

      <section className={s.section}>
        <SectionHeader title="코디 가이드" subtitle="내 퍼스널컬러 팔레트 기준" />
        <GuideItems items={g.outfit.items} />
      </section>

      <section className={s.section}>
        <SectionHeader title="분위기 가이드" />
        {g.mood.keywords.length ? <Chips items={g.mood.keywords} tone="iris" /> : null}
        <div style={{ marginTop: 8 }}>
          <GuideItems items={g.mood.items} />
        </div>
      </section>

      <section className={s.section}>
        <SectionHeader title="쉬운 것부터 바꿔 보기" subtitle="위에서부터 차례로: 쉬움 → 보통 → 어려움" />
        <ActionList actions={g.actions} />
      </section>

      <section className={s.section}>
        <SectionHeader title="그대로 따라 하면 안 되는 것" />
        <DoNotCopyList items={g.doNotCopy} />
      </section>

      {vibe ? (
        <section className={s.section}>
          <details className={s.details}>
            <summary>
              <span>연예인 사진 분석 자세히 보기</span>
              <Icon name="chevron-right" size={18} />
            </summary>
            <div style={{ marginTop: 12 }}>
              <VibeResultView analysis={vibe} apiBase={apiBase} hideHeader />
            </div>
          </details>
        </section>
      ) : (
        <section className={s.section}>
          <Notice>원본 연예인 사진 분석이 삭제되어 색 바꾸기 미리보기를 표시하지 않습니다.</Notice>
        </section>
      )}

      <p className={s.disclaimer}>
        이 가이드는 사진 측정값과 퍼스널컬러 규칙으로 만든 참고 자료입니다. 사진 속 인물이 누구인지 판단하지 않으며, 조명·보정·화면 환경에 따라 실제 색은 다를 수 있습니다.
      </p>
    </article>
  );
}

const COLOR_GAP_AXES = new Set(['warmth', 'value', 'chroma', 'contrast', 'clarity']);

/** 갭 부제: 연예인 색 값의 출처(측정/추정/비교 불가)에 따라 다르게 적는다 */
function gapSubtitle(gaps: VibeGuide['gaps']): string {
  const color = gaps.filter((x) => COLOR_GAP_AXES.has(x.axis));
  const compared = color.filter((x) => !x.unavailable);
  if (!compared.length) return '연예인 사진에서 피부·헤어 색을 제대로 잴 수 없어 색 축은 비교하지 않았습니다. 스타일은 키워드 기준입니다.';
  const estimated = compared.some((x) => x.comment.includes('추정'));
  const base = estimated ? '색 축은 내 측정값과 연예인 사진의 추정값(0~100)' : '색 축은 피부·헤어 측정값(0~100)';
  return `${base}, 스타일은 키워드 기준입니다.`;
}
