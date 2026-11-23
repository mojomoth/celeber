/**
 * 사진으로 인물 후보 찾기 — 얼굴 생체 인식 없음.
 *
 * 1. 역이미지 검색(SerpAPI Google Lens): 지식 패널 제목 + 비슷한 페이지 제목 텍스트 → 이름 n-gram 빈도
 *    (키 있고 AI 가능하면 제목 텍스트만 Claude에 보내 이름 표기를 정리; 사진은 보내지 않음)
 * 2. 사진 속 글자(캡션, 자막, 이름표, 워터마크, @계정): Claude 비전이 "글자로 보이는 것"만 옮겨 적음
 * 3. 후보를 합쳐 제시 → 사용자가 확인해야 확정
 * 키가 없으면 데모 후보 + "이름으로 검색해 주세요" 안내.
 */
import 'server-only';
import { z } from 'zod';
import type { CelebCandidate } from '@celeber/core/contracts';
import { MOCK_PEOPLE } from '@celeber/core/mock';
import { callTextStructured, callVisionStructured } from '@celeber/core/server/ai';
import { getCapabilities } from '@celeber/core/server/env';
import { reverseImageSearch } from '@celeber/core/server/search';
import { getUpload, toImageRef } from '@celeber/core/server/uploads';
import { extractNameCandidates, photoTextCandidates } from '../lib/candidates';
import { mergeCandidates } from '../lib/names';
import type { IdentifyResponse, PhotoFraming } from '../lib/types';
import { attachCelebIds } from './celebs';
import { candidateThumbnail, proxyImageUrl } from './thumbs';
import { mapLimit, shortWarning } from './util';

const PhotoTextSchema = z.object({
  visibleTexts: z.array(z.string()),
  nameTexts: z.array(z.object({ text: z.string(), where: z.string() })),
  personCount: z.number().int(),
  framing: z.enum(['full-body', 'upper-body', 'face-closeup', 'no-person', 'unknown']),
  note: z.string(),
});
type PhotoText = z.infer<typeof PhotoTextSchema>;

const PHOTO_TEXT_SYSTEM = [
  '사진 속에 글자로 쓰여 있는 정보만 옮겨 적습니다: 캡션, 자막, 방송 하단 이름 자막, 이름표, 포스터·현수막 문구, 워터마크, SNS 계정명(@...).',
  '얼굴, 체형, 헤어스타일 등 외모를 근거로 이름을 추측하거나 떠올리지 마세요. 사진에 글자로 보이지 않는 이름은 절대 쓰지 마세요.',
  'visibleTexts: 읽을 수 있는 글자를 원문 그대로 (최대 15개). nameTexts: 그중 사람 이름이나 계정명으로 쓰인 글자만, where에 위치(예: 하단 자막, 우측 하단 워터마크).',
  'personCount: 사진에 보이는 사람 수. framing: full-body(머리부터 발까지), upper-body, face-closeup, no-person, unknown.',
  'note: 추구미(코디·색) 분석에 이 사진을 쓸 수 있는지 한 문장 (역광, 가림, 여러 명 등).',
].join('\n');

const TitleNamesSchema = z.object({
  names: z.array(z.object({ name: z.string(), nameEn: z.string(), description: z.string(), mentions: z.number().int() })),
});
type TitleNames = z.infer<typeof TitleNamesSchema>;

const TITLE_SYSTEM = [
  '이 요청에는 사진이 없습니다. 웹 페이지 제목 목록에서 "제목에 글자로 적힌" 사람 이름만 추출합니다.',
  '제목에 없는 이름을 추가하지 마세요. 브랜드, 매체, 지명, 행사명은 제외합니다.',
  'mentions는 그 이름이 등장한 제목 수, description은 제목에서 드러나는 짧은 설명(없으면 빈 문자열). 최대 5명.',
].join('\n');

