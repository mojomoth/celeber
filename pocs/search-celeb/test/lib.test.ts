import { describe, expect, it } from 'vitest';
import type { CelebCandidate, CelebImage } from '@celeber/core/contracts';
import { buildCategoryQueries, CATEGORY_ORDER } from '../src/lib/queries';
import { candidateKey, mergeCandidates, nameKey, sameName } from '../src/lib/names';
import { MAX_PHOTO_BYTES, photoErrorMessage, photoFileProblem } from '../src/lib/upload';
import { CelebApiError } from '../src/lib/api';
import { suggestKeyDown } from '../src/components/suggest-keys';
import { extractNameCandidates, photoTextCandidates, titleNameGrams } from '../src/lib/candidates';
import { canonicalUrl, groupByCategory, judgeByMetadata, rankSearchResults, shortReason, sourceLabel, visibleImages } from '../src/lib/filter';
import { withBase } from '../src/lib/api';

describe('buildCategoryQueries', () => {
  const now = new Date('2026-11-23T00:00:00Z');
  it('대표/최근/평소 검색어를 만든다', () => {
    expect(buildCategoryQueries('윤하람', 'signature', now)).toEqual(['윤하람 화보 전신', '윤하람 레드카펫', '윤하람 시상식 전신']);
    expect(buildCategoryQueries('윤하람', 'recent', now)[0]).toBe('윤하람 2026 공항패션');
    expect(buildCategoryQueries('윤하람', 'daily', now)).toContain('윤하람 사복 전신');
  });
  it('1~2월에는 작년 연도를 먼저 쓴다', () => {
    expect(buildCategoryQueries('A', 'recent', new Date('2027-01-10T00:00:00Z'))[0]).toBe('A 2026 공항패션');
  });
  it('대표·평소 검색어에는 공항/연도가 없다 (Mock 카테고리 추정과 충돌 방지)', () => {
    for (const c of ['signature', 'daily'] as const) for (const q of buildCategoryQueries('B', c, now)) expect(q).not.toMatch(/공항|20\d\d|최근|행사/);
  });
  it('직업 설명은 대표 검색어에만 붙이고 괄호는 버린다', () => {
    expect(buildCategoryQueries('C', 'signature', now, '배우 (데모 인물)')[0]).toBe('C 배우 화보 전신');
    expect(buildCategoryQueries('C', 'signature', now, '알 수 없는 설명')[0]).toBe('C 화보 전신');
  });
  it('빈 이름은 빈 목록, 카테고리 순서 고정', () => {
    expect(buildCategoryQueries('  ', 'daily', now)).toEqual([]);
    expect(CATEGORY_ORDER).toEqual(['signature', 'recent', 'daily']);
  });
});

