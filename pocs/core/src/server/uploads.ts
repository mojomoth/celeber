/**
 * 업로드/캐시 이미지 저장과 서빙. 파일: <dataDir>/uploads/<id>.<ext>, 메타: uploads 테이블.
 * - 래스터 이미지는 sharp로 EXIF 회전 보정 + sRGB 변환(Display P3 등 → sRGB) + 최대 변 제한
 * - sha256 + kind 동일하면 기존 레코드 재사용 (중복 제거)
 */
import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { ImageRef, UploadKind, UploadRecord } from '../contracts';
import { UploadKindSchema } from '../contracts';
import { dataDir, getDb, newId, nowIso } from './db';
import { jsonError } from './http';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** 저장 시 최대 변 길이(px). 분석 정밀도와 용량의 절충 */
export const MAX_STORED_EDGE = 2560;
/** sharp 디코드 픽셀 상한 (약 40MP). 작은 PNG가 16000×16000을 선언해 1GB를 디코드하는 것을 막는다 */
export const MAX_INPUT_PIXELS = 40_000_000;
/** SVG를 받지 않는 kind. 얼굴·조명 분석은 실제 사진이어야 한다 */
const RASTER_ONLY_KINDS: ReadonlySet<UploadKind> = new Set(['face-front', 'face-side', 'environment']);

/** 사용자에게 그대로 보여 줄 수 있는 업로드 오류 (한국어 문구 + HTTP 상태) */
export class UploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export const UPLOAD_MESSAGES = {
  tooLarge: `이미지가 너무 큽니다 (최대 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB).`,
  tooManyPixels: `사진 해상도가 약 ${Math.round(MAX_INPUT_PIXELS / 10_000_000) * 1000}만 화소를 넘습니다. 크기를 줄여서 다시 올려 주세요.`,
  unsupported: '지원하지 않는 이미지 형식입니다. JPEG, PNG, WebP 사진을 올려 주세요.',
  svgNotAllowed: '얼굴·조명 분석에는 실제 사진이 필요합니다. JPEG, PNG, WebP 사진을 올려 주세요.',
  unreadable: '사진 파일을 읽지 못했습니다. 파일이 손상됐을 수 있습니다. 다른 사진으로 다시 올려 주세요.',
  heic: '이 HEIC 사진은 열 수 없습니다. JPEG로 바꿔서 올려 주세요.',
  bodyUnreadable: '사진 파일을 끝까지 읽지 못했습니다. 25MB 이하의 사진으로 다시 시도해 주세요.',
  failed: '사진을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
} as const;

/** sharp/libvips 디코드 오류 → UploadError (영문 원문을 사용자에게 내보내지 않는다) */
function decodeError(e: unknown, mime: string | null): UploadError {
  const msg = e instanceof Error ? e.message : String(e);
  if (/pixel limit/i.test(msg)) return new UploadError(422, 'too_many_pixels', UPLOAD_MESSAGES.tooManyPixels);
  if (mime === 'image/heic' || /heif/i.test(msg)) return new UploadError(422, 'unreadable', UPLOAD_MESSAGES.heic);
  return new UploadError(422, 'unreadable', UPLOAD_MESSAGES.unreadable);
}

const ID_RE = /^up_[a-z0-9]+$/;
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
  'image/avif': 'avif',
};

export function uploadsDir(): string {
  const d = path.join(dataDir(), 'uploads');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
export const uploadUrl = (id: string): string => `/api/uploads/${id}`;

/** 매직 바이트로 이미지 MIME 판별 (확장자/헤더 신뢰 안 함) */
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  const ftyp = buf.toString('ascii', 4, 12);
  if (ftyp.startsWith('ftyp')) {
    const brand = ftyp.slice(4);
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc'].includes(brand)) return 'image/heic';
    if (['avif', 'avis'].includes(brand)) return 'image/avif';
  }
  const head = buf.toString('utf8', 0, Math.min(buf.length, 512)).trimStart();
  if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'image/svg+xml';
  return null;
}

