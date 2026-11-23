/**
 * fixtures/*.pose.json 로더. 데모 사진(pocs/core/fixtures/demo-people)과 그 변형을 브라우저 MediaPipe로 잰 실측값이다
 * (포즈 33점, 얼굴 이마·턱·눈 중심, 사람 마스크 행별 구간, 평균 휘도).
 */
import fs from 'node:fs';
import type { Landmark3 } from '@celeber/core/contracts';
import type { BodyMeasureInput, PersonMask } from '../src/lib';

interface PoseFixture {
  imageWidth: number;
  imageHeight: number;
  meanLuminance: number;
  extraPeople?: number;
  face: BodyMeasureInput['face'];
  landmarks: Landmark3[];
  mask: { width: number; height: number; rows: number[][] };
  /** 포즈가 둘 이상 잡혔을 때 모든 포즈(원본 정규화 좌표)와 주 인물 번호 */
  poses?: Landmark3[][];
  mainIdx?: number;
}

const read = (name: string) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${name}.pose.json`, import.meta.url), 'utf8')) as PoseFixture;

/** 포즈 검출 결과 전체 (countExtraPeople 입력). 포즈가 하나면 그것만 */
export function loadPoses(name: string): { poses: Landmark3[][]; mainIdx: number } {
  const f = read(name);
  return { poses: f.poses ?? [f.landmarks], mainIdx: f.mainIdx ?? 0 };
}

export function loadFixture(name: string): BodyMeasureInput {
  const f = read(name);
  const data = new Uint8Array(f.mask.width * f.mask.height);
  f.mask.rows.forEach((runs, y) => {
    for (let i = 0; i < runs.length; i += 2) data.fill(1, y * f.mask.width + runs[i], y * f.mask.width + runs[i + 1] + 1);
  });
  const mask: PersonMask = { data, width: f.mask.width, height: f.mask.height, threshold: 0.5 };
  return { landmarks: f.landmarks, imageWidth: f.imageWidth, imageHeight: f.imageHeight, face: f.face, mask, meanLuminance: f.meanLuminance, extraPeople: f.extraPeople };
}
