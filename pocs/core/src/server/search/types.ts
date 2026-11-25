/**
 * 이미지 검색 / 역이미지 검색 프로바이더 인터페이스.
 */
import type { ImageProviderId } from '../../contracts';
export type { ImageProviderId } from '../../contracts';

export interface ImageSearchQuery {
  /** 검색어 (예: '홍길동 공항패션 전신') */
  query: string;
  /** 원하는 결과 수 (기본 20, 최대 100) */
  count?: number;
  /** 큰 이미지 우선 (기본 true) */
  large?: boolean;
}

export interface ImageSearchResult {
  provider: ImageProviderId;
  /** 원본 이미지 URL (Mock은 data: URL) */
  imageUrl: string;
  thumbnailUrl?: string;
  /** 이미지가 실린 페이지 (출처 링크) */
  pageUrl?: string;
  title?: string;
  /** 출처 사이트 이름 */
  source?: string;
  width?: number;
  height?: number;
}

export interface ImageSearchProvider {
  id: ImageProviderId;
  searchImages(q: ImageSearchQuery): Promise<ImageSearchResult[]>;
}

export interface ReverseImageMatch {
  title: string;
  link?: string;
  source?: string;
  thumbnailUrl?: string;
}

export interface ReverseImageSearchResult {
  provider: 'serpapi-lens' | 'mock';
  /** unavailable: 키 없음/공개 URL 없음 → 이름 검색 안내 */
  status: 'ok' | 'unavailable' | 'error';
  reason?: string;
  /** 지식 그래프 항목 (인물명이 나올 수 있음 — 후보로만 사용, 사용자 확인 필수) */
  knowledgeGraph: { title: string; subtitle?: string; link?: string; thumbnailUrl?: string }[];
  /** 시각적으로 유사한 페이지들 (제목 텍스트에서 이름 후보 추출) */
  visualMatches: ReverseImageMatch[];
}

export interface ReverseImageSearchProvider {
  id: 'serpapi-lens' | 'mock';
  /** imageUrl은 외부에서 접근 가능한 공개 URL이어야 한다 */
  reverseSearch(input: { imageUrl: string }): Promise<ReverseImageSearchResult>;
}