interface UploadRow {
  id: string;
  created_at: string;
  kind: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  sha256: string;
  source_url: string | null;
  file_name: string;
}
const toRecord = (r: UploadRow): UploadRecord => ({
  id: r.id,
  createdAt: r.created_at,
  kind: UploadKindSchema.catch('other').parse(r.kind),
  mime: r.mime,
  bytes: Number(r.bytes),
  width: r.width === null ? null : Number(r.width),
  height: r.height === null ? null : Number(r.height),
  sha256: r.sha256,
  sourceUrl: r.source_url,
  url: uploadUrl(r.id),
});

export interface SaveUploadOptions {
  kind: UploadKind;
  /** 외부 원본 URL (캐시 시) */
  sourceUrl?: string;
  /** 회전/sRGB/리사이즈 정규화 (기본 true, SVG는 항상 원본 저장) */
  normalize?: boolean;
  /** 정규화 시 최대 변 (기본 MAX_STORED_EDGE) */
  maxEdge?: number;
}

/** 이미지 버퍼 저장 → UploadRecord. 이미지가 아니거나 디코드할 수 없으면 UploadError. */
export async function saveUpload(input: Buffer | Uint8Array | ArrayBuffer, opts: SaveUploadOptions): Promise<UploadRecord> {
  let buf: Buffer = Buffer.isBuffer(input) ? input : Buffer.from(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
  if (buf.length > MAX_UPLOAD_BYTES) throw new UploadError(413, 'too_large', UPLOAD_MESSAGES.tooLarge);
  let mime = sniffImageMime(buf);
  if (!mime) throw new UploadError(400, 'unsupported_type', UPLOAD_MESSAGES.unsupported);
  let width: number | null = null;
  let height: number | null = null;

  if (mime === 'image/svg+xml') {
    if (RASTER_ONLY_KINDS.has(opts.kind)) throw new UploadError(422, 'svg_not_allowed', UPLOAD_MESSAGES.svgNotAllowed);
    // 원본을 그대로 저장하지만, 깨진 XML이 저장된 뒤 분석 단계에서 500이 되지 않도록 여기서 파싱해 본다.
    // 크기 선언이 큰 SVG(목업 등)는 렌더하지 않으므로 픽셀 상한은 걸지 않는다.
    try {
      await sharp(buf, { limitInputPixels: false }).metadata();
    } catch (e) {
      throw decodeError(e, mime);
    }
  } else {
    try {
      ({ buf, mime, width, height } = await normalizeRaster(buf, mime, opts));
    } catch (e) {
      throw decodeError(e, mime);
    }
  }
  return storeUpload(buf, mime, width, height, opts);
}

/** 래스터: EXIF 회전 + sRGB + 최대 변 제한 (normalize=false면 크기만 읽는다) */
async function normalizeRaster(buf: Buffer, mime: string, opts: SaveUploadOptions): Promise<{ buf: Buffer; mime: string; width: number | null; height: number | null }> {
  const img = sharp(buf, { failOn: 'none', limitInputPixels: MAX_INPUT_PIXELS });
  if (!(opts.normalize ?? true)) {
    const meta = await img.metadata();
    return { buf, mime, width: meta.width ?? null, height: meta.height ?? null };
  }
  const maxEdge = opts.maxEdge ?? MAX_STORED_EDGE;
  const outPng = mime === 'image/png' || mime === 'image/gif';
  const pipeline = img.rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).toColorspace('srgb');
  const { data, info } = await (outPng ? pipeline.png() : pipeline.jpeg({ quality: 92, chromaSubsampling: '4:4:4' })).toBuffer({ resolveWithObject: true });
  return { buf: data, mime: outPng ? 'image/png' : 'image/jpeg', width: info.width, height: info.height };
}

