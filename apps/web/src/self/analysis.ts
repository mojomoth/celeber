import type { AnalyzeResponse as BodyResponse } from '@celeber/camera-body/lib';
import type { FaceSession, SkinColorMeasurement } from '@celeber/core/contracts';
import type { ComponentProps } from 'react';
import type { SelfAnalysisScreen } from '@/screens/03-self-analysis';
import { readCurrent } from '../current';
import { fetchSelfJson, MissingAnalysis, SelfRequestError } from './api';

const regionLabels: Record<SkinColorMeasurement['regions'][number]['region'], string> = {
  forehead: '이마',
  leftCheek: '왼쪽 볼',
  rightCheek: '오른쪽 볼',
  nose: '코',
  chin: '턱',
};

type ViewData = ComponentProps<typeof SelfAnalysisScreen>['data'];

export async function loadCurrentAnalysis(): Promise<ViewData> {
  const current = readCurrent();
  if (!current) throw new MissingAnalysis();
  const faceRequest = fetchSelfJson<FaceSession>(`/api/face/sessions/${encodeURIComponent(current.faceSessionId)}`)
    .catch((error: unknown) => {
      if (error instanceof SelfRequestError && error.status === 404) throw new MissingAnalysis();
      throw error;
    });
  const bodyRequest = current.bodySessionId
    ? fetchSelfJson<BodyResponse>(`/api/body/sessions/${encodeURIComponent(current.bodySessionId)}`)
    : Promise.resolve(null);
  const [{ analysis: face }, bodyResult] = await Promise.all([faceRequest, bodyRequest]);
  if (!face) throw new MissingAnalysis();

  const body = bodyResult?.session.analysis;
  const outfit = bodyResult?.outfit;
  const ai = face.source === 'ai' ? face.ai : undefined;
  const skin = face.skin.corrected;
  const geometry = face.geometry;
  const measuredColors = [outfit?.colors.top?.nameKo, outfit?.colors.bottom?.nameKo].filter(Boolean).join(' · ');
  const summary = ai?.impression ? [ai.impression] : ['촬영 사진에서 피부색과 얼굴의 윤곽을 살펴봤어요.'];
  const samples = face.skin.regions
    .filter(({ region }) => region === 'forehead' || region === 'leftCheek' || region === 'rightCheek')
    .map(({ region, corrected }) => ({ name: regionLabels[region], hex: corrected.hex }));
  const date = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' }).format(new Date(face.front.capturedAt));

  return {
    photos: { front: face.front.image.url, side: face.side?.image.url, full: body?.image?.url },
    meta: `${date} 촬영 · ${face.environment.lightSourceLabel} · ${face.environment.brightness.label}`,
    headline: [skin.nameKo, `${geometry.shapeLabel} 얼굴`],
    summary,
    skin: { caption: face.skin.whiteBalance.method === 'none' ? '촬영 사진 기준' : '조명 보정 후', samples: samples.length ? samples : [{ name: '평균', hex: skin.hex }] },
    features: [
      { k: '피부 톤', v: skin.nameKo },
      { k: '얼굴형', v: geometry.shapeEvidence.join(' · ') || geometry.shapeLabel },
      { k: '이목구비', v: ai?.features.join(' · ') || geometry.interpretations.slice(0, 3).map(({ label, value }) => `${label} ${value}`).join(' · ') || '측정값이 부족해요.' },
      { k: '헤어', v: ai?.hairStyle || face.featureColors.hair?.nameKo || '측정값이 부족해요.' },
      { k: '전신 비율', v: body?.insights.slice(0, 3).map(({ label, display }) => `${label} ${display}`).join(' · ') || '전신 사진을 사용하지 않았어요.' },
      ...(body ? [{ k: '코디', v: outfit?.detail?.summary || body.outfitDescription || measuredColors || '확인된 옷차림 정보가 없어요.' }] : []),
      ...(outfit?.detail?.accessories.length ? [{ k: '액세서리', v: outfit.detail.accessories.join(' · ') }] : []),
      ...(face.warnings.length ? [{ k: '촬영 참고', v: face.warnings.map(({ message }) => message).join(' · ') }] : []),
    ],
  };
}
