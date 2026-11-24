// 목업 데이터 (docs/ui/drafts/v4 시안의 문구·색 그대로).
// 사용자: 봄 웜 브라이트, 정본 팔레트 탠저린·코럴·피치·웜 틸·세이지·크림. 추구미: 한서도(가을 소프트).
import type { CaptureData, LandingData, LibraryData, NamedColor, PersonalColorData, SelfAnalysisData, StyleMuseData } from './types';

/** public/photos (v4 _src/photos를 JPEG로 줄인 것, 모두 생성 이미지) */
export const PHOTOS = {
  landingPortrait: '/photos/landing-scene.jpg', // v3 01 랜딩 전체 화면에서 상태 표시줄·로고·버튼·홈 인디케이터 자리를 주변색으로 메운 것 (780x1688)
  pose: '/photos/g-pose.jpg',
  selfie: '/photos/u-selfie.jpg',
  front: '/photos/u-front.jpg',
  side: '/photos/u-side.jpg',
  full: '/photos/u-full.jpg',
  applied: '/photos/u-applied.jpg',
  drapeHero: '/photos/u-drape-hero.jpg',
  drapeCoral: '/photos/u-drape-coral.jpg',
  drapePeach: '/photos/u-drape-peach.jpg',
  drapeLavender: '/photos/u-drape-lavender.jpg',
  drapeAshBlue: '/photos/u-drape-ashblue.jpg',
  museHero: '/photos/m-hero.jpg',
  museBacklit: '/photos/m-backlit.jpg',
  museIvory: '/photos/m-look-ivory.jpg',
  museBlue: '/photos/m-look-blue.jpg',
  museSit: '/photos/m-look-sit.jpg',
  museCoat: '/photos/m-look-coat.jpg',
  libYuna: '/photos/lib-yuna.jpg',
  libSeodo: '/photos/lib-seodo.jpg',
  libDoyoung: '/photos/lib-doyoung.jpg',
  libIan: '/photos/lib-ian.jpg',
} as const;

/** 사용자 정본 팔레트 (봄 웜 브라이트) */
export const SPRING_PALETTE: NamedColor[] = [
  { name: '탠저린', hex: '#DD7330' },
  { name: '코럴', hex: '#E2836F' },
  { name: '피치', hex: '#F6C39C' },
  { name: '웜 틸', hex: '#1F8A8A' },
  { name: '세이지', hex: '#8DB38C' },
  { name: '크림', hex: '#F1E4C8' },
];
const C = Object.fromEntries(SPRING_PALETTE.map((c) => [c.name, c.hex])) as Record<string, string>;

export const landing: LandingData = {
  portrait: PHOTOS.landingPortrait,
  logo: '/bi/logo-on-dark.svg',
  background: '/bi/color-halo-background.svg',
  startLabel: '시작하기',
};

export const capture: CaptureData = {
  steps: [
    { id: 'environment', title: '주변 밝기를 확인할게요', preview: PHOTOS.selfie, guide: PHOTOS.pose },
    { id: 'front', title: '정면을 바라봐 주세요', preview: PHOTOS.front, guide: PHOTOS.pose },
    { id: 'side', title: '고개를 옆으로 돌려 주세요', preview: PHOTOS.side, guide: PHOTOS.pose },
    { id: 'body', title: '전신이 나오게 서 주세요', preview: PHOTOS.full, guide: PHOTOS.pose, optional: true },
  ],
  startIndex: 1,
  light: { ok: true, items: ['자연광', '밝기 적정'] },
};

export const selfAnalysis: SelfAnalysisData = {
  photos: { full: PHOTOS.full, front: PHOTOS.front, side: PHOTOS.side },
  meta: '11월 23일 촬영 · 자연광 · 밝기 적정',
  headline: ['밝은 웜 베이지 피부와', '긴 타원형 얼굴이에요'],
  summary: ['노란기가 살짝 도는 밝고 맑은 피부예요.', '상체가 짧고 다리가 긴 편이라 짧은 상의가 잘 어울려요.'],
  skin: {
    caption: '얼굴 세 곳에서 추출',
    samples: [
      { name: '이마', hex: '#EBCFB9' },
      { name: '볼', hex: '#E6C1A8' },
      { name: '턱선', hex: '#D8B399' },
    ],
  },
  features: [
    { k: '피부 톤', v: '노란기 우세 · 맑은 결' },
    { k: '얼굴형', v: '긴 타원형 · 곧은 턱선' },
    { k: '이목구비', v: '곧은 눈썹 · 또렷한 눈매' },
    { k: '헤어', v: '가르마를 살린 미디엄 레이어' },
    { k: '전신 비율', v: '상체가 짧고 다리가 긴 편' },
    { k: '코디', v: '차콜 재킷 · 스트레이트 데님' },
    { k: '액세서리', v: '작은 실버 이어링' },
  ],
};