function storeUpload(buf: Buffer, mime: string, width: number | null, height: number | null, opts: SaveUploadOptions): UploadRecord {
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const db = getDb();
  const existing = db.prepare('SELECT * FROM uploads WHERE sha256 = ? AND kind = ? LIMIT 1').get(sha256, opts.kind) as UploadRow | undefined;
  if (existing && fs.existsSync(path.join(uploadsDir(), existing.file_name))) return toRecord(existing);

  const id = newId('up');
  const fileName = `${id}.${EXT[mime] ?? 'bin'}`;
  fs.writeFileSync(path.join(uploadsDir(), fileName), buf);
  const row: UploadRow = {
    id,
    created_at: nowIso(),
    kind: opts.kind,
    mime,
    bytes: buf.length,
    width,
    height,
    sha256,
    source_url: opts.sourceUrl ?? null,
    file_name: fileName,
  };
  db.prepare(
    'INSERT INTO uploads (id, created_at, kind, mime, bytes, width, height, sha256, source_url, file_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(row.id, row.created_at, row.kind, row.mime, row.bytes, row.width, row.height, row.sha256, row.source_url, row.file_name);
  return toRecord(row);
}

/** data URL(base64) 저장 — 클라이언트 canvas.toDataURL() 결과 */
export async function saveUploadFromDataUrl(dataUrl: string, opts: SaveUploadOptions): Promise<UploadRecord> {
  const m = /^data:([\w/+.-]+);base64,(.*)$/s.exec(dataUrl);
  if (m) return saveUpload(Buffer.from(m[2], 'base64'), opts);
  const svg = /^data:image\/svg\+xml(?:;charset=[\w-]+)?,(.*)$/s.exec(dataUrl);
  if (svg) return saveUpload(Buffer.from(decodeURIComponent(svg[1]), 'utf8'), opts);
  throw new UploadError(400, 'bad_request', '사진 데이터(data URL) 형식이 올바르지 않습니다.');
}

export function getUpload(id: string): UploadRecord | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare('SELECT * FROM uploads WHERE id = ?').get(id) as UploadRow | undefined;
  return r ? toRecord(r) : null;
}
/** 같은 원본 URL의 캐시 사본 */
export function findUploadBySourceUrl(sourceUrl: string): UploadRecord | null {
  const r = getDb().prepare('SELECT * FROM uploads WHERE source_url = ? ORDER BY created_at DESC LIMIT 1').get(sourceUrl) as UploadRow | undefined;
  return r ? toRecord(r) : null;
}

export function readUpload(id: string): { record: UploadRecord; buffer: Buffer } | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare('SELECT * FROM uploads WHERE id = ?').get(id) as UploadRow | undefined;
  if (!r) return null;
  const p = path.join(uploadsDir(), r.file_name);
  if (!fs.existsSync(p)) return null;
  return { record: toRecord(r), buffer: fs.readFileSync(p) };
}

export function deleteUpload(id: string): boolean {
  if (!ID_RE.test(id)) return false;
  const r = getDb().prepare('SELECT file_name FROM uploads WHERE id = ?').get(id) as { file_name: string } | undefined;
  if (!r) return false;
  fs.rmSync(path.join(uploadsDir(), r.file_name), { force: true });
  getDb().prepare('DELETE FROM uploads WHERE id = ?').run(id);
  return true;
}

/** UploadRecord → 계약 ImageRef */
export function toImageRef(r: UploadRecord): ImageRef {
  return {
    uploadId: r.id,
    url: r.url,
    ...(r.width ? { width: r.width } : {}),
    ...(r.height ? { height: r.height } : {}),
    ...(r.sourceUrl ? { sourceUrl: r.sourceUrl } : {}),
  };
}

