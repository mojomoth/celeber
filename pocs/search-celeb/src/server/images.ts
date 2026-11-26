/**
 * 카테고리별 전신 사진 수집: 이미지 검색 → 메타데이터 1차 필터 → 서버 캐시(프록시) →
 * (키 있으면) Claude 비전으로 전신/분석 가능 판정 → celeb_images 저장.
 */
import 'server-only';
import crypto from 'node:crypto';
import { z } from 'zod';
import type { CelebImage, CelebImageCategory, Issue, UploadRecord } from '@celeber/core/contracts';
import { callVisionStructured } from '@celeber/core/server/ai';
import { celebImages, celebs, newId, nowIso } from '@celeber/core/server/db';
import { getCapabilities } from '@celeber/core/server/env';
import { cacheRemoteImage } from '@celeber/core/server/fetch-image';
import { getImageSearchProviders, searchImagesCached, type ImageSearchProvider, type ImageSearchResult } from '@celeber/core/server/search';
import { toImageRef } from '@celeber/core/server/uploads';
import { judgeByMetadata, rankSearchResults } from '../lib/filter';
import { buildCategoryQueries } from '../lib/queries';
import type { CollectImagesResponse } from '../lib/types';
import { photoSourceUrl } from './thumbs';
import { mapLimit, shortWarning } from './util';

/** 카테고리당 저장 목표 (3열 그리드 3줄) */
export const IMAGES_PER_CATEGORY = 9;
const FETCH = { maxBytes: 10 * 1024 * 1024, timeoutMs: 10_000 };
const DOWNLOAD_CONCURRENCY = 2;

const ISSUE_CODES = ['not-full-body', 'multiple-people', 'backlight', 'occluded', 'low-resolution', 'blurry', 'no-person', 'not-a-photo', 'other'] as const;
const JudgeSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      isFullBody: z.boolean(),
      analyzable: z.boolean(),
      personCount: z.number().int(),
      issues: z.array(z.object({ code: z.enum(ISSUE_CODES), message: z.string() })),
    }),
  ),
});
type Judge = z.infer<typeof JudgeSchema>;

const JUDGE_SYSTEM = [
  '연예인 코디 분석용 후보 사진을 선별합니다. 인물이 누구인지는 판단하지 않습니다.',
  '각 이미지에 대해 판정하세요:',
  '- isFullBody: 한 인물의 머리부터 발(또는 신발)까지 대부분 보이면 true.',
  '- analyzable: 상의·하의·신발 등 코디와 피부·헤어 색을 읽을 수 있으면 true. 심한 역광, 큰 가림, 저해상도, 비슷한 크기의 여러 명, 일러스트·합성·콜라주는 false.',
  '- personCount: 보이는 사람 수.',
  '- issues: 문제가 있을 때만, code와 한국어 한 줄 message (10자 내외).',
  'index는 이미지 라벨의 번호와 같아야 합니다. 모든 이미지에 대해 하나씩 답하세요.',
].join('\n');

export interface Downloaded {
  result: ImageSearchResult & { query: string };
  record: UploadRecord;
  sourceUrl: string;
  thumbnailOnly: boolean;
}

/**
 * 한 카테고리의 사진을 모은다. 이미 충분하면 저장된 것을 그대로 돌려준다(검색 결과 캐시).
 * refresh=true면 선택하지 않은 사진을 지우고 다시 검색한다.
 */
