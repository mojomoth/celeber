/**
 * 사진 올리기 전 검사와 업로드 오류 문구 (브라우저용, 순수 함수).
 * 서버(core /api/uploads)가 보내는 영어 원문 오류(FormData 파싱 실패, libheif 등)를 화면에 그대로 보이지 않게 한다.
 */

/** core MAX_UPLOAD_BYTES와 같은 값 */
export const MAX_UPLOAD_MB = 25;
export const UPLOAD_MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;
const HINT = 'JPEG·PNG·WebP 사진을 올려 주세요.';

/** MIME·확장자 → 사용자에게 보일 형식 이름 */
function formatLabel(type: string, name: string): string {
  const t = type.toLowerCase();
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (t === 'application/pdf' || ext === 'pdf') return 'PDF 파일';
  if (t === 'image/heic' || t === 'image/heif' || ext === 'heic' || ext === 'heif') return 'HEIC 사진';
  if (t === 'image/gif' || ext === 'gif') return 'GIF 파일';
  if (t === 'image/svg+xml' || ext === 'svg') return 'SVG 파일';
  if (t === 'image/avif' || ext === 'avif') return 'AVIF 사진';
  if (t.startsWith('video/')) return '동영상';
  if (t.startsWith('text/') || ext === 'txt') return '텍스트 파일';
  return '이 형식의 파일';
}

/** 올리기 전 검사. 문제가 없으면 null */
export function checkUploadFile(file: { name: string; type: string; size: number }): string | null {
  const okType = file.type ? ALLOWED.has(file.type.toLowerCase()) : ALLOWED_EXT.test(file.name);
  if (!okType) return `${formatLabel(file.type, file.name)}은 올릴 수 없습니다. ${HINT}`;
  if (file.size > UPLOAD_MAX_BYTES) return `사진이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB). ${MAX_UPLOAD_MB}MB 이하 사진을 올려 주세요.`;
  if (file.size === 0) return `빈 파일입니다. ${HINT}`;
  return null;
}

/** 업로드 오류 → 사용자 문구. 서버의 한국어 안내는 살리고, 영어 원문·내부 형식 목록은 바꾼다 */
export function friendlyUploadError(message: string): string {
  const m = message.trim();
  // 용량이 작아도 해상도(약 4000만 화소)에 걸릴 수 있다: 용량 문구가 아니라 해상도를 줄이라고 안내한다
  if (/pixel limit|too_many_pixels/i.test(m)) return '사진 해상도가 너무 큽니다. 가로·세로 크기를 줄여서(약 4000만 화소 이하) 다시 올려 주세요.';
  if (/너무 큽니다|too large|exceeded|FormData/i.test(m)) return `사진이 너무 큽니다. ${MAX_UPLOAD_MB}MB 이하 사진을 올려 주세요.`;
  if (/지원하지 않는 이미지 형식|unsupported|heif|heic|bad seek|Input buffer|Input file/i.test(m)) return `사진 파일을 읽지 못했습니다. ${HINT}`;
  if (!/[가-힣]/.test(m)) return `사진을 올리지 못했습니다. 잠시 뒤 다시 시도하거나 다른 사진을 올려 주세요.`;
  return m;
}