describe('nameKey / mergeCandidates', () => {
  it('공백·구두점·대소문자 무시', () => {
    expect(nameKey('Kang Ian')).toBe(nameKey('kang-ian'));
    expect(nameKey(' 윤 하람 ')).toBe('윤하람');
  });
  const c = (name: string, source: CelebCandidate['source'], score: number, extra: Partial<CelebCandidate> = {}): CelebCandidate => ({ name, source, score, evidence: [`${source}:${name}`], ...extra });
  it('같은 이름은 합치고 출처가 늘면 점수 +0.1', () => {
    const r = mergeCandidates([[c('윤하람', 'reverse-image', 0.6)], [c('윤 하람', 'photo-text', 0.55, { description: '배우' })]]);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(0.7);
    expect(r[0].description).toBe('배우');
    expect(r[0].evidence).toHaveLength(2);
  });
  it('점수 내림차순, 동점은 먼저 나온 순서', () => {
    const r = mergeCandidates([[c('A', 'name-search', 0.4), c('B', 'name-search', 0.9), c('C', 'name-search', 0.4)]]);
    expect(r.map((x) => x.name)).toEqual(['B', 'A', 'C']);
  });
  it('limit 적용', () => {
    expect(mergeCandidates([[c('A', 'mock', 0.1), c('B', 'mock', 0.2), c('C', 'mock', 0.3)]], 2)).toHaveLength(2);
  });
  it('영문명이 같은 이름이면 합친다 (Jennie 검색 → 제니 + 입력 이름)', () => {
    const r = mergeCandidates([[c('제니', 'name-search', 0.98, { nameEn: 'Jennie', description: '가수' }), c('제니 가스', 'name-search', 0.14, { nameEn: 'Jennie Garth' })], [c('Jennie', 'name-search', 0.35)]]);
    expect(r.map((x) => x.name)).toEqual(['제니', '제니 가스']);
    expect(r[0].description).toBe('가수');
    // 순서가 반대여도 (영문 입력이 먼저) 하나로
    expect(mergeCandidates([[c('Jennie', 'name-search', 0.35)], [c('제니', 'name-search', 0.98, { nameEn: 'Jennie' })]])).toHaveLength(1);
  });
  // 검증 이슈: '김민수' 검색에서 AI가 4명을 줬는데 후보가 1명으로 합쳐졌다
  const kimminsu = [
    c('김민수', 'name-search', 0.6, { nameEn: 'Kim Min-su', description: '코미디언 · 피식대학' }),
    c('김민수', 'name-search', 0.5, { nameEn: 'Kim Min-su', description: '배우 · 압구정 백야' }),
    c('김민수', 'name-search', 0.4, { nameEn: 'Kim Min-soo', description: '가수 · 먼데이 키즈' }),
    c('김민수', 'name-search', 0.3, { nameEn: 'Kim Min-soo', description: '전 농구선수 · 서울 SK' }),
  ];
  it('동명이인: 이름이 같아도 설명이 다르면 따로 둔다 (김민수 4명)', () => {
    const r = mergeCandidates([kimminsu]);
    expect(r.map((x) => x.description)).toEqual(['코미디언 · 피식대학', '배우 · 압구정 백야', '가수 · 먼데이 키즈', '전 농구선수 · 서울 SK']);
    expect(new Set(r.map(candidateKey)).size).toBe(4);
  });
  it('동명이인: 설명 없는 후보(사진 속 글자)는 첫 동명이인에 합치고, 설명이 같은 후보는 그 사람에 합친다', () => {
    const r = mergeCandidates([kimminsu, [c('김민수', 'photo-text', 0.55), c('김 민수', 'reverse-image', 0.7, { description: '가수·먼데이키즈' })]]);
    expect(r).toHaveLength(4);
    const singer = r.find((x) => x.description === '가수 · 먼데이 키즈')!;
    expect(singer.score).toBe(0.8);
    expect(singer.source).toBe('name-search');
    expect(r.find((x) => x.description === '코미디언 · 피식대학')!.evidence).toContain('photo-text:김민수');
  });
  it('영문명끼리는 비교하지 않는다 (같은 로마자 표기의 동명이인)', () => {
    expect(sameName({ name: '김민수', nameEn: 'Kim Min-su' }, { name: '김민수', nameEn: 'Kim Min-su' })).toBe(true);
    expect(sameName({ name: '김민수', nameEn: 'Kim Min-su' }, { name: '김민서', nameEn: 'Kim Min-su' })).toBe(false);
    expect(sameName({ name: 'Jennie' }, { name: '제니', nameEn: 'Jennie' })).toBe(true);
  });
});

describe('사진 올리기 전 확인과 실패 문구', () => {
  it('25MB 한도는 core MAX_UPLOAD_BYTES와 같다', async () => {
    const core = await import('@celeber/core/server/uploads');
    expect(MAX_PHOTO_BYTES).toBe(core.MAX_UPLOAD_BYTES);
  });
  it('25MB 초과·사진 아님·빈 파일은 올리기 전에 막는다', () => {
    expect(photoFileProblem({ size: 15 * 1024 * 1024, type: 'image/jpeg' })).toBeNull();
    expect(photoFileProblem({ size: MAX_PHOTO_BYTES, type: 'image/jpeg' })).toBeNull();
    expect(photoFileProblem({ size: MAX_PHOTO_BYTES + 1, type: 'image/jpeg' })).toContain('25MB 이하');
    expect(photoFileProblem({ size: 1000, type: 'application/pdf' })).toContain('사진 파일이 아닙니다');
    expect(photoFileProblem({ size: 0, type: '' })).toContain('빈 파일');
  });
  it('영어 내부 오류는 감추고, 한국어 사유는 그대로, 413은 크기 안내', () => {
    const en = photoErrorMessage('upload', new CelebApiError('Failed to parse body as FormData.', 400, 'upload_failed'));
    expect(en).not.toMatch(/Failed|FormData|JPEG·PNG·WebP 사진을 올려/);
    expect(en).toContain('사진을 올리지 못했습니다');
    expect(photoErrorMessage('upload', new CelebApiError('지원하지 않는 이미지 형식입니다 (JPEG/PNG/WebP/HEIC/AVIF/GIF/SVG).', 400))).toContain('지원하지 않는 이미지 형식');
    expect(photoErrorMessage('upload', new CelebApiError('이미지가 너무 큽니다 (최대 25MB).', 413))).toContain('25MB 이하');
    expect(photoErrorMessage('identify', new Error('fetch failed'))).toBe('사진에서 단서를 찾는 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.');
  });
});

