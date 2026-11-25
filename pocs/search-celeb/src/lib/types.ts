/**
 * search-celeb API 요청/응답 형태 (클라이언트/서버 공용 타입).
 * 저장 형태(CelebProfile, CelebImage, CelebCandidate)는 @celeber/core/contracts 계약을 그대로 쓴다.
 */
import type { CelebCandidate, CelebImage, CelebImageCategory, CelebProfile, ImageProviderId, ImageRef } from '@celeber/core/contracts';

/** 결과 출처 표시: rules = 규칙/DB, ai = Claude, mock = 데모 */
export type ResultOrigin = 'rules' | 'ai' | 'mock';

/** 후보 + DB 연결 정보 */
export interface CandidateItem extends CelebCandidate {
  /** 이미 celebs 테이블에 있는 인물이면 id */
  celebId?: string;
  saved?: boolean;
}

/** GET /api/celeb/suggest?q= (자동완성: DB + 데모 인물, 외부 호출 없음) */
export interface SuggestResponse {
  query: string;
  items: CandidateItem[];
}

/** GET /api/celeb/search?q= (이름 검색: DB + AI 후보 + 입력 이름, 썸네일 포함) */
export interface SearchResponse {
  query: string;
  candidates: CandidateItem[];
  /** 후보 생성 방식 */
  origin: ResultOrigin;
  isMock: boolean;
  /** 썸네일 이미지 프로바이더 */
  imageProvider: ImageProviderId;
  warning?: string;
  notices: string[];
}

export type PhotoFraming = 'full-body' | 'upper-body' | 'face-closeup' | 'no-person' | 'unknown';

/** POST /api/celeb/identify { uploadId } (사진으로 후보 찾기 — 얼굴 인식 없음) */
export interface IdentifyResponse {
  upload: ImageRef;
  reverse: {
    provider: 'serpapi-lens' | 'mock';
    status: 'ok' | 'unavailable' | 'error';
    reason?: string;
    knowledgeGraphCount: number;
    visualMatchCount: number;
  };
  /** 사진 속 글자(캡션·이름표·워터마크) */
  photoText: { texts: string[]; origin: ResultOrigin; warning?: string };
  /** 사진 구도 확인 (추구미 분석에 바로 쓸 수 있는지 참고) */
  photoCheck: { framing: PhotoFraming; personCount: number | null; note: string; origin: ResultOrigin };
  candidates: CandidateItem[];
  /** 사진 단서로 후보를 찾지 못했거나 데모 후보만 있음 → 이름 검색 안내 */
  needsNameSearch: boolean;
  isMock: boolean;
  notices: string[];
}

/** POST /api/celeb/celebs { candidate } → 확정한 인물 */
export interface ConfirmCelebRequest {
  candidate: CelebCandidate;
}

export interface CelebSummary {
  celeb: CelebProfile;
  imageCount: number;
  selectedCount: number;
}

/** GET /api/celeb/celebs/[id] */
export interface CelebDetailResponse {
  celeb: CelebProfile;
  images: Record<CelebImageCategory, CelebImage[]>;
}

/** POST /api/celeb/celebs/[id]/images { category, refresh? } */
export interface CollectImagesResponse {
  celebId: string;
  category: CelebImageCategory;
  images: CelebImage[];
  queries: string[];
  added: number;
  failed: number;
  provider: ImageProviderId;
  /** 전신/분석 가능 판정 방식 */
  judge: { origin: ResultOrigin; warning?: string };
  isMock: boolean;
  notices: string[];
}

/** 재사용 플로우 완료 결과 (celeb-vibe-report 등이 사용) */
export interface CelebSearchResult {
  celeb: CelebProfile;
  /** 사용자가 고른 전신 사진 (DB selected=true) */
  selectedImages: CelebImage[];
  /** 사진으로 찾은 경우 사용자가 올린 원본 사진 */
  uploadedPhoto?: ImageRef;
}
