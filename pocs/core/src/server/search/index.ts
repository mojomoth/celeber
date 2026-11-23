/**
 * @celeber/core/server/search — 이미지 검색(네이버 > SerpAPI > Mock) / 역이미지 검색(SerpAPI Lens > Mock).
 * 정책: 역이미지 검색 결과의 텍스트(제목/지식그래프)는 "후보"일 뿐이며 사용자가 확정해야 한다.
 */
import 'server-only';
import crypto from 'node:crypto';
import { signedPublicImagePath } from '../access';
import { cacheGet, cacheSet } from '../db';
import { getEnv } from '../env';
import { createNaverImageProvider } from './naver';
import { mockImageProvider, mockReverseProvider } from './mock';
import { createSerpApiImageProvider, createSerpApiLensProvider } from './serpapi';
import type { ImageSearchProvider, ImageSearchQuery, ImageSearchResult, ReverseImageSearchProvider, ReverseImageSearchResult } from './types';

export * from './types';
export { createNaverImageProvider } from './naver';
export { createSerpApiImageProvider, createSerpApiLensProvider } from './serpapi';
export { mockImageProvider, mockNameFromQuery, mockReverseProvider } from './mock';

/** 사용 가능한 이미지 검색 프로바이더 (네이버 우선, 한국 연예인에 유리) */
export function getImageSearchProvider(prefer?: 'naver' | 'serpapi'): ImageSearchProvider {
  const env = getEnv();
  if (env.forceMock) return mockImageProvider;
  const naver = env.naverClientId && env.naverClientSecret ? createNaverImageProvider(env.naverClientId, env.naverClientSecret) : null;
  const serp = env.serpApiKey ? createSerpApiImageProvider(env.serpApiKey) : null;
  if (prefer === 'serpapi' && serp) return serp;
  return naver ?? serp ?? mockImageProvider;
}

/** 사용 가능한 모든 실제 프로바이더 (네이버 실패 시 SerpAPI로 재시도 등) */
export function getImageSearchProviders(): ImageSearchProvider[] {
  const env = getEnv();
  if (env.forceMock) return [mockImageProvider];
  const list: ImageSearchProvider[] = [];
  if (env.naverClientId && env.naverClientSecret) list.push(createNaverImageProvider(env.naverClientId, env.naverClientSecret));
  if (env.serpApiKey) list.push(createSerpApiImageProvider(env.serpApiKey));
  return list.length ? list : [mockImageProvider];
}

export function getReverseImageSearchProvider(): ReverseImageSearchProvider {
  const env = getEnv();
  if (env.forceMock || !env.serpApiKey) return mockReverseProvider;
  return createSerpApiLensProvider(env.serpApiKey);
}

/**
 * 업로드 이미지를 외부(Lens)가 가져갈 수 있는 공개 URL. CELEBER_PUBLIC_BASE_URL 없으면 null.
 * 앱 전체가 아니라 서명·만료(10분)가 붙은 이미지 한 장 경로만 내보낸다(/api/public-image/<id>?exp&sig).
 */
export function publicUrlForUpload(uploadId: string): string | null {
  const base = getEnv().publicBaseUrl;
  return base ? `${base.replace(/\/$/, '')}${signedPublicImagePath(uploadId)}` : null;
}

/** 역이미지 검색: 공개 URL이 없으면 unavailable */
export async function reverseImageSearch(input: { imageUrl?: string; uploadId?: string }): Promise<ReverseImageSearchResult> {
  const provider = getReverseImageSearchProvider();
  const url = input.imageUrl ?? (input.uploadId ? publicUrlForUpload(input.uploadId) : null);
  if (provider.id === 'mock') return provider.reverseSearch({ imageUrl: url ?? '' });
  if (!url)
    return {
      provider: 'serpapi-lens',
      status: 'unavailable',
      reason: '업로드한 사진은 외부에서 접근할 수 없어 역이미지 검색을 할 수 없습니다(CELEBER_PUBLIC_BASE_URL 필요). 이름으로 검색해 주세요.',
      knowledgeGraph: [],
      visualMatches: [],
    };
  return provider.reverseSearch({ imageUrl: url });
}

/** 검색 + SQLite 캐시 (기본 7일) */
export async function searchImagesCached(q: ImageSearchQuery, opts: { provider?: ImageSearchProvider; ttlSec?: number } = {}): Promise<ImageSearchResult[]> {
  const provider = opts.provider ?? getImageSearchProvider();
  const key = `img:${provider.id}:${crypto.createHash('sha1').update(JSON.stringify([q.query, q.count ?? 20, q.large ?? true])).digest('hex')}`;
  if (provider.id !== 'mock') {
    const hit = cacheGet<ImageSearchResult[]>(key);
    if (hit) return hit;
  }
  const res = await provider.searchImages(q);
  if (provider.id !== 'mock') cacheSet(key, provider.id, res, opts.ttlSec);
  return res;
}

/**
 * 전신 사진 1차 필터 (메타데이터 기반): 세로형(h/w ≥ minAspect) + 최소 높이.
 * 정확한 판정은 AI 비전(키 있을 때)으로 보완할 것.
 */
export function isLikelyFullBody(r: Pick<ImageSearchResult, 'width' | 'height'>, opts: { minAspect?: number; minHeight?: number } = {}): boolean {
  const { minAspect = 1.25, minHeight = 500 } = opts;
  if (!r.width || !r.height) return true; // 크기 정보 없으면 보류(통과)
  return r.height / r.width >= minAspect && r.height >= minHeight;
}
