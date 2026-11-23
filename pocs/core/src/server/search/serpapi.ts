/**
 * SerpAPI: Google Images 검색 + Google Lens 역이미지 검색. https://serpapi.com
 */
import 'server-only';
import type { ImageSearchProvider, ImageSearchQuery, ImageSearchResult, ReverseImageSearchProvider, ReverseImageSearchResult } from './types';

const BASE = 'https://serpapi.com/search.json';

async function serp(params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) throw new Error(`SerpAPI 요청 실패 (HTTP ${res.status})`);
  const json = (await res.json()) as Record<string, unknown>;
  if (typeof json.error === 'string' && !String(json.error).includes("hasn't returned any results")) throw new Error(`SerpAPI: ${json.error}`);
  return json;
}

interface SerpImage {
  original?: string;
  thumbnail?: string;
  title?: string;
  link?: string;
  source?: string;
  original_width?: number;
  original_height?: number;
}

export function createSerpApiImageProvider(apiKey: string): ImageSearchProvider {
  return {
    id: 'serpapi',
    async searchImages(q: ImageSearchQuery): Promise<ImageSearchResult[]> {
      const json = await serp({ engine: 'google_images', q: q.query, hl: 'ko', gl: 'kr', ijn: '0', api_key: apiKey, ...(q.large === false ? {} : { imgsz: 'l' }) });
      const items = (json.images_results as SerpImage[] | undefined) ?? [];
      return items
        .filter((it) => it.original)
        .slice(0, q.count ?? 20)
        .map((it) => ({
          provider: 'serpapi' as const,
          imageUrl: it.original as string,
          thumbnailUrl: it.thumbnail,
          pageUrl: it.link,
          title: it.title,
          source: it.source,
          width: it.original_width,
          height: it.original_height,
        }));
    },
  };
}

interface LensMatch {
  title?: string;
  link?: string;
  source?: string;
  thumbnail?: string;
}
interface LensKg {
  title?: string;
  subtitle?: string;
  link?: string;
  thumbnail?: string;
}

export function createSerpApiLensProvider(apiKey: string): ReverseImageSearchProvider {
  return {
    id: 'serpapi-lens',
    async reverseSearch({ imageUrl }): Promise<ReverseImageSearchResult> {
      try {
        const json = await serp({ engine: 'google_lens', url: imageUrl, hl: 'ko', country: 'kr', api_key: apiKey });
        const kg = (Array.isArray(json.knowledge_graph) ? (json.knowledge_graph as LensKg[]) : json.knowledge_graph ? [json.knowledge_graph as LensKg] : []).filter((k) => k.title);
        const vm = ((json.visual_matches as LensMatch[] | undefined) ?? []).filter((m) => m.title);
        return {
          provider: 'serpapi-lens',
          status: 'ok',
          knowledgeGraph: kg.map((k) => ({ title: k.title as string, subtitle: k.subtitle, link: k.link, thumbnailUrl: k.thumbnail })),
          visualMatches: vm.slice(0, 40).map((m) => ({ title: m.title as string, link: m.link, source: m.source, thumbnailUrl: m.thumbnail })),
        };
      } catch (e) {
        return { provider: 'serpapi-lens', status: 'error', reason: (e as Error).message, knowledgeGraph: [], visualMatches: [] };
      }
    },
  };
}