export async function collectCelebImages(celebId: string, category: CelebImageCategory, opts: { refresh?: boolean; target?: number; now?: Date } = {}): Promise<CollectImagesResponse | null> {
  const celeb = celebs.get(celebId);
  if (!celeb) return null;
  const target = opts.target ?? IMAGES_PER_CATEGORY;
  const notices: string[] = [];
  const queries = buildCategoryQueries(celeb.name, category, opts.now ?? new Date(), celeb.description);

  if (opts.refresh) celebImages.deleteWhere({ celeb_id: celebId, category, selected: false });
  const existing = listCategory(celebId, category);
  const providers = getImageSearchProviders();
  const base = { celebId, category, queries } as const;
  if (existing.length >= target) {
    return { ...base, provider: (existing.find((i) => !i.isMock) ?? existing[0])?.provider ?? providers[0].id, images: existing, added: 0, failed: 0, judge: { origin: existing.some((i) => i.reasons.some((r) => r.code.startsWith('ai-'))) ? 'ai' : 'rules' }, isMock: existing.some((i) => i.isMock), notices };
  }

  const existingUrls = new Set(listAllUrls(celebId));
  const need = target - existing.length;

  // 검색과 저장을 함께 확인한다. 쓸 수 있는 사진이 없으면 다음 공급자를 시도한다.
  const downloaded: Downloaded[] = [];
  let provider = providers[0];
  let failed = 0;
  let found = 0;
  for (const candidate of providers) {
    provider = candidate;
    const { results, errors } = await searchAll(provider, queries);
    notices.push(...errors);
    const ranked = rankSearchResults(results, existingUrls);
    found += ranked.length;
    let cursor = 0;
    const maxAttempts = need + 10;
    while (downloaded.length < need && cursor < ranked.length && cursor < maxAttempts) {
      // 원본 다운로드 버퍼와 sharp 디코드가 운영 인스턴스 메모리에서 겹치는 수를 제한한다.
      const batch = ranked.slice(cursor, cursor + Math.min(DOWNLOAD_CONCURRENCY, need - downloaded.length));
      cursor += batch.length;
      const got = await mapLimit(batch, DOWNLOAD_CONCURRENCY, (r) => download(r, provider, celeb.name, category));
      for (const g of got) {
        if (g && downloaded.length < need && !existingUrls.has(g.sourceUrl)) {
          downloaded.push(g);
          existingUrls.add(g.sourceUrl);
        } else if (!g) failed++;
      }
    }
    if (downloaded.length) break;
  }
  if (failed) notices.push(`${failed}장은 원본 서버에서 내려받지 못해 제외했습니다.`);
  if (!found) notices.push('검색 결과가 없습니다. 이름 표기를 바꿔 다시 찾아보세요.');

  // 3) 전신/분석 가능 판정
  const judged = await judgeImages(downloaded, provider.id === 'mock');
  if (judged.warning && judged.origin !== 'ai' && provider.id !== 'mock') notices.push('AI 판정을 사용할 수 없어 사진 크기로만 전신 여부를 추정했습니다.');

  // 4) 저장 (전신 추정 먼저)
  const now = nowIso();
  const order = downloaded.map((d, i) => ({ d, j: judged.items[i] })).sort((a, b) => rankOf(a.j) - rankOf(b.j));
  for (const { d, j } of order) {
    const image: CelebImage = {
      id: newId('cimg'),
      celebId,
      createdAt: now,
      category,
      query: d.result.query,
      provider: provider.id,
      sourceUrl: d.sourceUrl,
      pageUrl: d.result.pageUrl,
      sourceTitle: [d.result.title, d.result.source].filter(Boolean).join(' · ') || undefined,
      cached: toImageRef(d.record),
      thumbnailUrl: d.result.thumbnailUrl?.startsWith('http') ? d.result.thumbnailUrl : undefined,
      width: d.record.width ?? d.result.width,
      height: d.record.height ?? d.result.height,
      isFullBody: j.isFullBody,
      analyzable: j.analyzable,
      reasons: j.reasons,
      selected: false,
      isMock: provider.id === 'mock',
    };
    try {
      celebImages.insert({
        id: image.id,
        data: image,
        cols: {
          celeb_id: celebId,
          category,
          provider: provider.id,
          source_url: image.sourceUrl,
          upload_id: d.record.id,
          is_full_body: image.isFullBody,
          analyzable: image.analyzable,
          selected: false,
          is_mock: image.isMock,
        },
      });
    } catch (e) {
      // UNIQUE(celeb_id, source_url): 동시에 같은 카테고리를 수집한 경우
      if (!/UNIQUE/i.test((e as Error).message)) throw e;
    }
  }

  // 인물 썸네일이 없으면 첫 전신 사진으로
  const images = listCategory(celebId, category);
  if (!celeb.thumbnail) {
    const first = images.find((i) => i.isFullBody !== false && i.cached);
    if (first?.cached) {
      const thumbnailSourceUrl = photoSourceUrl({ ...first, imageUrl: first.sourceUrl });
      celebs.update(celebId, { data: { ...celeb, thumbnail: first.cached, thumbnailSourceUrl, thumbnailProvider: first.provider, updatedAt: nowIso() }, cols: { thumbnail_upload_id: first.cached.uploadId } });
    }
  }
  if (provider.id === 'mock') notices.push('실제 사진을 가져오지 못해 데모 이미지를 표시합니다. 데모 사진에는 별도의 모델이 등장하며, 실루엣은 분석할 수 없습니다.');

  return {
    ...base,
    provider: provider.id,
    images,
    added: downloaded.length,
    failed,
    judge: { origin: judged.origin, warning: shortWarning(judged.warning) },
    isMock: images.some((i) => i.isMock),
    notices,
  };
}

function listCategory(celebId: string, category: CelebImageCategory): CelebImage[] {
  return celebImages.list({ where: { celeb_id: celebId, category }, order: 'created_at ASC', limit: 100 }).map((r) => r.data);
}
function listAllUrls(celebId: string): string[] {
  return celebImages.list({ where: { celeb_id: celebId }, limit: 500 }).map((r) => r.data.sourceUrl);
}

const rankOf = (j: { isFullBody: boolean | null; analyzable: boolean | null }) => (j.isFullBody === true ? (j.analyzable === false ? 1 : 0) : j.isFullBody === null ? 2 : 3);

