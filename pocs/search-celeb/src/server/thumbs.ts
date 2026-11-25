/**
 * 후보 인물 썸네일: 이미지 검색 1건을 서버에 캐시하고 '/api/uploads/<id>'를 돌려준다 (외부 핫링크 금지).
 */
import 'server-only';
import { cacheGet, cacheSet } from '@celeber/core/server/db';
import { assertSafeUrl, cacheRemoteImage } from '@celeber/core/server/fetch-image';
import { getImageSearchProviders, searchImagesCached, type ImageProviderId, type ImageSearchResult } from '@celeber/core/server/search';
import { getUpload, uploadUrl } from '@celeber/core/server/uploads';
import { nameKey } from '../lib/names';
import { uploadIdFromUrl } from './util';

const FETCH = { maxBytes: 6 * 1024 * 1024, timeoutMs: 8000 };

/** 외부 URL 또는 data URL을 캐시해 앱 내부 URL로 바꾼다. 실패 시 undefined */
export async function proxyImageUrl(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  const local = uploadIdFromUrl(url);
  if (local) return getUpload(local) ? url : undefined;
  if (!/^(https?:|data:image\/)/.test(url)) return undefined;
  try {
    const rec = await cacheRemoteImage(url, { fetch: FETCH });
    return uploadUrl(rec.id);
  } catch {
    return undefined;
  }
}

/** 이름(+설명)으로 대표 썸네일 1장 */
export async function candidateThumbnail(name: string, description?: string): Promise<string | undefined> {
  return (await candidatePhoto(name, description))?.thumbnailUrl;
}

type CandidatePhoto = { thumbnailUrl: string; thumbnailSourceUrl?: string; thumbnailProvider: ImageProviderId };

export function photoSourceUrl(image: Pick<ImageSearchResult, 'provider' | 'pageUrl' | 'imageUrl'>): string | undefined {
  if (image.provider === 'mock') return undefined;
  for (const url of [image.pageUrl, image.imageUrl]) {
    if (!url) continue;
    try {
      return assertSafeUrl(url).href;
    } catch {
      // 출처 페이지를 사용할 수 없으면 원본 이미지 주소를 확인한다.
    }
  }
  return undefined;
}

export async function candidatePhoto(name: string, description?: string): Promise<CandidatePhoto | undefined> {
  const role = description?.split(/[(·,/|]/)[0]?.trim();
  for (const provider of getImageSearchProviders()) {
    const key = `celeb-thumb:${provider.id}:${nameKey(name)}:${nameKey(description ?? '')}`;
    const cached = cacheGet<string | CandidatePhoto>(key);
    const hit = typeof cached === 'string' ? { thumbnailUrl: cached, thumbnailProvider: provider.id } : cached;
    const uploadId = uploadIdFromUrl(hit?.thumbnailUrl);
    if (hit && uploadId && getUpload(uploadId)) return hit;
    const query = provider.id === 'mock' ? name : [name, role && role.length <= 6 ? role : ''].filter(Boolean).join(' ');
    try {
      const results = await searchImagesCached({ query, count: 5, large: false }, { provider });
      for (const r of results.slice(0, 3)) {
        const thumbnailUrl = (await proxyImageUrl(r.thumbnailUrl)) ?? (await proxyImageUrl(r.imageUrl));
        if (thumbnailUrl) {
          const photo = { thumbnailUrl, thumbnailSourceUrl: photoSourceUrl(r), thumbnailProvider: provider.id };
          cacheSet(key, provider.id, photo, 30 * 24 * 3600);
          return photo;
        }
      }
    } catch {
      console.warn('[search-celeb] 썸네일 검색 실패:', provider.id);
    }
  }
  return undefined;
}
