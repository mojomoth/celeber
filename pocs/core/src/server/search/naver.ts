/**
 * 네이버 검색 API: 이미지 검색. https://developers.naver.com/docs/serviceapi/search/image/image.md
 */
import 'server-only';
import type { ImageSearchProvider, ImageSearchQuery, ImageSearchResult } from './types';

const stripTags = (s: string) =>
  s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");

interface NaverImageItem {
  title: string;
  link: string;
  thumbnail: string;
  sizeheight: string;
  sizewidth: string;
}

export function createNaverImageProvider(clientId: string, clientSecret: string): ImageSearchProvider {
  return {
    id: 'naver',
    async searchImages(q: ImageSearchQuery): Promise<ImageSearchResult[]> {
      const params = new URLSearchParams({
        query: q.query,
        display: String(Math.min(100, Math.max(1, q.count ?? 20))),
        start: '1',
        sort: 'sim',
        filter: q.large === false ? 'all' : 'large',
      });
      const res = await fetch(`https://openapi.naver.com/v1/search/image?${params}`, {
        headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`네이버 이미지 검색 실패 (HTTP ${res.status})`);
      const json = (await res.json()) as { items?: NaverImageItem[] };
      return (json.items ?? []).map((it) => ({
        provider: 'naver' as const,
        imageUrl: it.link,
        thumbnailUrl: it.thumbnail,
        title: stripTags(it.title),
        width: Number(it.sizewidth) || undefined,
        height: Number(it.sizeheight) || undefined,
      }));
    },
  };
}