describe('자동완성 키 처리', () => {
  const ev = (key: string) => ({ key, prevented: false, preventDefault() { this.prevented = true; } });
  it('목록이 열려 있을 때 Esc는 기본 동작(type=search 입력 지우기)을 막고 목록만 닫는다', () => {
    const e = ev('Escape');
    let closed = false;
    suggestKeyDown(e, true, 3, () => {}, () => (closed = true));
    expect(e.prevented).toBe(true);
    expect(closed).toBe(true);
  });
  it('목록이 닫혀 있으면 아무것도 하지 않는다', () => {
    const e = ev('Escape');
    let closed = false;
    suggestKeyDown(e, false, 3, () => {}, () => (closed = true));
    expect(e.prevented).toBe(false);
    expect(closed).toBe(false);
  });
  it('화살표는 범위 안에서 이동', () => {
    let a = 2;
    suggestKeyDown(ev('ArrowDown'), true, 3, (f) => (a = f(a)), () => {});
    expect(a).toBe(2);
    suggestKeyDown(ev('ArrowUp'), true, 3, (f) => (a = f(a)), () => {});
    expect(a).toBe(1);
  });
});

describe('extractNameCandidates (역이미지 검색 텍스트)', () => {
  it('지식 패널 제목은 가장 강한 후보', () => {
    const r = extractNameCandidates({ knowledgeGraph: [{ title: '윤하람', subtitle: '대한민국의 배우' }], visualMatches: [] });
    expect(r[0]).toMatchObject({ name: '윤하람', source: 'reverse-image', description: '대한민국의 배우' });
    expect(r[0].score).toBeGreaterThan(0.9);
  });
  it('제목 빈도로 한글 이름 추출, 불용어/사이트명/조사 제거', () => {
    const r = extractNameCandidates({
      knowledgeGraph: [],
      visualMatches: [
        { title: '윤하람 공항패션 블랙 코트 | 패션뉴스', source: '패션뉴스' },
        { title: '배우 윤하람의 데일리룩 - 인스타그램', source: 'Instagram' },
        { title: '윤하람, 시상식 레드카펫 드레스', source: '스포츠신문' },
        { title: '오늘의 공항 패션 모음', source: '블로그' },
      ],
    });
    expect(r[0].name).toBe('윤하람');
    expect(r[0].evidence[0]).toContain('4건 중 3건');
    expect(r.map((x) => x.name)).not.toContain('패션뉴스');
    expect(r.map((x) => x.name)).not.toContain('공항패션');
  });
  it('라틴 이름은 연속 대문자 단어로, 짧은 부분 n-gram은 흡수', () => {
    const r = extractNameCandidates({
      knowledgeGraph: [],
      visualMatches: [
        { title: 'Kang Ian airport fashion', source: 'allkpop' },
        { title: 'Kang Ian at Paris Fashion Week', source: 'Vogue' },
        { title: 'Model Kang Ian street style', source: 'Pinterest' },
      ],
    });
    expect(r[0].name).toBe('Kang Ian');
    expect(r.map((x) => x.name)).not.toContain('Kang');
  });
  it('제목이 없으면 빈 목록', () => {
    expect(extractNameCandidates({ knowledgeGraph: [], visualMatches: [] })).toEqual([]);
  });
  it('titleNameGrams: 4음절 초과/1음절 토큰 제외', () => {
    const g = titleNameGrams('가 나다 라마바사아 윤하람');
    expect([...g]).toContain('윤하람');
    expect([...g]).toContain('나다');
    expect([...g]).not.toContain('가');
    expect([...g]).not.toContain('라마바사아');
  });
  it('photoTextCandidates: @ 제거·중복 제거·source photo-text', () => {
    const r = photoTextCandidates([
      { text: '@haram_yoon', where: '우측 하단 워터마크' },
      { text: '@haram_yoon', where: '중복' },
      { text: '윤하람', where: '하단 자막' },
    ]);
    expect(r.map((x) => x.name)).toEqual(['haram_yoon', '윤하람']);
    expect(r[0].source).toBe('photo-text');
  });
});

