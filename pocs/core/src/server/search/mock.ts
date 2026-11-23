/**
 * 키 없는 데모 모드용 결정적 Mock 프로바이더.
 */
import { mockCelebImages } from '../../mock';
import type { CelebImageCategory } from '../../contracts';
import type { ImageSearchProvider, ImageSearchResult, ReverseImageSearchProvider } from './types';
import { demoPhoto } from './demo-photos';

/** 쿼리 문자열에서 카테고리 추정 (대표/최근/평소 키워드) */
function guessCategory(q: string): CelebImageCategory {
  if (/(공항|최근|20\d\d|행사|이벤트)/.test(q)) return 'recent';
  if (/(사복|일상|데일리|평소)/.test(q)) return 'daily';
  return 'signature';
}

/** 검색어 키워드(직업·카테고리·연도)로 쓰이는 토큰. 이름 뒤에 붙으므로 처음 나오는 키워드 앞까지를 이름으로 본다. */
const QUERY_KEYWORD = /^(배우|가수|모델|아이돌|방송인|화보|전신|레드카펫|시상식|공항패션|공항|행사|이벤트|사복|일상|패션|데일리룩|데일리|평소|최근|코디|룩|\d{4})$/;

/** '강 이안 배우 화보 전신' → '강 이안' (공백이 든 이름도 유지) */
export function mockNameFromQuery(query: string): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  const idx = tokens.findIndex((t) => QUERY_KEYWORD.test(t));
  const nameTokens = idx === -1 ? tokens.slice(0, 1) : tokens.slice(0, Math.max(idx, 1));
  return nameTokens.join(' ') || '데모';
}

export const mockImageProvider: ImageSearchProvider = {
  id: 'mock',
  async searchImages(q): Promise<ImageSearchResult[]> {
    const name = mockNameFromQuery(q.query);
    const category = guessCategory(q.query);
    const imgs = mockCelebImages(name, category, Math.min(q.count ?? 6, 9));
    const out: ImageSearchResult[] = imgs.map((m) => ({ provider: 'mock' as const, imageUrl: m.dataUrl, thumbnailUrl: m.dataUrl, title: m.title, source: 'CELEBER 데모', width: m.width, height: m.height }));
    // 두 번째 자리에 실제 래스터 전신 사진 1장: 첫 실루엣이 '분석 불가'여도 같은 갤러리에서 분석 가능한 사진을 고를 수 있다.
    const photo = demoPhoto(category);
    if (photo) {
      const item: ImageSearchResult = { provider: 'mock', imageUrl: photo.dataUrl, thumbnailUrl: photo.dataUrl, title: `${name} · ${photo.title}`, source: 'CELEBER 데모', width: photo.width, height: photo.height };
      out.splice(Math.min(1, out.length), 0, item);
      if (out.length > imgs.length && imgs.length > 1) out.pop();
    }
    return out;
  },
};

export const mockReverseProvider: ReverseImageSearchProvider = {
  id: 'mock',
  async reverseSearch() {
    return {
      provider: 'mock',
      status: 'unavailable',
      reason: 'SERPAPI_API_KEY가 없어 사진으로 인물을 찾을 수 없습니다. 이름으로 검색해 주세요.',
      knowledgeGraph: [],
      visualMatches: [],
    };
  },
};
