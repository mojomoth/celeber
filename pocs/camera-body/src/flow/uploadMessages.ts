/**
 * 전신 사진 업로드 전 검사, 업로드 오류 문구, 분석 중 안내 (순수 함수).
 * 화면은 JPEG·PNG·WebP만 받는다. 서버(core) 문구는 더 넓은 형식을 나열하거나 Next 영문 원문이 올 수 있어 여기서 바꾼다.
 */

/** core MAX_UPLOAD_BYTES와 같은 값 */
export const BODY_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const BODY_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const UPLOAD_TYPE_MESSAGE = 'JPEG, PNG, WebP 사진만 올릴 수 있습니다.';
export const UPLOAD_HEIC_MESSAGE = 'HEIC 사진은 올릴 수 없습니다. JPEG로 변환해 올려 주세요.';
export const UPLOAD_TOO_LARGE_MESSAGE = '사진이 너무 큽니다. 25MB 이하로 올려 주세요.';
export const UPLOAD_FAILED_MESSAGE = '사진을 올리지 못했습니다. 다른 사진으로 다시 시도해 주세요.';

interface FileLike {
  name: string;
  type: string;
  size: number;
}

const isHeic = (f: FileLike) => /heic|heif/i.test(`${f.type} ${f.name}`);

/** 올리기 전에 거를 수 있는 파일이면 사유를, 아니면 null */
export function precheckBodyUpload(f: FileLike): string | null {
  if (isHeic(f)) return UPLOAD_HEIC_MESSAGE;
  // 형식을 알 수 없는 파일(type '')은 서버 판정에 맡긴다
  if (f.type && !(BODY_UPLOAD_TYPES as readonly string[]).includes(f.type)) return UPLOAD_TYPE_MESSAGE;
  if (f.size > BODY_UPLOAD_MAX_BYTES) return UPLOAD_TOO_LARGE_MESSAGE;
  return null;
}

/** 서버 업로드 오류 → 화면 문구 */
export function bodyUploadErrorMessage(status: number, serverMessage: string, f: FileLike): string {
  if (status === 413) return UPLOAD_TOO_LARGE_MESSAGE;
  if (/지원하지 않는|unsupported/i.test(serverMessage)) return isHeic(f) ? UPLOAD_HEIC_MESSAGE : UPLOAD_TYPE_MESSAGE;
  // 한글이 없는 원문(Next 내부 오류 등)은 그대로 보이지 않는다
  if (!/[가-힣]/.test(serverMessage)) return UPLOAD_FAILED_MESSAGE;
  return serverMessage;
}

/** 분석 중 안내: 비율은 기기에서 재고, 코디 서술을 켜면 저장할 때 사진이 AI 서비스로 간다 */
export function analyzingNote(describeOutfit: boolean, persist: boolean): string {
  if (!persist) return '비율은 기기에서 잽니다.';
  return describeOutfit ? '비율은 기기에서 잽니다. 저장할 때 코디 서술을 위해 사진을 AI 서비스로 보냅니다.' : '비율은 기기에서 잽니다. 저장하면 사진과 결과가 남습니다.';
}