export const personalColor: PersonalColorData = {
  hero: PHOTOS.drapeHero,
  type: { ko: ['봄 웜', '브라이트'], en: 'SPRING WARM BRIGHT', confidence: 87, color: '#DD7330' },
  palette: SPRING_PALETTE,
  paletteNote: '얼굴 가까이 둘수록 좋아요',
  sliders: [
    { label: '밝은 명도', value: 70, ends: ['어두움', '밝음'] },
    { label: '선명한 채도', value: 64, ends: ['부드러움', '선명함'] },
    { label: '또렷한 대비', value: 72, ends: ['낮음', '높음'] },
  ],
  firstImpression: {
    body: '복숭앗빛 피부와 또렷한 눈매가 밝고 생기 있는 인상을 줘요. 선명한 웜 컬러를 얼굴 가까이 두면 혈색이 살아나요.',
    tags: ['생기', '맑음', '또렷함', '친근함'],
  },
  warmCool: { warm: 76, cool: 24 },
  drapes: [
    { photo: PHOTOS.drapeCoral, color: { name: '코럴', hex: C['코럴'] }, good: true, note: '혈색이 살아나요' },
    { photo: PHOTOS.drapePeach, color: { name: '피치', hex: C['피치'] }, good: true, note: '피부가 맑아 보여요' },
    { photo: PHOTOS.drapeLavender, color: { name: '라벤더 그레이', hex: '#968FA2' }, good: false, note: '안색이 창백해져요' },
    { photo: PHOTOS.drapeAshBlue, color: { name: '애시 블루', hex: '#7C889F' }, good: false, note: '피부가 칙칙해 보여요' },
  ],
  guide: [
    { k: '옷 색상', v: '크림 · 피치 · 세이지', dots: [C['크림'], C['피치'], C['세이지']] },
    { k: '포인트 컬러', v: '탠저린 · 웜 틸', dots: [C['탠저린'], C['웜 틸']] },
    { k: '액세서리', v: '샴페인 골드 · 따뜻한 진주', dots: ['linear-gradient(135deg,#F1DDB0,#C9A866)', 'radial-gradient(circle at 35% 35%,#FFFDF6,#E9DCC8)'] },
    { k: '헤어 컬러', v: '허니 브라운 · 웜 초콜릿', dots: ['#8A5A33', '#4E3122'] },
    { k: '그루밍', v: '살구빛 립밤 · 브라운 눈썹' },
    { k: '피할 스타일', v: '잿빛 모브 · 무거운 올블랙', dots: ['#8E8594', '#18171A'], avoid: true },
  ],
  report: {
    hair: {
      colors: [
        { name: '허니 브라운', hex: '#8A5A33' },
        { name: '카멜 브라운', hex: '#A0703F' },
        { name: '웜 초콜릿', hex: '#4E3122' },
        { name: '오렌지 브라운', hex: '#93502B' },
      ],
      note: '잿빛이 도는 애시 계열은 얼굴을 칙칙하게 만들어요.',
    },
    accessories: {
      colors: [
        { name: '샴페인 골드', hex: 'linear-gradient(135deg,#F1DDB0,#C9A866)' },
        { name: '로즈 골드', hex: 'linear-gradient(135deg,#F3D3C2,#C68E77)' },
        { name: '따뜻한 진주', hex: 'radial-gradient(circle at 35% 35%,#FFFDF6,#E9DCC8)' },
        { name: '브라운 가죽', hex: '#8B5A3C' },
      ],
      note: '차가운 실버보다 골드 톤 금속이 피부를 밝혀 줘요.',
    },
    grooming: [
      { k: '피부', v: '살구빛 톤업에 촉촉한 마무리' },
      { k: '눈썹', v: '브라운 펜슬로 빈 곳만 채우기' },
      { k: '입술', v: '살구빛 틴티드 립밤' },
      { k: '향', v: '시트러스 · 가벼운 우디' },
    ],
    avoid: [
      { color: { name: '무거운 올블랙', hex: '#18171A' }, note: '얼굴이 어둡게 가라앉아요' },
      { color: { name: '잿빛 모브', hex: '#8E8594' }, note: '혈색이 빠져 보여요' },
      { color: { name: '버건디', hex: '#6E2433' }, note: '피부의 붉은 기가 도드라져요' },
      { color: { name: '형광 네온', hex: '#C6F23A' }, note: '옷만 눈에 띄고 얼굴이 묻혀요' },
    ],
    today: [
      '크림 니트에 탠저린 머플러를 둘러 보세요',
      '검정 외투 안에는 피치나 코럴 이너를 받쳐 입어요',
      '시계와 반지는 샴페인 골드로 맞춰요',
      '살구빛 립밤으로 혈색을 더해요',
    ],
    accuracy: {
      level: '높음',
      factors: [
        { k: '조명', v: '자연광 · 밝기 적정', ok: true },
        { k: '사진', v: '정면 · 측면 · 전신 3장', ok: true },
        { k: '색 균형', v: '조금 따뜻하게 찍혔어요', ok: false },
      ],
      caution: '조명, 화장, 화면 설정에 따라 결과가 달라질 수 있어요. 낮 자연광에서 찍은 정면 사진을 여러 장 쓰면 더 정확해져요.',
    },
  },
};

