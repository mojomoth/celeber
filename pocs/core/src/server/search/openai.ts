import 'server-only';
import { z } from 'zod';
import { assertSafeUrl } from '../fetch-image';
import type { ImageSearchProvider, ImageSearchResult } from './types';

const Output = z.object({ output: z.array(z.unknown()) });
const SearchCall = z.object({
  type: z.literal('web_search_call'),
  results: z.array(z.unknown()),
});
const SearchImage = z.object({
  type: z.literal('image_result'),
  image_url: z.string(),
  source_website_url: z.string().nullish(),
  thumbnail_url: z.string().nullish(),
  caption: z.string().nullish(),
});

function publicUrl(value: string | null | undefined): URL | undefined {
  if (!value) return undefined;
  try {
    return assertSafeUrl(value);
  } catch {
    return undefined;
  }
}

export function createOpenAiImageProvider(apiKey: string, model: string): ImageSearchProvider {
  return {
    id: 'openai',
    async searchImages({ query, count = 20 }): Promise<ImageSearchResult[]> {
      const limit = Math.min(100, Math.max(1, Math.trunc(count)));
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          model,
          input: query,
          instructions: 'Search for real photographs using the user input as literal search keywords. Return actual image search results.',
          reasoning: { effort: 'low' },
          tools: [{
            type: 'web_search',
            search_content_types: ['image'],
            image_settings: { max_results: limit, caption: true },
            user_location: { type: 'approximate', country: 'KR' },
          }],
          tool_choice: { type: 'web_search' },
          include: ['web_search_call.results'],
          max_output_tokens: 500,
          store: false,
        }),
      });
      if (!response.ok) throw new Error(`OpenAI 이미지 검색 실패 (HTTP ${response.status})`);
      const body = Output.safeParse(await response.json());
      if (!body.success) throw new Error('OpenAI 이미지 검색 응답 형식이 올바르지 않습니다.');

      const results: ImageSearchResult[] = [];
      const seen = new Set<string>();
      for (const item of body.data.output) {
        const call = SearchCall.safeParse(item);
        if (!call.success) continue;
        for (const entry of call.data.results) {
          const image = SearchImage.safeParse(entry);
          if (!image.success) continue;
          const imageUrl = publicUrl(image.data.image_url)?.href;
          if (!imageUrl || seen.has(imageUrl)) continue;
          seen.add(imageUrl);
          const page = publicUrl(image.data.source_website_url);
          results.push({
            provider: 'openai',
            imageUrl,
            thumbnailUrl: publicUrl(image.data.thumbnail_url)?.href,
            pageUrl: page?.href,
            title: image.data.caption?.trim().slice(0, 180) || undefined,
            source: page?.hostname.replace(/^www\./, ''),
          });
          if (results.length >= limit) return results;
        }
      }
      return results;
    },
  };
}
