/**
 * celebs / celeb_images 저장소 래퍼: 인물 확정(upsert), 상세, 저장 목록, 저장 토글, 삭제, 사진 선택.
 */
import 'server-only';
import type { CelebCandidate, CelebImage, CelebProfile, ImageRef } from '@celeber/core/contracts';
import { celebImages, celebs, newId, nowIso, type Row } from '@celeber/core/server/db';
import { getUpload, toImageRef } from '@celeber/core/server/uploads';
import { groupByCategory } from '../lib/filter';
import { descKey, nameKey } from '../lib/names';
import type { CandidateItem, CelebDetailResponse, CelebSummary } from '../lib/types';
import { proxyImageUrl } from './thumbs';
import { uploadIdFromUrl } from './util';

/**
 * 이름(+설명)으로 기존 인물 찾기. 같은 이름의 행이 여러 개일 수 있다(동명이인).
 * - 설명이 있으면: 설명이 같은 행, 없으면 설명이 비어 있는 행(같은 사람일 수 있음)
 * - 설명이 없으면: 설명이 비어 있는 행, 없으면 같은 이름이 한 명뿐일 때만 그 행
 *   (strict면 설명이 비어 있는 행만. 사진 글자처럼 이름만 있는 후보를 설명이 있는 동명이인에 붙이지 않는다)
 * 어느 쪽인지 알 수 없으면 null (다른 사람에 잘못 붙이지 않는다)
 */
export function findCelebByName(name: string, description?: string, opts: { strict?: boolean } = {}): Row<CelebProfile> | null {
  const key = nameKey(name);
  if (!key) return null;
  const rows = celebs.list({ where: { name_key: key }, order: 'created_at ASC', limit: 50 });
  if (!rows.length) return null;
  const want = descKey(description);
  const blank = rows.find((r) => !descKey(r.data.description));
  if (want) return rows.find((r) => descKey(r.data.description) === want) ?? blank ?? null;
  return blank ?? (!opts.strict && rows.length === 1 ? rows[0] : null);
}

/** 이름/별칭이 검색어를 포함하는 기존 인물 (자동완성) */
export function matchCelebs(q: string, limit = 5): Row<CelebProfile>[] {
  const key = nameKey(q);
  if (!key) return [];
  return celebs
    .list({ order: 'updated_at DESC', limit: 500 })
    .filter((r) => [r.data.name, r.data.nameEn ?? '', ...r.data.aliases].some((n) => nameKey(n).includes(key)))
    .sort((a, b) => Number(b.data.saved) - Number(a.data.saved))
    .slice(0, limit);
}

export function celebToCandidate(r: Row<CelebProfile>): CandidateItem {
  const c = r.data;
  return {
    name: c.name,
    nameEn: c.nameEn,
    description: c.description,
    thumbnailUrl: c.thumbnail?.url,
    source: c.source,
    score: c.saved ? 0.95 : 0.85,
    evidence: [c.saved ? '저장한 인물' : '이전에 확정한 인물'],
    celebId: r.id,
    saved: c.saved,
  };
}

/** 후보 목록에 DB 연결 정보(celebId, saved) 붙이기 */
export function attachCelebIds(list: CandidateItem[]): CandidateItem[] {
  const perName = new Map<string, number>();
  for (const c of list) perName.set(nameKey(c.name), (perName.get(nameKey(c.name)) ?? 0) + 1);
  return list.map((c) => {
    if (c.celebId) return c;
    const r = findCelebByName(c.name, c.description, { strict: true });
    if (!r) return c;
    // 목록에 같은 이름이 여럿이면(동명이인) 설명까지 같은 인물에만 붙인다
    if ((perName.get(nameKey(c.name)) ?? 0) > 1 && descKey(r.data.description) !== descKey(c.description)) return c;
    return { ...c, celebId: r.id, saved: r.data.saved };
  });
}

async function thumbRef(url: string | undefined): Promise<ImageRef | undefined> {
  const local = await proxyImageUrl(url);
  const id = uploadIdFromUrl(local);
  const rec = id ? getUpload(id) : null;
  return rec ? toImageRef(rec) : undefined;
}