/** GET /api/uploads/[id] 구현 */
export function serveUpload(id: string, req?: Request): Response {
  const f = readUpload(id);
  if (!f) return jsonError(404, 'not_found', '이미지를 찾을 수 없습니다.');
  const etag = `"${f.record.sha256.slice(0, 32)}"`;
  if (req?.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  const headers: Record<string, string> = {
    'Content-Type': f.record.mime,
    'Content-Length': String(f.buffer.length),
    'Cache-Control': 'private, max-age=31536000, immutable',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
  };
  // SVG 내 스크립트 실행 방지
  if (f.record.mime === 'image/svg+xml') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  return new Response(new Uint8Array(f.buffer), { status: 200, headers });
}

/**
 * POST /api/uploads 구현: multipart/form-data { file: File, kind?: UploadKind }
 * 또는 JSON { dataUrl: string, kind?: UploadKind } → UploadRecord JSON
 */
/** 업로드 요청 본문 상한: 25MB 이미지의 base64(×4/3) + 여유 */
export const MAX_UPLOAD_BODY_BYTES = Math.ceil(MAX_UPLOAD_BYTES * 1.4) + 1024 * 1024;
class BodyTooLargeError extends Error {}

/** 본문을 상한까지만 읽는다. Content-Length가 크면 읽기 전에, 스트림이 상한을 넘으면 그 즉시 중단 */
export async function readBodyCapped(req: Request, max = MAX_UPLOAD_BODY_BYTES): Promise<Uint8Array> {
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > max) throw new BodyTooLargeError();
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

export async function handleUploadPost(req: Request, defaultKind: UploadKind = 'other'): Promise<Response> {
  try {
    const ct = req.headers.get('content-type') ?? '';
    let bytes: Uint8Array;
    try {
      bytes = await readBodyCapped(req);
    } catch (e) {
      if (e instanceof BodyTooLargeError) return jsonError(413, 'too_large', UPLOAD_MESSAGES.tooLarge);
      return jsonError(400, 'upload_failed', UPLOAD_MESSAGES.bodyUnreadable);
    }
    if (ct.includes('application/json')) {
      let body: { dataUrl?: string; kind?: string };
      try {
        body = JSON.parse(new TextDecoder().decode(bytes)) as typeof body;
      } catch {
        return jsonError(400, 'invalid_json', '요청 본문이 JSON이 아닙니다.');
      }
      if (!body?.dataUrl) return jsonError(400, 'bad_request', 'dataUrl이 필요합니다.');
      const kind = UploadKindSchema.catch(defaultKind).parse(body.kind ?? defaultKind);
      return Response.json(await saveUploadFromDataUrl(body.dataUrl, { kind }));
    }
    let form: FormData;
    try {
      form = await new Response(bytes as BodyInit, { headers: { 'content-type': ct } }).formData();
    } catch {
      // 런타임 원문('Failed to parse body as FormData.')을 내보내지 않는다. 대개 본문이 잘린 경우다
      return jsonError(400, 'upload_failed', UPLOAD_MESSAGES.bodyUnreadable);
    }
    const file = form.get('file');
    if (!(file instanceof Blob)) return jsonError(400, 'bad_request', "'file' 필드가 필요합니다.");
    if (file.size > MAX_UPLOAD_BYTES) return jsonError(413, 'too_large', UPLOAD_MESSAGES.tooLarge);
    const kind = UploadKindSchema.catch(defaultKind).parse(String(form.get('kind') ?? defaultKind));
    const rec = await saveUpload(Buffer.from(await file.arrayBuffer()), { kind });
    return Response.json(rec);
  } catch (e) {
    if (e instanceof UploadError) return jsonError(e.status, e.code, e.message);
    console.error('[celeber] upload error', e);
    return jsonError(500, 'upload_failed', UPLOAD_MESSAGES.failed);
  }
}

/**
 * 분석용 픽셀 읽기 (서버): RGBA raw + 크기. maxEdge로 다운스케일.
 * core/face sampleFaceColors 등 ImageDataLike 입력으로 바로 사용 가능.
 * 업로드가 없거나 디코드할 수 없으면(깨진 파일, 픽셀 상한 초과) null. 호출부는 null을 422 등으로 바꾼다.
 */
export async function readUploadPixels(id: string, maxEdge = 1024): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  const f = readUpload(id);
  if (!f) return null;
  try {
    const { data, info } = await sharp(f.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
      .toColorspace('srgb')
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
  } catch {
    return null;
  }
}
