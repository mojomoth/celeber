/**
 * 역이미지 검색 결과(텍스트)에서 인물 이름 후보를 뽑는다.
 *
 * 정책: 얼굴 생체 정보는 쓰지 않는다. 입력은 Google Lens가 돌려준
 * 지식 패널 제목과 "시각적으로 비슷한 페이지"의 제목 텍스트뿐이며,
 * 결과는 사용자가 확인해야 하는 후보다.
 *
 * 방법:
 * 1. 지식 패널(knowledgeGraph) 제목은 그대로 후보 (가장 강한 신호)
 * 2. 유사 페이지 제목을 구분자로 자르고 토큰 n-gram(1~3)을 만든다
 *    - 한글: 2~4음절 토큰 1개(한국 이름), 조사 제거
 *    - 라틴: 대문자로 시작하는 단어 1~3개
 * 3. 불용어(패션/공항/사이트명 등)와 출처 사이트 이름을 제외
 * 4. 몇 개의 제목에서 언급됐는지(문서 빈도)로 점수 = df / 제목 수
 * 5. 더 긴 n-gram이 같은 빈도로 나오면 짧은 것은 버린다 (예: 'Kang' < 'Kang Ian')
 */
import type { CelebCandidate } from '@celeber/core/contracts';

export interface ReverseTextInput {
  knowledgeGraph: { title: string; subtitle?: string; link?: string; thumbnailUrl?: string }[];
  visualMatches: { title: string; link?: string; source?: string; thumbnailUrl?: string }[];
}

const KO_STOP = new Set(
  (
    '패션 공항 공항패션 화보 사진 사진들 뉴스 기사 오늘 출국 입국 포토 포토월 스타일 코디 근황 인스타그램 인스타 영상 무대 드라마 영화 ' +
    '배우 가수 모델 아이돌 그룹 멤버 시상식 레드카펫 브랜드 행사 최근 일상 사복 데일리 데일리룩 전신 여신 남신 미모 비주얼 공개 참석 ' +
    '블랙 화이트 컬러 패션위크 컬렉션 착용 셀카 이미지 고화질 배경화면 움짤 유튜브 네이버 블로그 카페 티스토리 다음 핀터레스트 트위터 ' +
    '쇼핑 판매 가격 구매 상품 정보 기자 연합뉴스 스포츠 엔터 연예 연예인 일보 신문 헤럴드 스타 기념 촬영 현장 출연 방송 인터뷰 ' +
    '코트 자켓 재킷 셔츠 니트 원피스 드레스 슈트 수트 가방 신발 스니커즈 정장 청바지 데님 팬츠 스커트 액세서리 악세서리 ' +
    '여자 남자 여성 남성 한국 韓國 남친룩 여친룩 룩북 가을 겨울 여름 봄 코디법 추천 모음 정리 사진첩 직찍 프리뷰 리뷰 ' +
    '그리고 오늘의 이번 완벽 화제 눈길 매력 분위기 근접 공식 계정 팬들 반응 시크 러블리 우아 청순 ' +
    '부산 서울 인천 김포 파리 밀라노 뉴욕 런던 도쿄'
  ).split(/\s+/),
);

const EN_STOP = new Set(
  (
    'instagram pinterest twitter facebook youtube tiktok threads x news photo photos picture pictures image images fashion style styles airport ' +
    'the and with for from of in on at to by a an is are this that his her their our your my new latest best top ' +
    'getty stock alamy shutterstock wallpaper wallpapers korea korean kpop k-pop allkpop soompi koreaboo naver daum vogue harper harpers bazaar elle gq ' +
    'dispatch red carpet look looks outfit outfits celebrity celebrities actor actress singer idol week paris milan york london tokyo seoul ' +
    'fashionweek collection runway street streetstyle ootd dress jacket coat shirt event events award awards ceremony show music video official ' +
    'profile wiki wikipedia namu fandom amazon ebay shop store sale buy price com net org co kr www http https'
  ).split(/\s+/),
);