async function searchAll(provider: ImageSearchProvider, queries: string[]) {
  const batches = await mapLimit(queries, provider.id === 'openai' ? 3 : 1, async (query) => {
    try {
      const res = await searchImagesCached({ query, count: provider.id === 'mock' ? 6 : 20, large: true }, { provider });
      return { results: res.map((r) => ({ ...r, query })) };
    } catch {
      return { results: [], error: `${provider.id} 이미지 검색 결과를 가져오지 못했습니다.` };
    }
  });
  return {
    results: batches.flatMap(({ results }) => results),
    errors: [...new Set(batches.flatMap(({ error }) => error ? [error] : []))],
  };
}

/** 원본 → 실패 시 썸네일로 캐시. 성공하면 Downloaded */
async function download(r: ImageSearchResult & { query: string }, provider: ImageSearchProvider, name: string, category: CelebImageCategory): Promise<Downloaded | null> {
  const sourceUrl = r.imageUrl.startsWith('data:') ? `mock://celeb/${encodeURIComponent(name)}/${category}/${crypto.createHash('sha1').update(r.imageUrl).digest('hex').slice(0, 16)}` : r.imageUrl;
  try {
    const record = await cacheRemoteImage(r.imageUrl, { fetch: FETCH });
    return { result: r, record, sourceUrl, thumbnailOnly: false };
  } catch (e) {
    if (r.thumbnailUrl && r.thumbnailUrl !== r.imageUrl && provider.id !== 'mock') {
      try {
        const record = await cacheRemoteImage(r.thumbnailUrl, { fetch: FETCH });
        return { result: r, record, sourceUrl, thumbnailOnly: true };
      } catch {
        /* 둘 다 실패 */
      }
    }
    console.warn('[search-celeb] 이미지 캐시 실패:', (e as Error).message);
    return null;
  }
}

interface JudgeOut {
  items: { isFullBody: boolean | null; analyzable: boolean | null; reasons: Issue[] }[];
  origin: 'ai' | 'rules' | 'mock';
  warning?: string;
}

function metaJudge(d: Downloaded): JudgeOut['items'][number] {
  const size = { width: d.record.width ?? d.result.width, height: d.record.height ?? d.result.height };
  const j = judgeByMetadata(size);
  const reasons = [...j.reasons];
  if (d.thumbnailOnly) reasons.push({ code: 'thumbnail-only', message: '원본을 받지 못해 작은 미리보기만 저장했습니다.', severity: 'warn' });
  // 데모 실루엣(SVG)은 사람 검출이 되지 않으므로 미리 '분석 불가'로 표시한다. 래스터 데모 사진은 분석 가능.
  const demoSilhouette = d.result.provider === 'mock' && d.result.imageUrl.startsWith('data:image/svg');
  if (demoSilhouette) reasons.push({ code: 'demo', message: '데모 실루엣 · 분석 불가 (인물 사진이 아님)', severity: 'warn' });
  else if (d.result.provider === 'mock') reasons.push({ code: 'demo', message: '데모 사진 (검색한 인물과 무관한 데모 모델)', severity: 'info' });
  return { isFullBody: j.isFullBody, analyzable: d.thumbnailOnly || demoSilhouette ? false : j.analyzable, reasons };
}

/** 전신·분석 가능 판정 (키 있으면 AI, 없으면 메타데이터). export는 실제 AI 확인 테스트용 */
export async function judgeImages(list: Downloaded[], isMockProvider: boolean): Promise<JudgeOut> {
  const meta = list.map(metaJudge);
  if (!list.length || isMockProvider) return { items: meta, origin: isMockProvider ? 'mock' : 'rules' };
  if (!getCapabilities().ai) return { items: meta, origin: 'rules', warning: 'AI 사용 불가' };
  const r = await callVisionStructured<Judge>({
    schema: JudgeSchema,
    mock: () => ({ items: [] }),
    system: JUDGE_SYSTEM,
    prompt: `이미지 ${list.length}장을 판정해 주세요. index는 1부터 ${list.length}까지입니다.`,
    images: list.map((d, i) => ({ uploadId: d.record.id, label: `이미지 ${i + 1}` })),
    maxImageEdge: 512,
    maxTokens: 6000,
    effort: 'low',
    label: 'search-celeb/judge-full-body',
  });
  if (r.source !== 'ai') return { items: meta, origin: 'rules', warning: r.warning };
  const byIndex = new Map(r.data.items.map((it) => [it.index, it]));
  return {
    origin: 'ai',
    items: meta.map((m, i) => {
      const a = byIndex.get(i + 1);
      if (!a) return m;
      const reasons: Issue[] = [
        { code: 'ai-judged', message: `AI 판정 · 인물 ${a.personCount}명`, severity: 'info' },
        ...a.issues.map((x) => ({ code: x.code, message: x.message, severity: 'warn' as const })),
        ...m.reasons.filter((x) => x.code === 'low-resolution' || x.code === 'thumbnail-only'),
      ];
      return { isFullBody: a.isFullBody, analyzable: a.analyzable && m.analyzable !== false, reasons };
    }),
  };
}