/** 사용자가 확인한 후보 → celebs upsert (이름 + 설명 기준. 이름이 같아도 설명이 다르면 새 인물) */
export async function confirmCandidate(c: CelebCandidate): Promise<CelebProfile> {
  const name = c.name.trim();
  if (!name) throw new Error('이름이 비어 있습니다.');
  const existing = findCelebByName(name, c.description, { strict: true });
  const now = nowIso();
  if (existing) {
    const d = existing.data;
    const aliases = [...new Set([...d.aliases, ...(c.nameEn && c.nameEn !== d.nameEn ? [c.nameEn] : [])])];
    const thumbnail = d.thumbnail ?? (await thumbRef(c.thumbnailUrl));
    const next: CelebProfile = { ...d, nameEn: d.nameEn ?? c.nameEn, description: d.description ?? c.description, aliases, thumbnail, updatedAt: now };
    celebs.update(existing.id, { data: next, cols: { thumbnail_upload_id: thumbnail?.uploadId ?? null } });
    return next;
  }
  const id = newId('celeb');
  const thumbnail = await thumbRef(c.thumbnailUrl);
  const profile: CelebProfile = {
    id,
    createdAt: now,
    updatedAt: now,
    name,
    nameEn: c.nameEn,
    aliases: [],
    description: c.description,
    thumbnail,
    saved: false,
    source: c.source,
    isMock: c.source === 'mock',
  };
  celebs.insert({ id, data: profile, cols: { name, name_key: nameKey(name), saved: false, is_mock: profile.isMock, thumbnail_upload_id: thumbnail?.uploadId ?? null } });
  return profile;
}

export function listCelebImages(celebId: string): CelebImage[] {
  return celebImages.list({ where: { celeb_id: celebId }, order: 'created_at ASC', limit: 500 }).map((r) => r.data);
}

export function getCelebDetail(id: string): CelebDetailResponse | null {
  const celeb = celebs.get(id);
  if (!celeb) return null;
  return { celeb, images: groupByCategory(listCelebImages(id)) };
}

export function listCelebSummaries(opts: { saved?: boolean; limit?: number } = {}): CelebSummary[] {
  const rows = celebs.list({ where: opts.saved === undefined ? undefined : { saved: opts.saved }, order: 'updated_at DESC', limit: opts.limit ?? 30 });
  return rows.map((r) => ({
    celeb: r.data,
    imageCount: celebImages.count({ celeb_id: r.id }),
    selectedCount: celebImages.count({ celeb_id: r.id, selected: true }),
  }));
}

export function setCelebSaved(id: string, saved: boolean): CelebProfile | null {
  const c = celebs.get(id);
  if (!c) return null;
  const next = { ...c, saved, updatedAt: nowIso() };
  celebs.update(id, { data: next, cols: { saved } });
  return next;
}

/** 인물 + 수집 사진 기록 삭제 (celeb_images는 FK CASCADE). 캐시 이미지 파일은 다른 앱과 공유될 수 있어 남긴다 */
export function deleteCeleb(id: string): { deleted: boolean; images: number } {
  const images = celebImages.count({ celeb_id: id });
  const deleted = celebs.delete(id);
  if (deleted) celebImages.deleteWhere({ celeb_id: id }); // foreign_keys가 꺼진 연결 대비
  return { deleted, images: deleted ? images : 0 };
}

export function setImageSelected(imageId: string, selected: boolean): CelebImage | null {
  const im = celebImages.get(imageId);
  if (!im) return null;
  const next = { ...im, selected };
  celebImages.update(imageId, { data: next, cols: { selected } });
  return next;
}

/** 선택된 사진 (플로우 완료 결과용) */
export function selectedImages(celebId: string): CelebImage[] {
  return celebImages.list({ where: { celeb_id: celebId, selected: true }, order: 'created_at ASC', limit: 100 }).map((r) => r.data);
}
