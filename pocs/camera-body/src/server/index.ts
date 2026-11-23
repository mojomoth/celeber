// 서버 전용 함수 (DB/AI). "@celeber/camera-body/server"
import 'server-only';
import { colorNameKo } from '@celeber/core/color';
import { BodyAnalysisSchema, type BodyAnalysis, type BodySession } from '@celeber/core/contracts';
import { callVisionStructured } from '@celeber/core/server/ai';
import { bodySessions, kvDelete, kvGet, kvSet, newId, nowIso } from '@celeber/core/server/db';
import { getUpload, saveUploadFromDataUrl, toImageRef } from '@celeber/core/server/uploads';
import { computeBodyAnalysis, RATIO_BOUNDS, ratioOutOfBounds } from '../lib/analyze';
import { DEMO_H, DEMO_W, demoFace, demoFigureSvg, demoLandmarks, demoMask, DEMO_PALETTE } from '../lib/demo';
import { outfitSummaryFromColors, sanitizeOutfitColors, type OutfitColors } from '../lib/outfit';
import { bodyOneLiner } from '../lib/summary';
import { OutfitAiSchema, OutfitMetaSchema, type BodySessionListItem, type OutfitAi, type OutfitMeta } from '../lib/types';

const outfitKey = (sessionId: string) => `body:outfit:${sessionId}`;

/* ------------------------------------------------------------------ 코디 서술 (AI 비전 / 색 측정 폴백) */

function mockOutfit(colors: OutfitColors): OutfitAi {
  const items: OutfitAi['items'] = [];
  if (colors.top) items.push({ category: '상의', name: '상의', colorName: colors.top.nameKo });
  if (colors.bottom) items.push({ category: '하의', name: '하의', colorName: colors.bottom.nameKo });
  return {
    summary: outfitSummaryFromColors(colors),
    items,
    accessories: [],
    silhouetteNote: 'AI 서술 없이 픽셀 색 측정만 반영했습니다. 소재와 액세서리는 판단하지 않았습니다.',
  };
}

/**
 * 현재 코디/액세서리 서술. 키가 있으면 AI 비전(core 공급자 순서), 없거나 실패하면 색 측정 기반 요약(source 'mock').
 * 인물 식별 금지 정책(IDENTITY_POLICY)은 core가 system 앞에 자동으로 붙인다.
 */
export async function describeOutfit(uploadId: string, inputColors: OutfitColors, analysis?: BodyAnalysis): Promise<OutfitMeta> {
  // 클라이언트 값은 hex 형식만 믿고 색 이름은 서버에서 다시 만든다 (프롬프트/인라인 style 방어)
  const colors = sanitizeOutfitColors(inputColors);
  const measured = {
    measuredColors: colors,
    frame: analysis?.frame?.label,
    headsTall: analysis?.ratios?.headsTall,
    upperToLower: analysis?.ratios?.upperToLower,
  };
  const r = await callVisionStructured({
    schema: OutfitAiSchema,
    mock: () => mockOutfit(colors),
    system: [
      '전신 사진에서 현재 입은 옷과 액세서리를 관찰해 한국어로 기술합니다.',
      '- items: 보이는 의류 품목마다 category(아우터/상의/하의/원피스/신발/가방 중 하나), name(예: 오버핏 셔츠), colorName(한국어 색 이름).',
      '- accessories: 시계, 안경, 목걸이, 귀걸이, 반지, 벨트, 모자 등 보이는 것만. 없으면 빈 배열.',
      '- summary: 전체 코디를 한두 문장으로. silhouetteNote: 옷의 핏과 실루엣이 체형을 어떻게 보이게 하는지 한 문장.',
      '- 색은 colorName에만 쓰고 name에는 넣지 마세요(화면에 "색 이름 품목명"으로 이어 붙여 보여 줍니다).',
      '- 측정값의 색 이름은 참고만 하고 사진에서 보이는 대로 쓰세요. 보이지 않는 것은 추측하지 마세요.',
      '- 문장은 모두 "~입니다/~합니다"로 끝내세요.',
    ].join('\n'),
    prompt: `측정값: ${JSON.stringify(measured)}`,
    images: [{ uploadId, label: '전신 사진' }],
    maxTokens: 4000,
    effort: 'low',
    label: 'camera-body/outfit',
  });
  return OutfitMetaSchema.parse({ source: r.source, model: r.model, warning: r.warning, colors, detail: r.data });
}

