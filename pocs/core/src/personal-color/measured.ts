/**
 * 사진 측정값용 분류 프리셋 (personal-color-report 앱 단 보정을 승격).
 *
 * 근거: FaceLandmarker ROI + selfie segmentation으로 잰 헤어/눈 L*는 그늘·뒷머리 픽셀 때문에
 * 2~10 수준으로 매우 낮게 나온다. 기본 대비 범위(ΔL* 18→0, 62→1)에서는 밝은 피부 + 검은 머리가
 * 모두 대비 100이 되어 L* 86 피부도 겨울 딥과 거의 동점이 된다.
 * 대비 범위를 ΔL* 35→0, 85→1로 넓히고 헤어/눈 L* 하한을 8로 두면 웜/쿨 판단(색상각·b*)은
 * 그대로 두면서 대비 축이 포화되지 않는다.
 *
 * 내 리포트(personal-color-report)와 연예인 사진(celeb-vibe)이 같은 프리셋을 써야
 * 추구미 가이드(celeb-vibe-report)의 5축 갭이 같은 척도에서 비교된다.
 */
import type { PersonalColorClassification } from '../contracts/personal-color';
import type { Lab } from '../color/convert';
import { type ClassifierInput, type ClassifierOptions, classifyPersonalColor } from './classifier';

/** 사진 측정값에 쓰는 분류기 보정 옵션 */
export const PHOTO_CLASSIFIER_OPTIONS: ClassifierOptions = {
  calibration: { contrastDL: { min: 35, max: 85 } },
};

/** 헤어/눈 L* 하한 (그늘 픽셀 영향 완화) */
export const DARK_FEATURE_L_FLOOR = 8;

const floorL = (lab: Lab | undefined): Lab | undefined => (lab ? { ...lab, l: Math.max(lab.l, DARK_FEATURE_L_FLOOR) } : undefined);
const round1 = (l: Lab): Lab => ({ l: Math.round(l.l * 10) / 10, a: Math.round(l.a * 10) / 10, b: Math.round(l.b * 10) / 10 });

/**
 * 사진에서 측정한 피부(보정 후)/헤어/눈 Lab → 분류.
 * 헤어/눈에 L* 하한을 적용해 분류하고, 결과의 inputs에는 하한 적용 전 실제 측정값을 남긴다.
 */
export function classifyMeasuredColors(input: ClassifierInput, opts: ClassifierOptions = PHOTO_CLASSIFIER_OPTIONS): PersonalColorClassification {
  const r = classifyPersonalColor({ skin: input.skin, hair: floorL(input.hair), eyes: floorL(input.eyes) }, opts);
  return {
    ...r,
    inputs: {
      ...r.inputs,
      hairLab: input.hair ? round1(input.hair) : undefined,
      eyeLab: input.eyes ? round1(input.eyes) : undefined,
    },
  };
}
