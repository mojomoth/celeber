/**
 * 가이드 계산 입력/출력 타입 (클라이언트·서버 공용).
 * 저장 형태는 core 계약 VibeGuide를 그대로 쓴다.
 */
import type { ImageRef, PersonalColorReport, Tone, VibeAnalysis, VibeGuide } from '@celeber/core/contracts';

/** 내 전신 비율 (personal-color-report 리포트의 body_sessions에서 꺼낸 값) */
export interface MyBodyRatios {
  headsTall?: number;
  legToHeight?: number;
  upperToLower?: number;
  shoulderToHip?: number;
  frameLabel?: string;
}

/** 가이드 한 건을 만드는 데 필요한 입력 */
export interface GuideContext {
  report: PersonalColorReport;
  vibe: VibeAnalysis;
  /** 내 전신 측정 (없으면 body-ratio 갭은 unavailable) */
  myBody?: MyBodyRatios | null;
}

/** 규칙으로 만든 가이드 본문 (id·저장 메타 제외) */
export type GuideDraft = Omit<VibeGuide, 'id' | 'version' | 'createdAt' | 'updatedAt' | 'saved' | 'source' | 'isMock'>;

/** 저장 목록 행: 썸네일 · 이름 · 룩 이름 순으로 표시 */
export interface GuideSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  celebName: string;
  lookName: string;
  thumbnail?: ImageRef;
  saved: boolean;
  isMock: boolean;
  source: VibeGuide['source'];
  reportId: string;
  vibeAnalysisId: string;
  /** 내 팔레트로 바꾼 색 (최대 5) */
  myColors: string[];
  /** 연예인 팔레트 (최대 5) */
  celebColors: string[];
}

/** 가이드 화면 머리말용 내 리포트 요약 */
export interface MyReportBrief {
  id: string;
  tone: Tone;
  nameKo: string;
  nameEn: string;
  accentHex: string;
  createdAt: string;
  thumbnail?: ImageRef;
  /** 내 베스트 컬러 (스와치 행) */
  best: { hex: string; name: string }[];
  isMock: boolean;
  hasBody: boolean;
}
