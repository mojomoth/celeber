/**
 * 검색 이미지 1차 필터 (메타데이터 기반) + 정렬. 서버/클라이언트 공용 순수 함수.
 * 키가 있으면 서버가 Claude 비전으로 전신/분석 가능 여부를 다시 판정한다.
 */
import type { CelebImage, CelebImageCategory, Issue } from '@celeber/core/contracts';

/** 전신 사진 판정 기준: 세로 비율(높이/너비) ≥ 1.25, 높이 ≥ 500px */
export const FULL_BODY_RULE = { minAspect: 1.25, minHeight: 500, minWidth: 240 } as const;

export interface SizeLike {
  width?: number | null;
  height?: number | null;
}

export interface MetaJudgement {
  /** null = 크기 정보 없음(미판정) */
  isFullBody: boolean | null;
  analyzable: boolean | null;
  reasons: Issue[];
}

/** 크기 정보로 전신 여부를 추정한다 */
export function judgeByMetadata(s: SizeLike): MetaJudgement {
  const w = s.width ?? 0;
  const h = s.height ?? 0;
  if (!w || !h) return { isFullBody: null, analyzable: null, reasons: [{ code: 'no-size', message: '크기 정보가 없어 전신 여부를 판정하지 못했습니다.', severity: 'info' }] };
  const aspect = h / w;
  const reasons: Issue[] = [];
  let isFullBody = true;
  if (aspect < FULL_BODY_RULE.minAspect) {
    isFullBody = false;
    reasons.push({ code: aspect < 1 ? 'landscape' : 'not-tall', message: aspect < 1 ? '가로 사진이라 전신이 아닐 가능성이 높습니다.' : '세로 비율이 낮아 전신이 잘렸을 수 있습니다.', severity: 'warn' });
  }
  if (h < FULL_BODY_RULE.minHeight || w < FULL_BODY_RULE.minWidth) {
    reasons.push({ code: 'low-resolution', message: `해상도가 낮습니다 (${w}×${h}).`, severity: 'warn' });
  }
  if (isFullBody && !reasons.length) reasons.push({ code: 'meta-portrait', message: `세로 비율 ${aspect.toFixed(2)} · 높이 ${h}px`, severity: 'info' });
  const lowRes = reasons.some((r) => r.code === 'low-resolution');
  // 전신이 아니어도 상반신은 색 분석에 쓸 수 있으므로 analyzable은 미판정(null)으로 둔다
  return { isFullBody, analyzable: lowRes ? false : isFullBody ? true : null, reasons };
}

export interface RankableResult extends SizeLike {
  imageUrl: string;
}

/**
 * 검색 결과 정렬: 전신 추정 > 크기 미상 > 전신 아님, 같은 그룹 안에서는 원래 순서(검색 관련도) 유지.
 * 원본 URL 중복 제거 + exclude(이미 저장된 URL) 제외.
 */
export function rankSearchResults<T extends RankableResult>(items: T[], exclude: Iterable<string> = []): T[] {
  const skip = new Set(exclude);
  const seen = new Set<string>();
  const uniq: { it: T; i: number; g: number }[] = [];
  items.forEach((it, i) => {
    const key = canonicalUrl(it.imageUrl);
    if (!it.imageUrl || seen.has(key) || skip.has(it.imageUrl) || skip.has(key)) return;
    seen.add(key);
    const j = judgeByMetadata(it);
    const g = j.isFullBody === true ? (j.analyzable ? 0 : 1) : j.isFullBody === null ? 2 : 3;
    uniq.push({ it, i, g });
  });
  return uniq.sort((a, b) => a.g - b.g || a.i - b.i).map((x) => x.it);
}

/** 비교용 URL: 해시 제거, 프로토콜 무시 */
export function canonicalUrl(u: string): string {
  if (u.startsWith('data:') || u.startsWith('mock://')) return u;
  return u.replace(/#.*$/, '').replace(/^https?:\/\//, '');
}

/** 카테고리별로 묶기 (빈 카테고리도 키 유지) */
export function groupByCategory(images: CelebImage[]): Record<CelebImageCategory, CelebImage[]> {
  const g: Record<CelebImageCategory, CelebImage[]> = { signature: [], recent: [], daily: [] };
  for (const im of images) g[im.category].push(im);
  return g;
}

/** 그리드 표시 필터: 전신만 보기(전신 아님으로 판정된 것만 숨김) */
export function visibleImages(images: CelebImage[], fullBodyOnly: boolean): CelebImage[] {
  return fullBodyOnly ? images.filter((im) => im.isFullBody !== false) : images;
}

/** 썸네일 위 짧은 사유 (분석 불가/전신 아님) */
export function shortReason(im: CelebImage): string | undefined {
  if (im.analyzable === false) {
    const r = im.reasons.find((x) => x.severity !== 'info');
    return r ? shortLabel(r.code, r.message) : '분석 불가';
  }
  if (im.isFullBody === false) return '전신 아님';
  return undefined;
}

const SHORT: Record<string, string> = {
  landscape: '가로 사진',
  'not-tall': '전신 아님',
  'not-full-body': '전신 아님',
  'low-resolution': '저해상도',
  'multiple-people': '여러 명',
  backlight: '역광',
  occluded: '가림',
  'face-hidden': '얼굴 가림',
  'no-person': '인물 없음',
  'not-a-photo': '사진 아님',
  blurry: '흐림',
};

function shortLabel(code: string, message: string): string {
  return SHORT[code] ?? (message.length > 10 ? `${message.slice(0, 9)}…` : message);
}

/** 외부 출처 표시 이름: source 우선, 없으면 페이지 호스트 */
export function sourceLabel(im: Pick<CelebImage, 'pageUrl' | 'sourceTitle' | 'provider' | 'sourceUrl'>, siteName?: string): string {
  if (im.provider === 'mock') return 'CELEBER 데모';
  if (siteName) return siteName;
  const u = im.pageUrl ?? im.sourceUrl;
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '출처';
  }
}
