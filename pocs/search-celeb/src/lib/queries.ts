/**
 * 카테고리별 이미지 검색어 생성 (대표 · 최근 · 평소).
 * Mock 프로바이더는 검색어 키워드로 카테고리를 추정하므로(공항/최근/연도/행사 → 최근, 사복/일상/데일리 → 평소),
 * 대표·평소 검색어에는 '공항'과 연도를 넣지 않는다.
 */
import type { CelebImageCategory } from '@celeber/core/contracts';

export const CATEGORY_ORDER: readonly CelebImageCategory[] = ['signature', 'recent', 'daily'];

export const CATEGORY_LABEL: Record<CelebImageCategory, string> = {
  signature: '대표',
  recent: '최근',
  daily: '평소',
};

/** 탭 아래 한 줄 설명 */
export const CATEGORY_HINT: Record<CelebImageCategory, string> = {
  signature: '화보·레드카펫·시상식처럼 널리 알려진 룩',
  recent: '최근 1~2년 공항·행사 룩',
  daily: '사복·일상처럼 평소에 입는 룩',
};

/**
 * 인물 이름 + 카테고리 → 검색어 목록 (앞쪽이 우선).
 * @param description '배우', '가수 · 그룹명' 등. 동명이인 구분용으로 대표 검색어에만 덧붙인다.
 */
export function buildCategoryQueries(name: string, category: CelebImageCategory, now: Date = new Date(), description?: string): string[] {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return [];
  const year = now.getFullYear();
  // 1~2월에는 올해 사진이 적으므로 작년을 먼저 쓴다
  const recentYear = now.getMonth() < 2 ? year - 1 : year;
  const role = cleanRole(description);
  switch (category) {
    case 'signature':
      return dedupe([role ? `${n} ${role} 화보 전신` : `${n} 화보 전신`, `${n} 레드카펫`, `${n} 시상식 전신`]);
    case 'recent':
      return dedupe([`${n} ${recentYear} 공항패션`, `${n} ${recentYear} 행사 전신`, `${n} ${recentYear - 1} 공항패션`]);
    case 'daily':
      return dedupe([`${n} 사복 전신`, `${n} 일상 패션`, `${n} 데일리룩`]);
  }
}

/** '배우 (데모 인물)' → '배우'. 괄호·구분자 뒤는 버리고 짧은 직업명만 남긴다 */
function cleanRole(description?: string): string | null {
  if (!description) return null;
  const head = description.split(/[(·,/|]/)[0]?.trim() ?? '';
  return /^(배우|가수|모델|방송인|아이돌|래퍼|코미디언|MC)$/.test(head) ? head : null;
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}