/** 코디 서술 문자열 (BodyAnalysis.outfitDescription) */
export function outfitDescriptionText(o: OutfitMeta): string | undefined {
  if (!o.detail) return undefined;
  const items = o.detail.items.map((i) => `${i.colorName} ${i.name}`).join(', ');
  const acc = o.detail.accessories.length ? ` 액세서리: ${o.detail.accessories.join(', ')}.` : '';
  return `${o.detail.summary}${items && o.source === 'ai' ? ` (${items})` : ''}${acc}`.trim();
}

/* ------------------------------------------------------------------ 세션 저장/조회 */

export interface SaveBodyOptions {
  label?: string;
  outfitColors?: OutfitColors;
  /** 기본 true. 이미지가 있고 측정 완료/실패일 때 코디 서술 */
  describeOutfit?: boolean;
}

/** 전신 세션에 쓸 수 있는 업로드 종류 (플로우와 데모 모두 kind='body'로 올린다) */
export const BODY_UPLOAD_KINDS: ReadonlySet<string> = new Set(['body']);

/** 클라이언트 입력 오류 (Route Handler가 400으로 바꾼다) */
export class BodyInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BodyInputError';
  }
}

/**
 * analysis.image를 서버의 업로드 기록으로 다시 만든다.
 * 클라이언트가 보낸 url/uploadId를 그대로 믿지 않는다: 존재하지 않는 업로드는 거부하고,
 * url은 항상 '/api/uploads/<id>'(toImageRef)로 덮어써 외부 URL이 목록·상세에 렌더링되지 않게 한다.
 */
export function resolveBodyImage(analysis: BodyAnalysis): BodyAnalysis {
  if (!analysis.image) return analysis;
  const rec = getUpload(analysis.image.uploadId);
  if (!rec) throw new BodyInputError('upload_not_found', '사진 업로드 기록을 찾을 수 없습니다. 사진을 다시 올려 주세요.');
  if (!BODY_UPLOAD_KINDS.has(rec.kind)) {
    throw new BodyInputError('upload_kind_mismatch', '전신 사진으로 올린 업로드가 아닙니다. 전신 사진을 다시 올려 주세요.');
  }
  const ref = toImageRef(rec);
  return { ...analysis, image: { ...ref, width: ref.width ?? analysis.image.width, height: ref.height ?? analysis.image.height } };
}

/** 비율 범위는 측정 단계(analyze.ts)와 같은 값을 쓴다. 클라이언트가 실패로 돌리지 않은 값이 여기서 400이 되지 않게 */
export { RATIO_BOUNDS };

export function assertPlausibleRatios(analysis: BodyAnalysis): void {
  const key = ratioOutOfBounds(analysis.ratios as Record<string, number | undefined> | undefined);
  if (key) throw new BodyInputError('implausible_ratios', `측정 비율(${key})이 사람 몸에서 나올 수 있는 범위를 벗어났습니다. 사진을 다시 분석해 주세요.`);
}

/** 정규화 좌표(이미지 0..1)가 가질 수 있는 범위. 사진 밖으로 약간 나간 관절점은 허용한다. */
export const COORD_BOUNDS: [number, number] = [-0.5, 1.5];

/**
 * 관절점·파생 키포인트·실루엣 폭의 범위 검증. 렌더러(등신 눈금자 등)가 좌표로 반복 횟수를 정하므로
 * 거대값(예: sole.y=3e5)이 저장되면 상세 페이지 SSR에서 서버가 OOM으로 죽는다. 저장 전에 400으로 거부한다.
 */
export function assertPlausibleGeometry(analysis: BodyAnalysis): void {
  const [lo, hi] = COORD_BOUNDS;
  const okCoord = (v: number) => Number.isFinite(v) && v >= lo && v <= hi;
  const bad = (what: string) => {
    throw new BodyInputError('implausible_geometry', `측정 좌표(${what})가 사진 범위를 벗어났습니다. 사진을 다시 분석해 주세요.`);
  };
  for (const [key, p] of Object.entries(analysis.keypoints ?? {})) {
    if (!okCoord(p.x) || !okCoord(p.y)) bad(key);
  }
  for (const [i, l] of (analysis.landmarks ?? []).entries()) {
    if (!okCoord(l.x) || !okCoord(l.y) || !Number.isFinite(l.z) || Math.abs(l.z) > 10) bad(`landmark ${i}`);
    if (l.visibility !== undefined && (!Number.isFinite(l.visibility) || l.visibility < -0.01 || l.visibility > 1.01)) bad(`landmark ${i} visibility`);
  }
  const sil = analysis.silhouette;
  if (sil) {
    for (const [key, v] of Object.entries(sil)) {
      if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 2)) bad(`silhouette.${key}`);
    }
  }
}

