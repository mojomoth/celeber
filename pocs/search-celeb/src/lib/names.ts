/**
 * 이름 정규화와 후보 병합. 서버/클라이언트 공용.
 * normalizeNameKey는 core/server/db의 같은 이름 함수와 동일 규칙(서버 전용 모듈이라 여기 복제).
 */
import type { CelebCandidate } from '@celeber/core/contracts';

/** 이름 조회 키: NFC, 소문자, 공백·구두점 제거 */
export function nameKey(name: string): string {
  return name.normalize('NFC').toLowerCase().replace(/[\s·.\-_()[\]]/g, '');
}

/** 동명이인 구분 키: 설명(직업·소속)을 이름 키와 같은 규칙으로 정규화. 설명이 없으면 '' */
export function descKey(description: string | undefined): string {
  return description ? nameKey(description) : '';
}

/** 설명이 둘 다 있고 서로 다르면 다른 사람. 한쪽이라도 없으면 같은 사람일 수 있다 */
export function sameDescription(a: string | undefined, b: string | undefined): boolean {
  const x = descKey(a);
  const y = descKey(b);
  return !x || !y || x === y;
}

/** 이름이 같은지 (영문명이 상대 이름과 같아도 같다고 본다. 영문명끼리는 비교하지 않는다: 로마자 표기가 같은 동명이인이 많다) */
export function sameName(a: Pick<CelebCandidate, 'name' | 'nameEn'>, b: Pick<CelebCandidate, 'name' | 'nameEn'>): boolean {
  const an = nameKey(a.name);
  const bn = nameKey(b.name);
  if (!an || !bn) return false;
  return an === bn || (!!a.nameEn && nameKey(a.nameEn) === bn) || (!!b.nameEn && nameKey(b.nameEn) === an);
}

/** 같은 인물 후보로 합쳐도 되는지: 이름이 같고 설명이 충돌하지 않을 때 */
export function sameCandidate(a: Pick<CelebCandidate, 'name' | 'nameEn' | 'description'>, b: Pick<CelebCandidate, 'name' | 'nameEn' | 'description'>): boolean {
  return sameName(a, b) && sameDescription(a.description, b.description);
}

/** 후보 목록에서 쓰는 고유 키 (React key, 선택 중 표시) */
export function candidateKey(c: Pick<CelebCandidate, 'name' | 'description'>): string {
  return `${nameKey(c.name)}|${descKey(c.description)}`;
}

const SOURCE_RANK: Record<CelebCandidate['source'], number> = {
  'name-search': 0,
  'reverse-image': 1,
  'photo-text': 2,
  mock: 3,
};

/**
 * 여러 출처의 후보 목록을 같은 인물끼리 합친다(sameCandidate).
 * - 이름이 같아도 설명이 다르면 동명이인으로 보고 따로 둔다 (예: '김민수' 코미디언 / 배우 / 가수)
 * - 설명이 없는 후보(사진 속 글자 등)는 이름이 같은 첫 후보에 합친다
 * - 한쪽의 영문명(nameEn)이 다른 쪽 이름과 같아도 같은 이름으로 본다
 *   (예: 'Jennie'로 검색하면 입력 이름 'Jennie'와 AI 후보 '제니'(nameEn Jennie)를 하나로)
 * - 이미 DB에 있는 서로 다른 인물(celebId가 다름)은 합치지 않는다
 * - 같은 인물이 여러 출처에서 나오면 점수에 출처당 +0.1 (최대 1)
 * - 근거(evidence)는 합치고 중복 제거
 * - 설명/영문명/썸네일/링크는 먼저 나온 값 유지
 * 점수는 텍스트 언급 빈도 기반이며 얼굴 유사도가 아니다.
 */
export function mergeCandidates(lists: CelebCandidate[][], limit = 8): CelebCandidate[] {
  const entries: { c: CelebCandidate; sources: Set<string>; order: number }[] = [];
  for (const list of lists) {
    for (const c of list) {
      if (!nameKey(c.name)) continue;
      const hit = entries.find((e) => sameCandidate(e.c, c) && !differentCeleb(e.c, c));
      if (!hit) {
        entries.push({ c: { ...c, evidence: [...c.evidence] }, sources: new Set([c.source]), order: entries.length });
        continue;
      }
      const m = hit.c;
      hit.sources.add(c.source);
      m.nameEn ??= c.nameEn;
      m.description ??= c.description;
      m.thumbnailUrl ??= c.thumbnailUrl;
      m.externalUrl ??= c.externalUrl;
      m.score = Math.max(m.score ?? 0, c.score ?? 0);
      for (const e of c.evidence) if (!m.evidence.includes(e)) m.evidence.push(e);
      if (SOURCE_RANK[c.source] < SOURCE_RANK[m.source]) m.source = c.source;
    }
  }
  return entries
    .map(({ c, sources, order: o }) => ({ c: { ...c, score: round2(Math.min(1, (c.score ?? 0.5) + 0.1 * (sources.size - 1))) }, o }))
    .sort((a, b) => (b.c.score ?? 0) - (a.c.score ?? 0) || a.o - b.o)
    .slice(0, limit)
    .map((x) => x.c);
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 둘 다 DB 인물(celebId)이고 id가 다르면 다른 사람 */
function differentCeleb(a: CelebCandidate & { celebId?: string }, b: CelebCandidate & { celebId?: string }): boolean {
  return !!a.celebId && !!b.celebId && a.celebId !== b.celebId;
}
