/**
 * 사진 올리기 전 확인과 실패 문구 (브라우저용, 순수 함수).
 * 한도는 core의 MAX_UPLOAD_BYTES(서버 전용 모듈)와 같은 값이다. 테스트에서 두 값이 같은지 확인한다.
 */
import { CelebApiError } from './api';

export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_PHOTO_MB = MAX_PHOTO_BYTES / 1024 / 1024;

/** 올리기 전에 막을 사유. 문제가 없으면 null */
export function photoFileProblem(file: { size: number; type: string }): string | null {
  if (file.type && !file.type.startsWith('image/')) return '사진 파일이 아닙니다. JPEG·PNG·WebP 사진을 올려 주세요.';
  if (file.size > MAX_PHOTO_BYTES) return `사진이 너무 큽니다. ${MAX_PHOTO_MB}MB 이하 사진을 올려 주세요.`;
  if (file.size === 0) return '빈 파일입니다. 다른 사진을 올려 주세요.';
  return null;
}

const HANGUL = /[가-힣]/;

/** 업로드/식별 실패 → 사용자 문구. 서버가 한국어로 준 사유는 그대로 쓰고, 영어 내부 오류는 감춘다 */
export function photoErrorMessage(stage: 'upload' | 'identify', e: unknown): string {
  if (e instanceof CelebApiError && e.status === 413) return `사진이 너무 큽니다. ${MAX_PHOTO_MB}MB 이하 사진을 올려 주세요.`;
  const msg = e instanceof Error ? e.message.trim() : '';
  if (stage === 'upload') return HANGUL.test(msg) ? `사진을 올리지 못했습니다. ${msg}` : '사진을 올리지 못했습니다. 다시 시도하거나 다른 사진을 올려 주세요.';
  return HANGUL.test(msg) ? `사진에서 단서를 찾지 못했습니다. ${msg}` : '사진에서 단서를 찾는 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.';
}
