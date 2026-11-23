/**
 * 카메라 프리뷰 실시간 프레이밍 피드백 (순수 함수). PoseLandmarker VIDEO 결과 1명분을 받아
 * 머리~발이 프레임 안에 들어왔는지 판단한다.
 */
import type { Landmark3 } from '@celeber/core/contracts';
import { POSE, vis } from './pose';

export type FramingState = 'idle' | 'ok' | 'warn';
export interface FramingFeedback {
  state: FramingState;
  tone: 'ok' | 'warn' | 'info';
  message: string;
}

export function framingFeedback(lms: Landmark3[] | null | undefined): FramingFeedback {
  if (!lms || lms.length < 33) return { state: 'warn', tone: 'warn', message: '사람이 보이지 않습니다. 화면 안으로 들어와 주세요' };
  const nose = lms[POSE.nose];
  const ankles = [lms[POSE.leftAnkle], lms[POSE.rightAnkle]];
  const feet = [lms[POSE.leftHeel], lms[POSE.rightHeel], lms[POSE.leftFootIndex], lms[POSE.rightFootIndex]];
  if (vis(nose) < 0.5 || nose.y < 0.06) return { state: 'warn', tone: 'warn', message: '머리 위에 여백을 두세요' };
  if (ankles.some((a) => vis(a) < 0.5 || a.y > 0.97) || feet.some((f) => f.y >= 0.99) || feet.every((f) => vis(f) < 0.3 || f.y > 0.985)) return { state: 'warn', tone: 'warn', message: '발끝까지 들어오게 뒤로 물러나 주세요' };
  const span = Math.max(...feet.map((f) => f.y)) - nose.y;
  if (span < 0.55) return { state: 'warn', tone: 'warn', message: '조금 더 가까이 와 주세요' };
  const sh = Math.abs(lms[POSE.leftShoulder].x - lms[POSE.rightShoulder].x);
  if (sh / span < 0.1) return { state: 'warn', tone: 'warn', message: '카메라를 정면으로 바라봐 주세요' };
  const cx = (lms[POSE.leftHip].x + lms[POSE.rightHip].x) / 2;
  if (cx < 0.3 || cx > 0.7) return { state: 'warn', tone: 'warn', message: '화면 가운데에 서 주세요' };
  return { state: 'ok', tone: 'ok', message: '머리부터 발까지 들어왔어요' };
}