export async function identifyFromPhoto(uploadId: string): Promise<IdentifyResponse | null> {
  const rec = getUpload(uploadId);
  if (!rec) return null;
  const caps = getCapabilities();
  const notices: string[] = [];

  const [reverse, photo] = await Promise.all([
    reverseImageSearch({ uploadId }),
    callVisionStructured<PhotoText>({
      schema: PhotoTextSchema,
      mock: () => ({ visibleTexts: [], nameTexts: [], personCount: -1, framing: 'unknown' as const, note: '' }),
      system: PHOTO_TEXT_SYSTEM,
      prompt: '이 사진에서 글자로 보이는 정보와 구도를 정리해 주세요.',
      images: [{ uploadId, label: '사용자가 올린 연예인 사진' }],
      maxTokens: 4000,
      effort: 'low',
      label: 'search-celeb/photo-text',
    }),
  ]);

  // 1) 역이미지 검색 텍스트
  let reverseCands: CelebCandidate[] = [];
  if (reverse.status === 'ok') {
    reverseCands = extractNameCandidates(reverse);
    const titles = reverse.visualMatches.map((m) => m.title).slice(0, 30);
    if (titles.length && caps.ai) {
      const r = await callTextStructured<TitleNames>({
        schema: TitleNamesSchema,
        mock: () => ({ names: [] }),
        system: TITLE_SYSTEM,
        prompt: `페이지 제목 ${titles.length}건:\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
        maxTokens: 3000,
        effort: 'low',
        label: 'search-celeb/title-names',
      });
      if (r.source === 'ai') {
        const aiCands: CelebCandidate[] = r.data.names
          .filter((n) => n.name.trim() && n.mentions > 0)
          .map((n) => ({
            name: n.name.trim(),
            nameEn: n.nameEn.trim() || undefined,
            description: n.description.trim() || undefined,
            source: 'reverse-image',
            score: Math.round(Math.min(0.9, n.mentions / titles.length + 0.2) * 100) / 100,
            evidence: [`비슷한 이미지가 실린 페이지 제목 ${titles.length}건 중 ${n.mentions}건에 적힌 이름 (제목 텍스트 정리)`],
          }));
        reverseCands = mergeCandidates([aiCands, reverseCands], 8);
      }
    }
    if (!reverseCands.length) notices.push('역이미지 검색 결과 제목에서 인물 이름을 찾지 못했습니다.');
  }

  // 2) 사진 속 글자
  const textCands = photo.source === 'ai' ? photoTextCandidates(photo.data.nameTexts) : [];

  let candidates = mergeCandidates([reverseCands, textCands], 6);
  let isMock = reverse.provider === 'mock' && photo.source === 'mock';
  if (!candidates.length && (reverse.status !== 'ok' || reverse.provider === 'mock')) {
    // 키 없음: 데모 후보 (흐름 확인용) + 이름 검색 안내
    candidates = MOCK_PEOPLE.map((p) => ({ ...p, evidence: ['데모 후보: 사진 검색 키가 없어 가상 인물을 보여줍니다. 실제 인물은 이름으로 검색해 주세요.'] }));
    isMock = true;
  }

  const withThumbs = await mapLimit(attachCelebIds(candidates), 3, async (c) => ({
    ...c,
    thumbnailUrl: (await proxyImageUrl(c.thumbnailUrl)) ?? (await candidateThumbnail(c.name, c.description)),
  }));

  const realCount = withThumbs.filter((c) => c.source !== 'mock').length;
  const needsNameSearch = realCount === 0;
  if (reverse.status === 'ok') {
    if (needsNameSearch) notices.push('사진만으로는 후보를 찾지 못했습니다. 이름으로 검색해 주세요.');
  } else {
    // reverse.reason은 개발용(환경변수 이름, 영어 오류)이라 화면에 그대로 내보내지 않는다
    notices.push(reverseUnavailableNotice(reverse.status, needsNameSearch));
  }
  if (photo.warning && photo.source === 'mock') notices.push('사진 속 글자 읽기를 건너뛰었습니다 (AI 사용 불가).');

  const framing: PhotoFraming = photo.source === 'ai' ? photo.data.framing : 'unknown';
  return {
    upload: toImageRef(rec),
    reverse: {
      provider: reverse.provider,
      status: reverse.status,
      reason: reverse.reason,
      knowledgeGraphCount: reverse.knowledgeGraph.length,
      visualMatchCount: reverse.visualMatches.length,
    },
    photoText: { texts: photo.source === 'ai' ? photo.data.visibleTexts.slice(0, 15) : [], origin: photo.source === 'ai' ? 'ai' : 'mock', warning: shortWarning(photo.warning) },
    photoCheck: {
      framing,
      personCount: photo.source === 'ai' && photo.data.personCount >= 0 ? photo.data.personCount : null,
      note: photo.source === 'ai' && photo.data.note ? photo.data.note : framingNoteByMeta(rec.width, rec.height),
      origin: photo.source === 'ai' ? 'ai' : 'rules',
    },
    candidates: withThumbs,
    needsNameSearch,
    isMock,
    notices: [...new Set(notices)],
  };
}

/** 역이미지 검색을 못 했을 때 안내. 사진 속 글자로 후보를 찾았으면 결과와 어긋나지 않게 그 사실만 알린다 */
export function reverseUnavailableNotice(status: 'unavailable' | 'error', needsNameSearch: boolean): string {
  const why = status === 'error' ? '사진 검색이 실패해' : '사진 검색을 쓸 수 없어';
  return needsNameSearch ? `${why} 사진만으로는 인물을 찾지 못했습니다. 이름으로 검색해 주세요.` : `${why} 사진 속 글자만 확인했습니다.`;
}

function framingNoteByMeta(w: number | null, h: number | null): string {
  if (!w || !h) return '사진 구도를 판정하지 못했습니다.';
  const a = h / w;
  return a >= 1.25
    ? `세로 사진입니다 (비율 ${a.toFixed(2)}). 전신이 보이면 이 사진으로 바로 분석할 수 있습니다.`
    : `가로 또는 정사각형 사진입니다 (비율 ${a.toFixed(2)}). 전신 분석에는 대표·최근·평소 사진에서 고르는 편이 정확합니다.`;
}