/** 클라이언트 측정 결과를 검증·보강(코디 서술)해서 body_sessions에 저장 */
export async function saveBodySession(input: BodyAnalysis, opts: SaveBodyOptions = {}): Promise<{ session: BodySession; outfit: OutfitMeta | null }> {
  const parsed = BodyAnalysisSchema.parse(input);
  assertPlausibleRatios(parsed);
  assertPlausibleGeometry(parsed);
  let analysis = resolveBodyImage(parsed);
  let outfit: OutfitMeta | null = null;
  if (analysis.image && analysis.status !== 'skipped' && (opts.describeOutfit ?? true)) {
    outfit = await describeOutfit(analysis.image.uploadId, opts.outfitColors ?? {}, analysis);
    const text = outfitDescriptionText(outfit);
    analysis = { ...analysis, outfitDescription: text, source: outfit.source === 'ai' ? 'hybrid' : analysis.source };
  }
  const now = nowIso();
  const id = newId('body');
  const session: BodySession = { id, createdAt: now, updatedAt: now, label: opts.label, analysis };
  bodySessions.insert({
    id,
    data: session,
    createdAt: now,
    cols: { status: analysis.status, is_mock: analysis.isMock, upload_id: analysis.image?.uploadId ?? null, label: opts.label ?? null },
  });
  if (outfit) kvSet(outfitKey(id), outfit);
  return { session, outfit };
}

export function getBodySession(id: string): { session: BodySession; outfit: OutfitMeta | null } | null {
  const session = bodySessions.get(id);
  if (!session) return null;
  const raw = kvGet(outfitKey(id));
  const parsed = raw ? OutfitMetaSchema.safeParse(raw) : null;
  return { session, outfit: parsed?.success ? parsed.data : null };
}

export function listBodySessions(limit = 50): BodySessionListItem[] {
  return bodySessions.list({ order: 'created_at DESC', limit }).map((row) => {
    const a = row.data.analysis;
    return {
      id: row.id,
      createdAt: row.createdAt,
      label: row.data.label,
      status: a.status,
      isMock: a.isMock,
      thumbnailUrl: a.image?.url,
      summary: bodyOneLiner(a),
    };
  });
}

/** 가장 최근 완료 세션 (후행 리포트 기본값) */
export function latestCompleteBodySession(): BodySession | null {
  return bodySessions.list({ where: { status: 'complete' }, order: 'created_at DESC', limit: 1 })[0]?.data ?? null;
}

/** 세션 삭제. 업로드 파일은 다른 앱이 같은 sha로 재사용할 수 있어 지우지 않는다. */
export function deleteBodySession(id: string): boolean {
  kvDelete(outfitKey(id));
  return bodySessions.delete(id);
}

/** body_sessions 전체 삭제 (이 PoC 테이블만) */
export function deleteAllBodySessions(): number {
  for (const r of bodySessions.list({ limit: 500 })) kvDelete(outfitKey(r.id));
  return bodySessions.deleteAll();
}

/* ------------------------------------------------------------------ 데모 */

/** 도식 그림 + 합성 랜드마크로 만든 데모 세션 (isMock=true). 카메라/사진 없이 전체 경로 확인용 */
export async function createDemoBodySession(): Promise<{ session: BodySession; outfit: OutfitMeta | null }> {
  const rec = await saveUploadFromDataUrl(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoFigureSvg())}`, { kind: 'body' });
  const image = { ...toImageRef(rec), width: DEMO_W, height: DEMO_H };
  const measured = computeBodyAnalysis({
    landmarks: demoLandmarks(),
    imageWidth: DEMO_W,
    imageHeight: DEMO_H,
    face: demoFace(),
    mask: demoMask(),
    image,
    fromUpload: true,
  });
  const analysis: BodyAnalysis = { ...measured, source: 'mock', isMock: true };
  const colors: OutfitColors = {
    top: { hex: DEMO_PALETTE.top, nameKo: colorNameKo(DEMO_PALETTE.top), samples: 0 },
    bottom: { hex: DEMO_PALETTE.bottom, nameKo: colorNameKo(DEMO_PALETTE.bottom), samples: 0 },
  };
  // 데모 이미지는 도식이라 AI 서술을 하지 않고 색 요약만 둔다
  const outfit: OutfitMeta = { source: 'mock', model: null, warning: '데모 도식 이미지입니다. 실제 사진으로 측정하면 결과가 바뀝니다.', colors, detail: mockOutfit(colors) };
  const { session } = await saveBodySession({ ...analysis, outfitDescription: outfitDescriptionText(outfit) }, { label: '데모 데이터', describeOutfit: false });
  kvSet(outfitKey(session.id), outfit);
  return { session, outfit };
}