export const styleMuse: StyleMuseData = {
  name: '한서도',
  hero: PHOTOS.museHero,
  photoCount: 6,
  rejected: { photo: PHOTOS.museBacklit, title: '올린 사진은 역광이 강해 분석하기 어려워요', body: '한서도의 다른 사진을 골라 주세요', badge: '역광' },
  looks: [
    { id: 'ivory', photo: PHOTOS.museIvory, title: '대표 룩', outfit: '아이보리 니트 · 차콜 팬츠', source: '화보 · 10월' },
    { id: 'blue', photo: PHOTOS.museBlue, title: '최근 룩', outfit: '오픈 셔츠 · 블랙 슬랙스', source: '공항 · 11월' },
  ],
  thumbs: [PHOTOS.museIvory, PHOTOS.museBlue, PHOTOS.museSit, PHOTOS.museCoat, PHOTOS.libSeodo, PHOTOS.museHero],
  selectedLookId: 'ivory',
  guide: {
    eyebrow: '대표 룩으로 분석했어요',
    title: '한서도의 추구미 가이드',
    body: ['니트의 부드러운 무드는 살리고,', '하의를 라이트 베이지로 바꾸고 코럴 스카프를 더했어요.'],
  },
  palettes: [
    {
      who: '한서도',
      type: '가을 소프트',
      colors: [
        { name: '오트밀', hex: '#EDE6D6' },
        { name: '토프', hex: '#A79C8C' },
        { name: '모카', hex: '#8E7A62' },
        { name: '차콜 그레이', hex: '#5C5752' },
        { name: '차콜', hex: '#3E3C3A' },
      ],
    },
    {
      who: '나',
      type: '봄 웜 브라이트',
      colors: [
        { name: '크림', hex: C['크림'] },
        { name: '피치', hex: C['피치'] },
        { name: '코럴', hex: C['코럴'] },
        { name: '탠저린', hex: C['탠저린'] },
        { name: '웜 틸', hex: C['웜 틸'] },
      ],
    },
  ],
  compare: [
    { photo: PHOTOS.museIvory, label: '한서도', title: '원본 룩', meta: '아이보리 니트 · 차콜 팬츠', bg: '#EBE7E2' },
    { photo: PHOTOS.applied, label: '나', title: '내 팔레트 적용', meta: '코럴 스카프 · 라이트 베이지', bg: '#F2EEEA' },
  ],
  points: [
    { k: '얼굴', v: ['앞머리 결을 살리고', '코럴 립밤으로 혈색을 더해요'] },
    { k: '코디', v: ['하의는 라이트 베이지로 바꾸고', '목에 코럴 스카프를 둘러요'] },
    { k: '분위기', v: ['밝은 톤을 위아래로 이어', '가볍고 생기 있게 연출해요'] },
  ],
};

export const library: LibraryData = {
  muses: [
    { id: 'yuna', name: '이윤아', photo: PHOTOS.libYuna, look: '라벤더 블라우스 룩' },
    { id: 'seodo', name: '한서도', photo: PHOTOS.libSeodo, look: '아이보리 니트 룩' },
    { id: 'doyoung', name: '김도영', photo: PHOTOS.libDoyoung, look: '네이비 테일러드 룩' },
    { id: 'ian', name: '서이안', photo: PHOTOS.libIan, look: '더스티 블루 니트 룩' },
  ],
  sortLabel: '최근 본 순',
  personalColor: { photo: PHOTOS.drapeHero, type: '봄 웜 브라이트', dots: [C['탠저린'], C['코럴'], C['피치'], C['웜 틸']], date: '11월 23일 진단' },
  analysis: { title: '내 분석 결과 다시 보기', sub: '정면 · 측면 · 전신 사진 3장' },
  reset: {
    title: '분석 정보 초기화',
    sub: '사진과 진단 결과를 모두 지워요',
    confirmTitle: '분석 정보를 모두 지울까요?',
    confirmBody: '촬영한 사진과 퍼스널컬러 진단, 찾은 추구미가 모두 지워져요. 지운 뒤에는 되돌릴 수 없어요.',
    confirmLabel: '지우기',
  },
};
