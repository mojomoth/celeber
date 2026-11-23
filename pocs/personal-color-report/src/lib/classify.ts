/**
 * 측정값 → 퍼스널컬러 분류.
 *
 * 앱 단 보정(대비 범위 ΔL* 35→85, 헤어/눈 L* 하한 8)은 통합 단계에서 core로 승격했다:
 * `@celeber/core/personal-color`의 PHOTO_CLASSIFIER_OPTIONS / classifyMeasuredColors.
 * celeb-vibe(연예인 사진)도 같은 프리셋을 써서 추구미 가이드의 5축 갭이 같은 척도로 비교된다.
 * 이 파일은 기존 import 경로 호환을 위해 이름을 유지한다.
 */
import type { FaceAnalysis, PersonalColorClassification } from '@celeber/core/contracts';
import { type ClassifierOptions, classifyMeasuredColors, DARK_FEATURE_L_FLOOR, PHOTO_CLASSIFIER_OPTIONS } from '@celeber/core/personal-color';

/** 이 앱이 core 분류기에 넘기는 보정 옵션 (= core PHOTO_CLASSIFIER_OPTIONS) */
export const APP_CLASSIFIER_OPTIONS: ClassifierOptions = PHOTO_CLASSIFIER_OPTIONS;

/** 헤어/눈 L* 하한 (= core DARK_FEATURE_L_FLOOR) */
export { DARK_FEATURE_L_FLOOR };

type LabLike = { l: number; a: number; b: number };

/** 분류 입력 (보정된 피부 Lab 필수, 헤어/눈 선택) */
export interface MeasuredColors {
  skin: LabLike;
  hair?: LabLike;
  eyes?: LabLike;
}

/** 측정값에서 분류 입력을 뽑는다 (화이트밸런스 보정 후 피부색). */
export function measuredColorsFromFace(face: Pick<FaceAnalysis, 'skin' | 'featureColors'>): MeasuredColors {
  return {
    skin: face.skin.corrected.lab,
    hair: face.featureColors.hair?.lab,
    eyes: face.featureColors.eyes?.lab,
  };
}

/** 앱 보정을 적용한 결정적 분류 */
export function classifyMeasured(m: MeasuredColors, opts: ClassifierOptions = APP_CLASSIFIER_OPTIONS): PersonalColorClassification {
  return classifyMeasuredColors(m, opts);
}

export function classifyFace(face: Pick<FaceAnalysis, 'skin' | 'featureColors'>): PersonalColorClassification {
  return classifyMeasured(measuredColorsFromFace(face));
}