const SEP_RE = /[|｜\-–—:：·•,，()（）[\]【】「」『』<>《》"“”'‘’#/\\!?！？…~]+/;
const HANGUL_RE = /^[가-힣]+$/;
const LATIN_WORD_RE = /^[A-Z][a-zA-Z'.]+$/;
const PARTICLES = ['에서', '에게', '의', '은', '는', '을', '를', '와', '과', '도', '님', '씨'];

function stripParticle(tok: string): string {
  for (const p of PARTICLES) {
    if (tok.endsWith(p) && tok.length - p.length >= 2) return tok.slice(0, -p.length);
  }
  return tok;
}

/** 출처 사이트 이름(예: 'Vogue Korea', '네이버 블로그')의 토큰도 불용어로 */
function siteStopwords(matches: ReverseTextInput['visualMatches']): Set<string> {
  const s = new Set<string>();
  for (const m of matches) {
    for (const t of (m.source ?? '').split(/[\s.]+/)) if (t) s.add(t.toLowerCase());
  }
  return s;
}

/** 제목 하나 → 이 제목에 등장한 이름 후보 n-gram 집합 */
export function titleNameGrams(title: string, extraStop: Set<string> = new Set()): Set<string> {
  const grams = new Set<string>();
  for (const seg of title.split(SEP_RE)) {
    const toks = seg
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => t.replace(/[.'’]+$/, ''));
    // 한글 1-gram (2~4음절)
    for (const raw of toks) {
      if (!HANGUL_RE.test(raw)) continue;
      const t = stripParticle(raw);
      if (t.length < 2 || t.length > 4) continue;
      if (KO_STOP.has(t) || KO_STOP.has(raw) || extraStop.has(t)) continue;
      grams.add(t);
    }
    // 라틴: 대문자로 시작하는 연속 단어 1~3개
    for (let i = 0; i < toks.length; i++) {
      for (let n = 1; n <= 3 && i + n <= toks.length; n++) {
        const words = toks.slice(i, i + n);
        if (!words.every((w) => LATIN_WORD_RE.test(w) && w.length >= 2)) break;
        if (words.some((w) => EN_STOP.has(w.toLowerCase()) || extraStop.has(w.toLowerCase()))) break;
        const g = words.join(' ');
        if (n === 1 && g.length < 3) continue;
        grams.add(g);
      }
    }
  }
  return grams;
}

export interface ExtractOptions {
  /** 최소 문서 빈도 (기본: 제목 3개 이상이면 2, 아니면 1) */
  minDf?: number;
  /** 최대 후보 수 (기본 5) */
  limit?: number;
}

/** 역이미지 검색 결과 텍스트 → 이름 후보 (source: 'reverse-image') */
export function extractNameCandidates(input: ReverseTextInput, opts: ExtractOptions = {}): CelebCandidate[] {
  const limit = opts.limit ?? 5;
  const out: CelebCandidate[] = [];

  // 1) 지식 패널
  input.knowledgeGraph.slice(0, 3).forEach((k, i) => {
    const name = k.title.trim();
    if (!name) return;
    out.push({
      name,
      description: k.subtitle,
      thumbnailUrl: k.thumbnailUrl,
      externalUrl: k.link,
      source: 'reverse-image',
      score: Math.max(0.6, 0.95 - i * 0.1),
      evidence: ['역이미지 검색의 지식 패널 항목'],
    });
  });

  // 2) 유사 페이지 제목 n-gram 빈도
  const titles = input.visualMatches.map((m) => m.title).filter(Boolean);
  if (titles.length) {
    const stop = siteStopwords(input.visualMatches);
    const df = new Map<string, number>();
    const examples = new Map<string, string[]>();
    for (const t of titles) {
      for (const g of titleNameGrams(t, stop)) {
        df.set(g, (df.get(g) ?? 0) + 1);
        const ex = examples.get(g) ?? [];
        if (ex.length < 2) ex.push(t);
        examples.set(g, ex);
      }
    }
    const minDf = opts.minDf ?? (titles.length >= 3 ? 2 : 1);
    let grams = [...df.entries()].filter(([, n]) => n >= minDf);
    // 같은 빈도의 더 긴 n-gram에 포함된 짧은 n-gram 제거
    grams = grams.filter(([g, n]) => !grams.some(([h, m]) => h !== g && m >= n && h.split(' ').length > g.split(' ').length && h.split(' ').includes(g)));
    grams.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length);
    for (const [g, n] of grams.slice(0, limit)) {
      out.push({
        name: g,
        source: 'reverse-image',
        score: Math.round(Math.min(0.9, n / titles.length) * 100) / 100,
        evidence: [`비슷한 이미지가 실린 페이지 제목 ${titles.length}건 중 ${n}건에서 언급`, ...(examples.get(g) ?? []).map((t) => `“${truncate(t, 48)}”`)],
      });
    }
  }
  return out.slice(0, limit + 3);
}

/** 사진 속 글자(캡션, 이름표, 워터마크 등)에서 나온 이름 → 후보 (source: 'photo-text') */
export function photoTextCandidates(items: { text: string; where: string }[]): CelebCandidate[] {
  const seen = new Set<string>();
  const out: CelebCandidate[] = [];
  for (const it of items) {
    const name = it.text.replace(/^@/, '').trim();
    if (!name || name.length > 40 || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, source: 'photo-text', score: 0.55, evidence: [`사진 속 글자에서 읽음 (${it.where || '위치 미상'})`] });
  }
  return out.slice(0, 5);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
