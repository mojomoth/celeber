/**
 * SSRF 방어 외부 이미지 다운로드 + 캐시.
 * - http/https만, 사용자 정보(user:pass@) 금지, 포트 80/443만
 * - DNS 해석 결과가 사설/루프백/링크로컬/멀티캐스트/예약 대역이면 차단
 * - 해석된 IP로 연결을 고정(lookup 훅)하여 DNS 리바인딩 방지, 리다이렉트도 매번 재검증(최대 3회)
 * - 크기 제한(스트리밍 중 초과 시 중단), 타임아웃, 이미지 매직바이트 확인
 */
import 'server-only';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { UploadKind, UploadRecord } from '../contracts';
import { findUploadBySourceUrl, saveUpload, saveUploadFromDataUrl, sniffImageMime } from './uploads';

export class UnsafeUrlError extends Error {}

/** 사설/특수 IP 여부 (IPv4, IPv6, IPv4-mapped IPv6) */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 169 && b === 254) return true; // link-local / 메타데이터
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true; // 192.0.0.0/24, 192.0.2.0/24
    if (a === 198 && (b === 18 || b === 19)) return true; // 벤치마크
    if (a === 198 && b === 51) return true;
    if (a === 203 && b === 0) return true;
    if (a >= 224) return true; // 멀티캐스트/예약/브로드캐스트
    return false;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v)) return true; // 16진 매핑 표기는 보수적으로 차단
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // ULA
    if (/^fe[89ab]/.test(v)) return true; // link-local
    if (v.startsWith('ff')) return true; // 멀티캐스트
    if (v.startsWith('2001:db8')) return true; // 문서용
    if (v.startsWith('64:ff9b')) return true; // NAT64
    return false;
  }
  return true;
}

/** URL 형식 사전 검증 (DNS 전) */
export function assertSafeUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UnsafeUrlError('URL 형식이 올바르지 않습니다.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UnsafeUrlError('http(s) URL만 허용됩니다.');
  if (u.username || u.password) throw new UnsafeUrlError('인증 정보가 포함된 URL은 허용되지 않습니다.');
  if (u.port && u.port !== '80' && u.port !== '443') throw new UnsafeUrlError('기본 포트(80/443)만 허용됩니다.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new UnsafeUrlError('내부 호스트는 허용되지 않습니다.');
  if (net.isIP(host) && isPrivateIp(host)) throw new UnsafeUrlError('사설 IP 주소는 허용되지 않습니다.');
  return u;
}

/** 해석된 주소를 검증하는 lookup (연결 시점에 적용 → 리바인딩 방지) */
const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = (Array.isArray(addresses) ? addresses : [addresses]) as dns.LookupAddress[];
    const bad = list.find((a) => isPrivateIp(a.address));
    if (bad || list.length === 0) return callback(new UnsafeUrlError(`차단된 주소로 해석됩니다: ${hostname}`), '', 0);
    if ((options as dns.LookupOptions).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export interface FetchImageOptions {
  /** 최대 바이트 (기본 15MB) */
  maxBytes?: number;
  /** 전체 타임아웃 ms (기본 12초) */
  timeoutMs?: number;
  /** 최대 리다이렉트 (기본 3) */
  maxRedirects?: number;
  /** Referer 등 추가 헤더 */
  headers?: Record<string, string>;
}

export interface FetchedImage {
  buffer: Buffer;
  mime: string;
  finalUrl: string;
}

function requestOnce(u: URL, opts: Required<Pick<FetchImageOptions, 'maxBytes' | 'timeoutMs'>> & { headers?: Record<string, string> }): Promise<{ status: number; location?: string; buffer?: Buffer; contentType?: string }> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      u,
      {
        method: 'GET',
        lookup: safeLookup,
        timeout: opts.timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; CeleberPoC/0.1; image-cache)',
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
          ...opts.headers,
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, location: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return resolve({ status });
        }
        const len = Number(res.headers['content-length'] ?? 0);
        if (len && len > opts.maxBytes) {
          res.destroy();
          return reject(new Error('이미지가 너무 큽니다.'));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            res.destroy(new Error('이미지가 너무 큽니다.'));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status, buffer: Buffer.concat(chunks), contentType: String(res.headers['content-type'] ?? '') }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('이미지 다운로드 시간 초과')));
    req.on('error', reject);
    req.end();
  });
}

/** 외부 이미지 안전 다운로드 */
export async function fetchImageSafe(rawUrl: string, options: FetchImageOptions = {}): Promise<FetchedImage> {
  const maxBytes = options.maxBytes ?? 15 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 12_000;
  const maxRedirects = options.maxRedirects ?? 3;
  let u = assertSafeUrl(rawUrl);
  for (let i = 0; i <= maxRedirects; i++) {
    const r = await requestOnce(u, { maxBytes, timeoutMs, headers: options.headers });
    if (r.location) {
      u = assertSafeUrl(new URL(r.location, u).toString());
      continue;
    }
    if (r.status !== 200 || !r.buffer) throw new Error(`이미지를 가져오지 못했습니다 (HTTP ${r.status}).`);
    const mime = sniffImageMime(r.buffer);
    if (!mime) throw new Error('이미지 형식이 아닙니다.');
    return { buffer: r.buffer, mime, finalUrl: u.toString() };
  }
  throw new Error('리다이렉트가 너무 많습니다.');
}

/**
 * 외부 이미지(또는 data: URL)를 서버에 캐시하고 UploadRecord 반환. 같은 URL은 재사용.
 * 검색 결과 이미지는 핫링크 대신 이 함수로 받은 /api/uploads/<id>를 표시한다.
 */
export async function cacheRemoteImage(url: string, opts: { kind?: UploadKind; fetch?: FetchImageOptions } = {}): Promise<UploadRecord> {
  const kind = opts.kind ?? 'celeb-search-cache';
  if (url.startsWith('data:')) return saveUploadFromDataUrl(url, { kind });
  const hit = findUploadBySourceUrl(url);
  if (hit) return hit;
  const img = await fetchImageSafe(url, opts.fetch);
  return saveUpload(img.buffer, { kind, sourceUrl: url });
}
