import { afterEach, expect, it, vi } from 'vitest';
import { getCapabilities } from '../src/server/env';
import { createOpenAiImageProvider, getImageSearchProvider, getImageSearchProviders } from '../src/server/search';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('네이버와 SerpAPI가 없으면 OpenAI를 사용하고 강제 데모 모드를 우선한다', () => {
  vi.stubEnv('CELEBER_FORCE_MOCK', undefined);
  vi.stubEnv('NAVER_CLIENT_ID', 'id');
  vi.stubEnv('NAVER_CLIENT_SECRET', 'secret');
  vi.stubEnv('SERPAPI_API_KEY', 'serp');
  vi.stubEnv('OPENAI_API_KEY', 'openai');
  expect(getImageSearchProviders().map(({ id }) => id)).toEqual(['naver', 'serpapi', 'openai', 'mock']);
  expect(getImageSearchProvider('serpapi').id).toBe('serpapi');
  vi.stubEnv('NAVER_CLIENT_ID', undefined);
  vi.stubEnv('SERPAPI_API_KEY', undefined);
  expect(getImageSearchProvider().id).toBe('openai');
  expect(getCapabilities().imageSearch).toBe('openai');
  vi.stubEnv('CELEBER_FORCE_MOCK', '1');
  expect(getImageSearchProviders().map(({ id }) => id)).toEqual(['mock']);
  expect(getCapabilities().imageSearch).toBe('mock');
});

it('검색 도구가 돌려준 안전한 이미지 URL과 출처만 결과에 포함한다', async () => {
  const sourced = {
    type: 'image_result',
    image_url: 'https://img.example.com/celeb.jpg',
    source_website_url: 'https://www.example.com/story',
    thumbnail_url: 'https://img.example.com/small.jpg',
    caption: ' 행사 사진 ',
  };
  const request = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({
    output: [
      { type: 'message', content: [{ text: 'https://img.example.com/model-invented.jpg' }] },
      { type: 'web_search_call', results: [
        { type: 'text_result', image_url: 'https://img.example.com/text.jpg' },
        { ...sourced, image_url: 'http://localhost/unsafe.jpg' },
        sourced,
        sourced,
        { ...sourced, image_url: 'https://img.example.com/other.jpg', thumbnail_url: 'data:image/png;base64,AAAA', source_website_url: 'file:///tmp/file' },
      ] },
    ],
  }));
  vi.stubGlobal('fetch', request);
  const results = await createOpenAiImageProvider('unused', 'gpt-6.2-sol').searchImages({ query: '아이유 전신', count: 2 });
  expect(results).toEqual([
    {
      provider: 'openai',
      imageUrl: sourced.image_url,
      thumbnailUrl: sourced.thumbnail_url,
      pageUrl: sourced.source_website_url,
      title: '행사 사진',
      source: 'example.com',
    },
    { provider: 'openai', imageUrl: 'https://img.example.com/other.jpg', title: '행사 사진' },
  ]);
  const [url, options] = request.mock.calls[0];
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(JSON.parse(String(options.body))).toMatchObject({
    input: '아이유 전신',
    tools: [{ type: 'web_search', search_content_types: ['image'], image_settings: { max_results: 2 } }],
    include: ['web_search_call.results'],
    store: false,
  });
});
