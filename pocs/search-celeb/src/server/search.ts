/**
 * 이름 검색: 기존 인물(DB) + AI 후보(텍스트만, 사진 없음) + 입력한 이름 그대로.
 * 키가 없으면 데모 인물(mockNameSearch)과 입력 이름을 후보로 쓴다.
 */
import 'server-only';
import { z } from 'zod';
import type { CelebCandidate } from '@celeber/core/contracts';
import { MOCK_PEOPLE, mockNameSearch } from '@celeber/core/mock';
import { callTextStructured } from '@celeber/core/server/ai';
import { cacheGet, cacheSet } from '@celeber/core/server/db';
import { getCapabilities } from '@celeber/core/server/env';
import { mergeCandidates, nameKey, sameName } from '../lib/names';
import type { CandidateItem, SearchResponse, SuggestResponse } from '../lib/types';
import { attachCelebIds, celebToCandidate, matchCelebs } from './celebs';
import { candidatePhoto, proxyImageUrl } from './thumbs';
import { mapLimit, shortWarning } from './util';

export const MAX_QUERY_LENGTH = 60;

/** AI 출력 스키마 (얕고 단순하게) */
const NameCandidatesSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string(),
      nameEn: z.string(),
      description: z.string(),
      confidence: z.number(),
    }),
  ),
});
type NameCandidates = z.infer<typeof NameCandidatesSchema>;

const NAME_SYSTEM = [
  '이 요청에는 사진이 없습니다. 사용자가 입력한 텍스트 검색어만 보고 공인(배우, 가수, 모델, 방송인 등) 이름 후보를 제시합니다.',
  '규칙: 확실히 존재하는 공인만 제시하고, 모르면 빈 배열을 반환합니다. 존재하지 않는 인물을 만들지 않습니다.',
  '이름은 한국어 표기를 우선하고 nameEn에는 영문 표기(모르면 빈 문자열)를 넣습니다.',
  "description은 동명이인을 구분할 짧은 설명입니다 (예: '배우', '가수 · 그룹명'). 15자 이내.",
  'confidence는 검색어가 그 인물을 가리킬 가능성 0..1입니다. 최대 5명.',
].join('\n');

/** 자동완성: DB 인물 + (AI가 없을 때) 데모 인물. 외부 호출 없음 */
export function suggestCelebs(q: string): SuggestResponse {
  const query = q.trim().slice(0, MAX_QUERY_LENGTH);
  if (!query) return { query, items: [] };
  const fromDb = matchCelebs(query, 5).map(celebToCandidate);
  const caps = getCapabilities();
  const key = nameKey(query);
  const demo: CandidateItem[] = !caps.ai ? MOCK_PEOPLE.filter((p) => nameKey(p.name).includes(key) || nameKey(p.nameEn ?? '').includes(key)) : [];
  return { query, items: attachCelebIds(mergeCandidates([fromDb, demo], 6)) };
}

/** 이름 검색 (썸네일 포함) */
export async function searchCelebCandidates(q: string): Promise<SearchResponse> {
  const query = q.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH);
  const caps = getCapabilities();
  const notices: string[] = [];

  const fromDb = matchCelebs(query, 3).map(celebToCandidate);

  const cacheKey = `celeb-names:v1:${nameKey(query)}`;
  let aiList: CelebCandidate[];
  let origin: SearchResponse['origin'];
  let warning: string | undefined;
  const cached = caps.ai ? cacheGet<NameCandidates>(cacheKey) : null;
  if (cached) {
    aiList = toCandidates(cached, query);
    origin = 'ai';
  } else {
    const r = await callTextStructured<NameCandidates>({
      schema: NameCandidatesSchema,
      mock: () => ({ candidates: [] }),
      system: NAME_SYSTEM,
      prompt: `검색어: "${query}"`,
      maxTokens: 4000,
      effort: 'low',
      label: 'search-celeb/name-candidates',
    });
    warning = shortWarning(r.warning);
    if (r.source === 'ai') {
      cacheSet(cacheKey, 'anthropic', r.data, 24 * 3600);
      aiList = toCandidates(r.data, query);
      origin = 'ai';
    } else {
      aiList = mockNameSearch(query);
      origin = 'mock';
    }
  }

  const typed: CelebCandidate = {
    name: query,
    description: origin === 'mock' ? '입력한 이름 (검증되지 않음)' : '입력한 이름',
    // 데모 모드에서는 입력 이름도 검증되지 않은 데모 후보로 표시
    source: origin === 'mock' ? 'mock' : 'name-search',
    score: 0.35,
    evidence: ['입력한 이름 그대로 검색'],
  };
  // 입력 이름은 같은 이름의 후보가 없을 때만 붙인다. 동명이인 중 하나에 섞이면 그 사람이 근거 없이 올라간다
  const found = mergeCandidates([fromDb, aiList], 6);
  const merged = attachCelebIds(found.some((c) => sameName(c, typed)) ? found : mergeCandidates([found, [typed]], 6));

  // 썸네일: 인물 사진 + 이름이 함께 보이도록 (서버 캐시 경유)
  const withThumbs = await mapLimit(merged, 3, async (c) => {
    const cached = await proxyImageUrl(c.thumbnailUrl);
    if (cached) return { ...c, thumbnailUrl: cached };
    const photo = await candidatePhoto(c.name, c.description);
    return { ...c, thumbnailUrl: photo?.thumbnailUrl, thumbnailSourceUrl: photo?.thumbnailSourceUrl, thumbnailProvider: photo?.thumbnailProvider };
  });
  const imageProvider = withThumbs.find(({ thumbnailProvider }) => thumbnailProvider && thumbnailProvider !== 'mock')?.thumbnailProvider
    ?? withThumbs.find(({ thumbnailProvider }) => thumbnailProvider)?.thumbnailProvider ?? caps.imageSearch;
  const hasDemoThumbnails = withThumbs.some(({ thumbnailProvider }) => thumbnailProvider === 'mock');

  if (origin === 'mock') {
    const now = getCapabilities();
    const why = now.forceMock ? 'CELEBER_FORCE_MOCK=1' : now.aiBlockedReason ? `AI 일시 중단: ${now.aiBlockedReason}` : 'AI 키 없음';
    notices.push(`이름 확인 AI를 쓸 수 없어(${why}) 입력한 이름과 데모 인물을 후보로 보여줍니다.`);
  }
  if (hasDemoThumbnails) notices.push('실제 후보 사진을 가져오지 못한 경우 데모 실루엣을 표시합니다.');

  return {
    query,
    candidates: withThumbs,
    origin,
    isMock: origin === 'mock' || hasDemoThumbnails,
    imageProvider,
    warning,
    notices,
  };
}

function toCandidates(data: NameCandidates, query: string): CelebCandidate[] {
  return data.candidates
    .filter((c) => c.name.trim())
    .slice(0, 5)
    .map((c) => ({
      name: c.name.trim(),
      nameEn: c.nameEn.trim() || undefined,
      description: c.description.trim() || undefined,
      source: 'name-search' as const,
      score: Math.max(0, Math.min(1, Math.round(c.confidence * 100) / 100)),
      evidence: [`검색어 "${query}"에 대한 이름 후보 (텍스트 기반)`],
    }));
}