describe('judgeByMetadata / rankSearchResults', () => {
  it('세로 + 충분한 높이 → 전신 추정', () => {
    expect(judgeByMetadata({ width: 600, height: 900 })).toMatchObject({ isFullBody: true, analyzable: true });
  });
  it('가로 사진 → 전신 아님, 분석 가능 여부는 미판정', () => {
    const j = judgeByMetadata({ width: 1200, height: 800 });
    expect(j.isFullBody).toBe(false);
    expect(j.analyzable).toBeNull();
    expect(j.reasons[0].code).toBe('landscape');
  });
  it('저해상도 → 분석 불가', () => {
    expect(judgeByMetadata({ width: 200, height: 400 })).toMatchObject({ analyzable: false });
  });
  it('크기 없음 → 미판정', () => {
    expect(judgeByMetadata({})).toMatchObject({ isFullBody: null, analyzable: null });
  });
  it('정렬: 전신 > 미상 > 전신 아님, 중복·제외 URL 제거', () => {
    const r = rankSearchResults(
      [
        { imageUrl: 'https://a.com/1.jpg', width: 1200, height: 800 },
        { imageUrl: 'https://a.com/2.jpg' },
        { imageUrl: 'https://a.com/3.jpg', width: 600, height: 1000 },
        { imageUrl: 'http://a.com/3.jpg', width: 600, height: 1000 },
        { imageUrl: 'https://a.com/4.jpg', width: 600, height: 1000 },
      ],
      ['https://a.com/4.jpg'],
    );
    expect(r.map((x) => x.imageUrl)).toEqual(['https://a.com/3.jpg', 'https://a.com/2.jpg', 'https://a.com/1.jpg']);
  });
  it('canonicalUrl', () => {
    expect(canonicalUrl('https://x.com/a.jpg#f')).toBe('x.com/a.jpg');
    expect(canonicalUrl('mock://a')).toBe('mock://a');
  });
});

describe('갤러리 헬퍼', () => {
  const img = (id: string, extra: Partial<CelebImage> = {}): CelebImage => ({
    id,
    celebId: 'c',
    createdAt: '',
    category: 'signature',
    query: 'q',
    provider: 'naver',
    sourceUrl: 'https://img.example.com/a.jpg',
    isFullBody: true,
    analyzable: true,
    reasons: [],
    selected: false,
    isMock: false,
    ...extra,
  });
  it('groupByCategory는 빈 카테고리 키도 유지', () => {
    const g = groupByCategory([img('1'), img('2', { category: 'daily' })]);
    expect(g.signature).toHaveLength(1);
    expect(g.recent).toEqual([]);
    expect(g.daily).toHaveLength(1);
  });
  it('전신만 보기는 isFullBody=false만 숨김 (미판정은 표시)', () => {
    const list = [img('1'), img('2', { isFullBody: false }), img('3', { isFullBody: null })];
    expect(visibleImages(list, true).map((x) => x.id)).toEqual(['1', '3']);
    expect(visibleImages(list, false)).toHaveLength(3);
  });
  it('shortReason', () => {
    expect(shortReason(img('1'))).toBeUndefined();
    expect(shortReason(img('1', { isFullBody: false, analyzable: null }))).toBe('전신 아님');
    expect(shortReason(img('1', { analyzable: false, reasons: [{ code: 'backlight', message: '역광', severity: 'warn' }] }))).toBe('역광');
  });
  it('sourceLabel: 데모/페이지 호스트', () => {
    expect(sourceLabel(img('1', { provider: 'mock' }))).toBe('CELEBER 데모');
    expect(sourceLabel(img('1', { pageUrl: 'https://www.vogue.co.kr/x' }))).toBe('vogue.co.kr');
    expect(sourceLabel(img('1'))).toBe('img.example.com');
  });
  it('withBase는 상대 /api 경로에만 붙인다', () => {
    expect(withBase('http://h', '/api/uploads/up_1')).toBe('http://h/api/uploads/up_1');
    expect(withBase('http://h', 'data:image/png;base64,x')).toBe('data:image/png;base64,x');
    expect(withBase('', undefined)).toBeUndefined();
  });
});
