import 'server-only';

import type { CelebImage, CelebProfile, ImageRef, VibeAnalysis, VibeGuide } from '@celeber/core/contracts';
import { celebImages, celebs } from '@celeber/core/server/db';
import { jsonError } from '@celeber/core/server/http';
import { getUpload } from '@celeber/core/server/uploads';
import { getVibeAnalysis } from '@celeber/celeb-vibe-report/server';
import { GenerateGuideRequestSchema, type GuideListResponse } from '@celeber/celeb-vibe-report/lib';
import type { VibeAnalysisSummary } from '@celeber/celeb-vibe/lib';
import type { CandidateItem, CelebDetailResponse, CelebSummary, CollectImagesResponse, IdentifyResponse, SearchResponse, SuggestResponse } from '@celeber/search-celeb/lib';

function realUpload(id: string) {
  const upload = getUpload(id);
  return !!upload && (upload.kind !== 'celeb-search-cache' || /^https?:\/\//.test(upload.sourceUrl ?? ''));
}

function realThumbnail(image: ImageRef | undefined) {
  return image && realUpload(image.uploadId) ? image : undefined;
}

function realCeleb(id: string | undefined) {
  return !id || !celebs.get(id)?.isMock;
}

function liveCandidates(items: CandidateItem[]) {
  return items.filter((item) => item.source !== 'mock' && realCeleb(item.celebId)).map((item) => {
    const uploadId = item.thumbnailUrl?.match(/^\/api\/uploads\/([^/?]+)$/)?.[1];
    return uploadId && realUpload(uploadId) ? item : { ...item, thumbnailUrl: undefined, thumbnailSourceUrl: undefined };
  });
}

function liveImages(images: CelebImage[]) {
  return images.filter((image) => !image.isMock && !!realThumbnail(image.cached));
}

function liveProfile(celeb: CelebProfile) {
  return realThumbnail(celeb.thumbnail) ? celeb : { ...celeb, thumbnail: undefined, thumbnailSourceUrl: undefined };
}

function realAnalysis(analysis: VibeAnalysis | null): analysis is VibeAnalysis {
  return !!analysis && !analysis.isMock && realCeleb(analysis.celebId) &&
    (!analysis.celebImageId || !celebImages.get(analysis.celebImageId)?.isMock) && realUpload(analysis.image.uploadId);
}

function realGuide(guide: { vibeAnalysisId: string; thumbnail?: ImageRef; isMock: boolean }) {
  const analysis = getVibeAnalysis(guide.vibeAnalysisId);
  return analysis ? realAnalysis(analysis) : !guide.isMock && !!realThumbnail(guide.thumbnail);
}

const missing = () => jsonError(404, 'not_found', '기록을 찾을 수 없어요.');

/** 재사용 흐름의 PoC 응답에서 데모 레코드를 제외한다. 원래 API와 목업의 동작은 유지한다. */
export async function liveMuseResponse(method: string, path: string[], response: Response): Promise<Response> {
  if (!response.ok) return response;
  const [group, resource, id, child] = path;

  if (group === 'celeb') {
    if (resource === 'suggest') {
      const data: SuggestResponse = await response.json();
      return Response.json({ ...data, items: liveCandidates(data.items) });
    }
    if (resource === 'search') {
      const data: SearchResponse = await response.json();
      const candidates = liveCandidates(data.candidates);
      const notices = data.isMock ? ['지금은 검색 결과가 제한돼요. 갖고 있는 사진을 올릴 수 있어요.'] : [];
      return Response.json({ ...data, candidates, isMock: false, notices, warning: undefined });
    }
    if (resource === 'identify') {
      const data: IdentifyResponse = await response.json();
      const candidates = liveCandidates(data.candidates);
      return Response.json({ ...data, candidates, needsNameSearch: !candidates.length, isMock: false, photoText: { ...data.photoText, warning: undefined } });
    }
    if (resource === 'celebs' && method === 'GET' && !id) {
      const { items }: { items: CelebSummary[] } = await response.json();
      return Response.json({ items: items.filter(({ celeb }) => !celeb.isMock).map((item) => ({ ...item, celeb: liveProfile(item.celeb) })) });
    }
    if (resource === 'celebs' && child === 'images' && method === 'POST') {
      const data: CollectImagesResponse = await response.json();
      const images = liveImages(data.images);
      return Response.json({ ...data, images, isMock: false, notices: data.isMock ? ['실제 사진을 불러오지 못했어요. 사진을 직접 올릴 수 있어요.'] : data.notices });
    }
    if (resource === 'celebs' && id && !child && method === 'GET') {
      const data: CelebDetailResponse = await response.json();
      return data.celeb.isMock ? missing() : Response.json({
        celeb: liveProfile(data.celeb),
        images: { signature: liveImages(data.images.signature), recent: liveImages(data.images.recent), daily: liveImages(data.images.daily) },
      });
    }
    if (resource === 'celebs' && ((!id && method === 'POST') || (id && !child && method === 'PATCH'))) {
      const data: { celeb: CelebProfile } = await response.json();
      return data.celeb.isMock ? missing() : Response.json({ celeb: liveProfile(data.celeb) });
    }
  }

  if (group === 'vibe') {
    if (resource === 'analyze') {
      const data: { analysis: VibeAnalysis } = await response.json();
      return realAnalysis(data.analysis) ? Response.json(data) : jsonError(503, 'analysis_unavailable', '지금은 사진 분석을 완료할 수 없어요. 잠시 뒤 다시 시도해 주세요.');
    }
    if (resource === 'analyses' && method === 'GET') {
      if (id) {
        const data: VibeAnalysis = await response.json();
        return realAnalysis(data) ? Response.json(data) : missing();
      }
      const data: { items: VibeAnalysisSummary[] } = await response.json();
      return Response.json({ items: data.items.filter((item) => realAnalysis(getVibeAnalysis(item.id))) });
    }
  }

  if (group === 'guide' && resource === 'guides' && method === 'GET') {
    if (id) {
      const guide: VibeGuide = await response.json();
      return realGuide(guide) ? Response.json({ ...guide, thumbnail: realThumbnail(guide.thumbnail) }) : missing();
    }
    const data: GuideListResponse = await response.json();
    return Response.json({ items: data.items.filter(realGuide).map((guide) => ({ ...guide, thumbnail: realThumbnail(guide.thumbnail) })) });
  }
  return response;
}

export async function liveMuseRequest(request: Request, path: string[]) {
  if (request.method !== 'POST' || path.join('/') !== 'guide/generate') return request;
  const body = GenerateGuideRequestSchema.safeParse(await request.clone().json().catch(() => null));
  if (!body.success) return request;
  const analysis = getVibeAnalysis(body.data.vibeAnalysisId);
  if (analysis && !realAnalysis(analysis)) return missing();
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return new Request(request.url, { method: 'POST', headers, body: JSON.stringify({ ...body.data, saved: false }) });
}
