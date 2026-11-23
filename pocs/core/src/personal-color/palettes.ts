/**
 * 12톤 팔레트/프로필 데이터 (hex + 한국어 이름). 리포트 템플릿 서술의 기본 문구 포함.
 * 리포트 섹션 매핑:
 *   ② type: nameKo/nameEn/description/accentHex   ⑤ drapeBest/drapeWorst
 *   ⑥ tops   ⑦ outer   ⑧ point + metals   ⑨ hair/hairAvoid/hairTip
 *   ⑩ makeup(여성)/grooming(남성)   ⑪ avoidStyles   ① firstImpression/hashtags
 */
import type { Metal, NamedColor, Season, SwatchShape, Tone } from '../contracts';

const c = (hex: string, name: string, nameEn?: string): NamedColor => ({ hex: hex.toUpperCase(), name, ...(nameEn ? { nameEn } : {}) });

export interface ToneProfile {
  tone: Tone;
  season: Season;
  /** '여름쿨 뮤트' (레퍼런스 카드 표기) */
  nameKo: string;
  /** 'Summer Cool Muted' */
  nameEn: string;
  /** 강조 블록 배경색 */
  accentHex: string;
  /** 타입 설명 2~3줄 */
  description: string;
  /** 이미지 키워드 (④ 이미지 키워드 행) */
  imageKeywords: string[];
  /** ① 첫인상 bullet 기본 문구 */
  firstImpression: string[];
  /** ① 해시태그 (# 포함) */
  hashtags: string[];
  /** ③ 분석 포인트 기본 문구 */
  analysisPoint: string;
  /** 베스트 컬러 (범용) */
  best: NamedColor[];
  /** 워스트 컬러 (범용) */
  worst: NamedColor[];
  /** ⑤ 드레이핑: 잘 어울리는 톤 4 / 어울리지 않는 톤 4 */
  drapeBest: NamedColor[];
  drapeWorst: NamedColor[];
  /** ⑥ 상의(셔츠/블라우스) */
  tops: NamedColor[];
  topsTip: string;
  /** ⑦ 아우터/하의(수트) */
  outer: NamedColor[];
  outerTip: string;
  /** ⑧ 포인트 컬러 (넥타이/스카프) */
  point: NamedColor[];
  metals: Metal[];
  avoidMetals: Metal[];
  /** ⑨ 헤어 */
  hair: { color: NamedColor; description: string }[];
  hairIntro: string;
  hairAvoid: NamedColor[];
  hairTip: string;
  /** ⑩ 메이크업 색 (여성/메이크업 선택 시) */
  makeup: { base: string; lip: NamedColor[]; eye: NamedColor[]; cheek: NamedColor[] };
  /** ⑪ 비추천 스타일 */
  avoidStyles: { label: string; colors: NamedColor[]; shape: SwatchShape; reason: string }[];
  /** 웜/쿨 비교용 대표 색 (③ comparison) */
  warmSamples: NamedColor[];
  coolSamples: NamedColor[];
}

/* 자주 쓰는 공통 색 */
const BLACK = c('#111111', '블랙', 'Black');
const WINE = c('#6D1F2F', '와인', 'Wine');
const BURGUNDY = c('#8C1C2E', '버건디', 'Burgundy');
const NEON = c('#B5F23D', '네온 그린', 'Neon Green');
const NEON_PINK = c('#FF4FA3', '네온 핑크', 'Neon Pink');
const MUSTARD = c('#D4A017', '머스타드', 'Mustard');
const CAMEL = c('#C19A6B', '카멜 베이지', 'Camel');
const BRICK = c('#C4502B', '브릭 오렌지', 'Brick Orange');
const OLIVE_KHAKI = c('#6B6B3A', '올리브 카키', 'Olive Khaki');
const BROWN = c('#6F4E37', '브라운', 'Brown');
const PURE_WHITE = c('#FFFFFF', '퓨어 화이트', 'Pure White');
const CHARCOAL = c('#3B3D42', '차콜', 'Charcoal');
const COOL_GRAY = c('#8E9097', '쿨 그레이', 'Cool Gray');
const FUCHSIA = c('#B0196E', '푸시아', 'Fuchsia');
const ICY_PINK = c('#F3D3E3', '아이스 핑크', 'Icy Pink');
const NAVY_DEEP = c('#1C2340', '딥 네이비', 'Deep Navy');
const BLUE_BLACK = c('#141A26', '블루 블랙', 'Blue Black');
const ASH_GRAY_HAIR = c('#7D7F86', '애쉬 그레이', 'Ash Gray');
const ORANGE_BROWN_HAIR = c('#9A5A2C', '오렌지 브라운', 'Orange Brown');
const RED_BROWN_HAIR = c('#7A3B2E', '레드 브라운', 'Red Brown');
const GOLD_BLOND_HAIR = c('#C9A25E', '골드 블론드', 'Golden Blonde');

const WARM_SAMPLES = [c('#F2C9A0', '피치 베이지'), c('#E3A857', '애프리콧'), c('#C46A2B', '테라코타'), c('#8D8259', '카키')];
const COOL_SAMPLES = [c('#C9DAEC', '파우더 블루'), c('#A7A0B9', '라벤더 그레이'), c('#6E8CA8', '그레이시 블루'), c('#39455E', '소프트 네이비')];

export const TONE_PROFILES: Record<Tone, ToneProfile> = {
  /* ============================================================ SPRING */
  'spring-light': {
    tone: 'spring-light',
    season: 'spring',
    nameKo: '봄웜 라이트',
    nameEn: 'Spring Warm Light',
    accentHex: '#E9A98F',
    description: '밝고 따뜻한 파스텔 톤이 가장 잘 어울리며, 노란 기가 도는 맑은 색에서 혈색이 살아나고 생기 있어 보입니다.',
    imageKeywords: ['화사한', '부드러운', '친근한', '산뜻한'],
    firstImpression: ['밝고 친근한 인상', '부드럽고 화사한 분위기', '생기 있고 산뜻한 이미지', '편안하고 다정한 느낌'],
    hashtags: ['#화사함', '#친근함', '#산뜻함', '#부드러움'],
    analysisPoint: '피부에 노란 기가 은은하게 돌고 밝기가 높아, 맑은 웜 파스텔을 얼굴 옆에 두었을 때 혈색이 가장 자연스럽게 살아납니다.',
    best: [c('#F6C1A6', '피치'), c('#F7A08C', '라이트 코럴'), c('#F5E1A4', '버터 옐로'), c('#F6EEDC', '아이보리'), c('#D9B48F', '라이트 카멜'), c('#A8DDC4', '소프트 민트'), c('#9FD6D9', '라이트 아쿠아'), c('#CFC6B8', '라이트 웜 그레이')],
    worst: [BLACK, BURGUNDY, NAVY_DEEP, COOL_GRAY, CHARCOAL, FUCHSIA],
    drapeBest: [c('#F6C1A6', '피치'), c('#F7A08C', '라이트 코럴'), c('#F5E1A4', '버터 옐로'), c('#9FD6D9', '라이트 아쿠아')],
    drapeWorst: [BLACK, BURGUNDY, CHARCOAL, FUCHSIA],
    tops: [c('#F6EEDC', '아이보리'), c('#F4E3B5', '크림 옐로'), c('#F5C3B0', '피치 핑크'), c('#BFE3E0', '라이트 아쿠아'), c('#CDE8D5', '소프트 민트'), c('#B9D3E8', '웜 라이트 블루')],
    topsTip: '퓨어 화이트보다 아이보리·크림 계열 셔츠가 얼굴을 더 화사하게 만듭니다.',
    outer: [c('#C9A27E', '라이트 카멜'), c('#D8C3A5', '베이지'), c('#4A5A7E', '라이트 네이비'), c('#A39E94', '웜 그레이'), c('#A9805F', '밀크 브라운')],
    outerTip: '블랙·차콜 수트는 얼굴을 눌러 보이게 하니 베이지·라이트 카멜로 가볍게 연출하세요.',
    point: [c('#F27C62', '코럴'), c('#F2C14E', '골든 옐로'), c('#3FB8AF', '터콰이즈'), c('#8CC63F', '애플 그린')],
    metals: ['gold', 'champagne-gold', 'rose-gold'],
    avoidMetals: ['gunmetal', 'platinum'],
    hair: [
      { color: c('#8A6A4F', '밀크 브라운'), description: '부드럽고 화사한 인상' },
      { color: c('#8E6A3F', '골드 브라운'), description: '피부에 생기를 더함' },
      { color: c('#9C7A5B', '라이트 브라운'), description: '가볍고 경쾌한 분위기' },
      { color: c('#6B4A35', '소프트 브라운'), description: '자연스럽고 단정함' },
    ],
    hairIntro: '밝고 따뜻한 브라운이 피부의 맑은 노란 기를 살려 줍니다.',
    hairAvoid: [BLUE_BLACK, ASH_GRAY_HAIR],
    hairTip: '블루 블랙이나 애쉬 그레이는 얼굴을 창백하고 피곤해 보이게 할 수 있어요.',
    makeup: { base: '노란 기가 있는 아이보리~라이트 베이지(21호 웜)', lip: [c('#F08A7E', '코럴 핑크'), c('#F2A391', '피치'), c('#F59B83', '살몬')], eye: [c('#C79A7A', '피치 브라운'), c('#D8B887', '골드 베이지')], cheek: [c('#F7B49A', '피치')] },
    avoidStyles: [
      { label: '올블랙 코디', colors: [BLACK], shape: 'jacket', reason: '대비가 강해 얼굴이 무겁고 창백해 보입니다.' },
      { label: '버건디/와인', colors: [WINE], shape: 'jacket', reason: '깊은 쿨 레드는 생기를 눌러 칙칙해 보일 수 있습니다.' },
      { label: '차콜·쿨 그레이', colors: [CHARCOAL, COOL_GRAY], shape: 'suit', reason: '차가운 무채색이 혈색을 빼앗습니다.' },
      { label: '푸시아·비비드 쿨 핑크', colors: [FUCHSIA], shape: 'shirt', reason: '차가운 원색이 피부의 노란 기와 충돌합니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  'spring-bright': {
    tone: 'spring-bright',
    season: 'spring',
    nameKo: '봄웜 브라이트',
    nameEn: 'Spring Warm Bright',
    accentHex: '#F0784F',
    description: '선명하고 밝은 웜 컬러에서 눈빛과 이목구비가 또렷해집니다. 탁한 색보다 맑고 채도 높은 색이 잘 어울립니다.',
    imageKeywords: ['생기 있는', '경쾌한', '또렷한', '활동적인'],
    firstImpression: ['밝고 에너지 있는 인상', '또렷하고 생기 있는 이미지', '경쾌하고 활발한 분위기', '첫눈에 시선을 끄는 느낌'],
    hashtags: ['#생기', '#경쾌함', '#또렷함', '#에너지'],
    analysisPoint: '웜 베이스에 피부 채도와 대비가 높아, 맑고 선명한 웜 컬러를 대었을 때 얼굴이 가장 또렷해집니다.',
    best: [c('#FB603C', '코럴'), c('#F28C28', '탠저린'), c('#F6D743', '선샤인 옐로'), c('#3FB8AF', '터콰이즈'), c('#2BAE66', '클리어 그린'), c('#2F6DB5', '웜 코발트'), c('#F6EEDC', '아이보리'), c('#E94E5B', '워터멜론')],
    worst: [c('#7D7F86', '더스티 그레이'), c('#9B748A', '모브'), OLIVE_KHAKI, BURGUNDY, c('#A7A0B9', '라벤더 그레이'), BROWN],
    drapeBest: [c('#FB603C', '코럴'), c('#F6D743', '선샤인 옐로'), c('#3FB8AF', '터콰이즈'), c('#2F6DB5', '웜 코발트')],
    drapeWorst: [c('#9B748A', '모브'), OLIVE_KHAKI, c('#7D7F86', '더스티 그레이'), BURGUNDY],
    tops: [c('#F6EEDC', '아이보리'), c('#FFD9A8', '라이트 애프리콧'), c('#8FD3E8', '클리어 스카이'), c('#B8E1A8', '프레시 그린'), c('#FFB4A2', '라이트 코럴'), c('#2F6DB5', '웜 코발트')],
    topsTip: '채도 있는 맑은 컬러 셔츠 한 장으로 인상이 확 밝아집니다.',
    outer: [c('#2C3E70', '브라이트 네이비'), c('#C19A6B', '카멜'), c('#E9D8B6', '라이트 베이지'), c('#5E6E52', '웜 올리브'), c('#4A4A4A', '웜 차콜')],
    outerTip: '탁한 회색 수트 대신 선명한 네이비·카멜로 대비를 살리세요.',
    point: [c('#E0473F', '토마토 레드'), c('#F28C28', '탠저린'), c('#3FB8AF', '터콰이즈'), c('#F6D743', '선샤인 옐로')],
    metals: ['gold', 'champagne-gold'],
    avoidMetals: ['gunmetal'],
    hair: [
      { color: c('#7A4F2E', '골든 브라운'), description: '선명하고 생기 있는 인상' },
      { color: c('#5A3A26', '초콜릿 브라운'), description: '또렷한 대비 유지' },
      { color: c('#8A5A35', '카라멜 브라운'), description: '밝고 경쾌한 분위기' },
      { color: c('#3E2C23', '다크 브라운'), description: '단정하고 선명함' },
    ],
    hairIntro: '윤기 있는 웜 브라운이 선명한 이목구비와 잘 어울립니다.',
    hairAvoid: [ASH_GRAY_HAIR, c('#8C8279', '더스티 애쉬')],
    hairTip: '회색 기가 도는 애쉬 컬러는 얼굴의 생기를 떨어뜨릴 수 있어요.',
    makeup: { base: '맑은 웜 베이지(21~23호 웜)', lip: [c('#E0473F', '토마토 레드'), c('#FB603C', '코럴'), c('#F2786A', '브라이트 피치')], eye: [c('#C88A4E', '골드 브라운'), c('#E3A857', '애프리콧')], cheek: [c('#FF9E80', '브라이트 코럴')] },
    avoidStyles: [
      { label: '탁한 그레이 톤온톤', colors: [c('#7D7F86', '더스티 그레이')], shape: 'suit', reason: '채도가 빠진 색이 얼굴을 흐릿하게 만듭니다.' },
      { label: '모브·라벤더 그레이', colors: [c('#9B748A', '모브')], shape: 'shirt', reason: '쿨하고 탁한 색이 혈색을 가립니다.' },
      { label: '올리브 카키', colors: [OLIVE_KHAKI], shape: 'jacket', reason: '깊고 탁한 웜 컬러는 생기를 눌러 무거워 보입니다.' },
      { label: '버건디/와인', colors: [BURGUNDY], shape: 'jacket', reason: '깊은 쿨 레드는 밝은 인상과 맞지 않습니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  'spring-warm': {
    tone: 'spring-warm',
    season: 'spring',
    nameKo: '봄웜 트루',
    nameEn: 'Spring Warm True',
    accentHex: '#E8935A',
    description: '노란 기가 분명한 따뜻한 컬러가 가장 잘 어울립니다. 골드·애프리콧·웜 그린 계열에서 피부가 윤기 있어 보입니다.',
    imageKeywords: ['따뜻한', '건강한', '밝은', '내추럴'],
    firstImpression: ['따뜻하고 건강한 인상', '밝고 친근한 이미지', '자연스럽고 편안한 분위기', '혈색이 좋아 보이는 느낌'],
    hashtags: ['#따뜻함', '#건강미', '#친근함', '#내추럴'],
    analysisPoint: '피부 색상각이 노란 쪽에 가깝고 b* 값이 높아, 골드·애프리콧 계열을 대었을 때 윤기가 가장 잘 살아납니다.',
    best: [c('#E3A857', '애프리콧'), c('#F2C14E', '골든 옐로'), c('#F27C62', '코럴'), c('#C19A6B', '카멜'), c('#8CC63F', '애플 그린'), c('#2A9D8F', '웜 틸'), c('#F3EBDD', '아이보리'), c('#D9622B', '탠저린 오렌지')],
    worst: [BLACK, c('#C9DAEC', '파우더 블루'), COOL_GRAY, FUCHSIA, c('#A7A0B9', '라벤더 그레이'), PURE_WHITE],
    drapeBest: [c('#E3A857', '애프리콧'), c('#F2C14E', '골든 옐로'), c('#F27C62', '코럴'), c('#8CC63F', '애플 그린')],
    drapeWorst: [BLACK, c('#C9DAEC', '파우더 블루'), FUCHSIA, COOL_GRAY],
    tops: [c('#F3EBDD', '아이보리'), c('#F4DDB0', '웜 크림'), c('#F5BE9A', '애프리콧'), c('#CFE3A8', '라이트 올리브 그린'), c('#A9D6CF', '웜 아쿠아'), c('#E9C46A', '골든 옐로')],
    topsTip: '크림·애프리콧 셔츠에 골드 액세서리를 더하면 건강한 인상이 강조됩니다.',
    outer: [c('#C19A6B', '카멜'), c('#A67B5B', '탠'), c('#8D8259', '카키 베이지'), c('#3A4A6B', '웜 네이비'), c('#7B5B47', '모카')],
    outerTip: '카멜·탠 수트가 가장 안정적입니다. 블랙 대신 웜 네이비를 고르세요.',
    point: [c('#D9622B', '탠저린'), c('#2A9D8F', '웜 틸'), c('#F2C14E', '골든 옐로'), c('#B5651D', '러스트')],
    metals: ['gold', 'bronze', 'champagne-gold'],
    avoidMetals: ['silver', 'platinum'],
    hair: [
      { color: c('#8E6A3F', '골드 브라운'), description: '피부 윤기를 살림' },
      { color: c('#8A5A35', '카라멜 브라운'), description: '따뜻하고 건강한 인상' },
      { color: c('#6F4E37', '웜 브라운'), description: '자연스럽고 차분함' },
      { color: c('#A9805F', '밀크티 브라운'), description: '부드럽고 밝은 분위기' },
    ],
    hairIntro: '노란 기가 있는 골드·카라멜 브라운이 가장 자연스럽습니다.',
    hairAvoid: [BLUE_BLACK, ASH_GRAY_HAIR],
    hairTip: '블루 블랙·애쉬 계열은 피부를 누렇게 보이게 할 수 있어요.',
    makeup: { base: '옐로 베이스 라이트~미디엄 베이지', lip: [c('#E07A5F', '코럴 브라운'), c('#F27C62', '코럴'), c('#D9622B', '오렌지 레드')], eye: [c('#B88A5A', '카멜 브라운'), c('#D4AF37', '골드')], cheek: [c('#F2A391', '피치 코럴')] },
    avoidStyles: [
      { label: '올블랙 코디', colors: [BLACK], shape: 'jacket', reason: '얼굴이 칙칙하고 무거워 보입니다.' },
      { label: '파스텔 쿨 블루', colors: [c('#C9DAEC', '파우더 블루')], shape: 'shirt', reason: '차가운 파스텔이 피부를 누렇게 보이게 합니다.' },
      { label: '푸시아·쿨 핑크', colors: [FUCHSIA], shape: 'shirt', reason: '차가운 핑크가 피부 톤과 충돌합니다.' },
      { label: '쿨 그레이 수트', colors: [COOL_GRAY], shape: 'suit', reason: '푸른 회색이 혈색을 빼앗습니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  /* ============================================================ SUMMER */
  'summer-light': {
    tone: 'summer-light',
    season: 'summer',
    nameKo: '여름쿨 라이트',
    nameEn: 'Summer Cool Light',
    accentHex: '#9FB4D6',
    description: '밝고 부드러운 쿨 파스텔이 가장 잘 어울립니다. 흰 기가 섞인 맑은 색에서 피부가 투명하고 깨끗해 보입니다.',
    imageKeywords: ['청순한', '깨끗한', '부드러운', '맑은'],
    firstImpression: ['맑고 깨끗한 인상', '부드럽고 청순한 이미지', '차분하고 단정한 분위기', '편안하고 온화한 느낌'],
    hashtags: ['#깨끗함', '#청순', '#부드러움', '#맑음'],
    analysisPoint: '피부가 밝고 핑크 기가 있어, 흰 기가 섞인 쿨 파스텔을 얼굴 옆에 두었을 때 피부가 가장 투명해 보입니다.',
    best: [c('#C9DAEC', '파우더 블루'), c('#E8B4BC', '로즈 핑크'), c('#C3B6DC', '쿨 라벤더'), c('#BFD8E6', '아이스 블루'), c('#A8C3A0', '민트 그레이'), c('#F4C9D2', '베이비 핑크'), c('#F8F6F0', '오프 화이트'), c('#B9BBC0', '실버 그레이')],
    worst: [BLACK, c('#D4A017', '머스타드'), BRICK, OLIVE_KHAKI, BROWN, c('#F28C28', '탠저린')],
    drapeBest: [c('#C9DAEC', '파우더 블루'), c('#E8B4BC', '로즈 핑크'), c('#C3B6DC', '쿨 라벤더'), c('#BFD8E6', '아이스 블루')],
    drapeWorst: [MUSTARD, BRICK, OLIVE_KHAKI, c('#F28C28', '탠저린')],
    tops: [c('#F8F6F0', '오프 화이트'), c('#C9DAEC', '파우더 블루'), c('#F4C9D2', '베이비 핑크'), c('#D9D9DC', '라이트 그레이'), c('#C3B6DC', '쿨 라벤더'), c('#CFE5E1', '아쿠아 민트')],
    topsTip: '오프 화이트·파우더 블루 셔츠가 가장 깨끗한 인상을 줍니다.',
    outer: [c('#5B6E8F', '라이트 네이비'), c('#9AA3B0', '블루 그레이'), c('#B9BBC0', '실버 그레이'), c('#D8D2CC', '라이트 그레이지'), c('#7A7F8C', '미디엄 그레이')],
    outerTip: '진한 블랙보다 라이트 네이비·블루 그레이로 가볍게 맞추세요.',
    point: [c('#D7A3A8', '더스티 로즈'), c('#7FA7D6', '소프트 블루'), c('#B7A6D6', '라벤더'), c('#6FB7B0', '아쿠아')],
    metals: ['silver', 'white-gold', 'platinum'],
    avoidMetals: ['gold', 'bronze'],
    hair: [
      { color: c('#6F5E55', '애쉬 브라운'), description: '부드럽고 맑은 인상' },
      { color: c('#8B7468', '라이트 애쉬 브라운'), description: '가볍고 투명한 분위기' },
      { color: c('#5A4A48', '로즈 브라운'), description: '혈색을 은은하게 더함' },
      { color: c('#3E3434', '소프트 다크 브라운'), description: '단정하고 차분함' },
    ],
    hairIntro: '노란 기를 뺀 애쉬·로즈 브라운이 피부를 맑게 보이게 합니다.',
    hairAvoid: [ORANGE_BROWN_HAIR, GOLD_BLOND_HAIR],
    hairTip: '오렌지·골드 기가 강한 컬러는 피부를 붉거나 누렇게 보이게 할 수 있어요.',
    makeup: { base: '핑크 베이스 라이트(13~21호 쿨)', lip: [c('#E8A0B0', '로즈 핑크'), c('#D98BA0', '라즈베리 밀크'), c('#F4B6C2', '베이비 핑크')], eye: [c('#B9A9C9', '라벤더 그레이'), c('#C8B4A6', '쿨 베이지')], cheek: [c('#F4C2CF', '라이트 로즈')] },
    avoidStyles: [
      { label: '올블랙 코디', colors: [BLACK], shape: 'jacket', reason: '강한 대비가 부드러운 인상을 눌러 피곤해 보입니다.' },
      { label: '머스타드·옐로', colors: [MUSTARD], shape: 'knit', reason: '노란 기가 피부를 칙칙하게 만듭니다.' },
      { label: '브라운 계열', colors: [BROWN], shape: 'jacket', reason: '따뜻하고 깊은 색이 얼굴을 무겁게 합니다.' },
      { label: '오렌지·브릭', colors: [BRICK], shape: 'shirt', reason: '피부의 붉은 기를 강조할 수 있습니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  'summer-cool': {
    tone: 'summer-cool',
    season: 'summer',
    nameKo: '여름쿨 트루',
    nameEn: 'Summer Cool True',
    accentHex: '#6E86B8',
    description: '푸른 기가 도는 시원한 중간 톤이 잘 어울립니다. 회색 기가 살짝 섞인 블루·로즈 계열에서 피부가 깨끗해 보입니다.',
    imageKeywords: ['시원한', '지적인', '단정한', '세련된'],
    firstImpression: ['차분하고 신뢰감 있는 인상', '지적이고 단정한 이미지', '시원하고 깔끔한 분위기', '전체적으로 균형 잡힌 느낌'],
    hashtags: ['#신뢰감', '#지적', '#단정함', '#시원함'],
    analysisPoint: '피부의 핑크 베이스가 뚜렷해, 푸른 계열을 얼굴 옆에 두었을 때 피부가 더 깨끗하고 맑아 보입니다.',
    best: [c('#5B7DB1', '미디엄 블루'), c('#7FA7D6', '소프트 블루'), c('#C98C9A', '로즈'), c('#8E7CC3', '라일락'), c('#2E3F6E', '쿨 네이비'), c('#6FB7B0', '쿨 아쿠아'), c('#A5A3AA', '쿨 그레이'), c('#F8F6F0', '오프 화이트')],
    worst: [c('#F28C28', '탠저린'), MUSTARD, CAMEL, BRICK, OLIVE_KHAKI, c('#D9622B', '오렌지')],
    drapeBest: [c('#7FA7D6', '소프트 블루'), c('#8E7CC3', '라일락'), c('#5B7DB1', '미디엄 블루'), c('#2E3F6E', '쿨 네이비')],
    drapeWorst: [MUSTARD, CAMEL, BRICK, OLIVE_KHAKI],
    tops: [c('#F8F6F0', '화이트'), c('#A9C4E2', '스카이 블루'), c('#D9D9DC', '라이트 그레이'), c('#C9DAEC', '파우더 블루'), c('#D7C6E6', '쿨 라벤더'), c('#2E3F6E', '네이비')],
    topsTip: '화이트·스카이 블루 셔츠에 네이비를 더하면 가장 깔끔합니다.',
    outer: [c('#2E3F6E', '쿨 네이비'), c('#4A4E57', '차콜 그레이'), c('#8C8F96', '미디엄 그레이'), c('#2A3350', '미드나잇 네이비'), c('#6E7B91', '블루 그레이')],
    outerTip: '네이비·블루 그레이 수트가 안정적입니다. 브라운 계열은 피하세요.',
    point: [c('#2E3F6E', '네이비'), c('#B0234A', '라즈베리'), c('#5B7DB1', '스틸 블루'), c('#6B4E9B', '퍼플')],
    metals: ['silver', 'white-gold', 'platinum'],
    avoidMetals: ['gold', 'bronze'],
    hair: [
      { color: c('#3E3434', '쿨 다크 브라운'), description: '차분하고 단정한 인상' },
      { color: c('#2A2A2E', '소프트 블랙'), description: '깔끔하고 지적인 분위기' },
      { color: c('#5A4A48', '로즈 브라운'), description: '부드러운 혈색' },
      { color: c('#6F5E55', '애쉬 브라운'), description: '세련되고 가벼움' },
    ],
    hairIntro: '노란 기 없는 쿨 브라운·소프트 블랙이 피부를 맑게 합니다.',
    hairAvoid: [ORANGE_BROWN_HAIR, GOLD_BLOND_HAIR],
    hairTip: '밝은 오렌지·골드 브라운은 피부를 노랗게 보이게 할 수 있어요.',
    makeup: { base: '핑크~뉴트럴 베이스(21호 쿨)', lip: [c('#C25A7C', '로즈 베리'), c('#D47A93', '쿨 로즈'), c('#B0234A', '라즈베리')], eye: [c('#8C7F95', '쿨 토프'), c('#A5A3AA', '쿨 그레이')], cheek: [c('#E8A0B0', '쿨 핑크')] },
    avoidStyles: [
      { label: '오렌지·탠저린', colors: [c('#F28C28', '탠저린')], shape: 'shirt', reason: '노란 기가 강한 원색은 피부를 붉게 보이게 합니다.' },
      { label: '카멜·브라운 수트', colors: [CAMEL, BROWN], shape: 'suit', reason: '따뜻한 갈색이 얼굴을 칙칙하게 합니다.' },
      { label: '머스타드·카키', colors: [MUSTARD, OLIVE_KHAKI], shape: 'knit', reason: '탁한 노란 계열이 피부와 충돌합니다.' },
      { label: '형광/네온 컬러', colors: [NEON], shape: 'jacket', reason: '과한 채도가 얼굴보다 옷을 먼저 보이게 합니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  'summer-mute': {
    tone: 'summer-mute',
    season: 'summer',
    nameKo: '여름쿨 뮤트',
    nameEn: 'Summer Cool Muted',
    accentHex: '#5E6390',
    description: '밝고 부드러운 쿨톤이 가장 잘 어울리며, 채도가 낮은 차분한 색에서 인상이 깔끔하고 세련되게 표현됩니다.',
    imageKeywords: ['소프트', '세련된', '스마트', '깔끔한'],
    firstImpression: ['차분하고 신뢰감 있는 인상', '지적이고 깔끔한 이미지', '부드러운 카리스마와 안정감', '전체적으로 균형 잡힌 분위기'],
    hashtags: ['#신뢰감', '#지적', '#세련된', '#차분한'],
    analysisPoint: '피부의 핑크 베이스가 도드라지고, 푸른 계열을 얼굴 옆에 두었을 때 피부가 더 깨끗하고 맑아 보입니다.',
    best: [c('#91A6BE', '더스티 블루'), c('#A7A0B9', '라벤더 그레이'), c('#39455E', '소프트 네이비'), c('#9B748A', '모브'), c('#6E8CA8', '그레이시 블루'), c('#A5A3AA', '쿨 그레이'), c('#D7A3A8', '더스티 로즈'), c('#9CAF88', '세이지')],
    worst: [MUSTARD, CAMEL, BRICK, OLIVE_KHAKI, NEON, BLACK],
    drapeBest: [c('#7FA7D6', '소프트 블루'), c('#A7A0B9', '라벤더 그레이'), c('#6E8CA8', '그레이시 블루'), c('#1F2A44', '쿨 네이비')],
    drapeWorst: [MUSTARD, CAMEL, BRICK, OLIVE_KHAKI],
    tops: [c('#F8F6F0', '화이트'), c('#A9C4E2', '소프트 블루'), c('#D9D9DC', '라이트 그레이'), c('#BFD8E6', '스카이 블루'), c('#D7C6E6', '쿨 라벤더'), c('#1F2A44', '네이비')],
    topsTip: '무채색 + 밝은 쿨톤 컬러 조합이 가장 안정적이고 세련됩니다.',
    outer: [c('#1F2A44', '네이비'), c('#4A4E57', '차콜 그레이'), c('#8C8F96', '미디엄 그레이'), c('#2E3A55', '소프트 네이비'), c('#6E7B91', '블루 그레이')],
    outerTip: '진한 블랙, 브라운 계열은 인상이 무거워 보일 수 있습니다.',
    point: [c('#1F2A44', '네이비'), c('#3E2C2E', '다크 브라운'), c('#2A3350', '미드나잇 블루'), c('#4A4E57', '차콜')],
    metals: ['silver', 'white-gold', 'modern-metal'],
    avoidMetals: ['gold', 'bronze'],
    hair: [
      { color: c('#3E3230', '다크 브라운'), description: '차분하고 세련된 인상' },
      { color: c('#6F5E55', '애쉬 브라운'), description: '부드럽고 가벼운 분위기' },
      { color: c('#1E1E22', '소프트 블랙'), description: '깔끔하고 단정함' },
      { color: c('#1A1F2B', '블루 블랙'), description: '시원하고 또렷함' },
    ],
    hairIntro: '자연광에서 더 세련되고 부드러운 인상을 주는 색',
    hairAvoid: [ORANGE_BROWN_HAIR, RED_BROWN_HAIR],
    hairTip: '밝은 브라운, 붉은기 강한 컬러는 피부를 노랗게 보이게 할 수 있어요.',
    makeup: { base: '핑크~뉴트럴 베이스(21호 쿨/뉴트럴)', lip: [c('#C98C9A', '말린 장미'), c('#B07A8A', '모브 로즈'), c('#D7A3A8', '더스티 핑크')], eye: [c('#9E8E8C', '쿨 토프'), c('#A7A0B9', '라벤더 그레이')], cheek: [c('#D9A5AE', '소프트 로즈')] },
    avoidStyles: [
      { label: '올블랙 코디', colors: [BLACK], shape: 'jacket', reason: '강한 대비가 부드러운 인상을 무겁게 만듭니다.' },
      { label: '버건디/와인', colors: [c('#8C1C2E', '버건디')], shape: 'jacket', reason: '깊고 선명한 레드가 얼굴보다 먼저 보입니다.' },
      { label: '브라운 계열', colors: [c('#8A5A35', '브라운')], shape: 'jacket', reason: '따뜻한 갈색이 피부를 칙칙하게 보이게 합니다.' },
      { label: '형광/네온 컬러', colors: [NEON], shape: 'jacket', reason: '과한 채도가 차분한 인상과 충돌합니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  /* ============================================================ AUTUMN */
  'autumn-mute': {
    tone: 'autumn-mute',
    season: 'autumn',
    nameKo: '가을웜 뮤트',
    nameEn: 'Autumn Warm Muted',
    accentHex: '#A08C6E',
    description: '부드럽고 차분한 웜 톤이 잘 어울립니다. 회색 기가 섞인 베이지·카키·로즈 브라운에서 인상이 고급스럽고 편안해 보입니다.',
    imageKeywords: ['차분한', '내추럴', '고급스러운', '편안한'],
    firstImpression: ['차분하고 편안한 인상', '자연스럽고 고급스러운 이미지', '부드럽고 성숙한 분위기', '신뢰감을 주는 안정감'],
    hashtags: ['#차분함', '#내추럴', '#고급스러움', '#편안함'],
    analysisPoint: '노란 기가 있지만 채도가 낮아, 회색 기가 섞인 웜 컬러를 대었을 때 피부 결이 가장 매끄럽게 보입니다.',
    best: [c('#BCA58A', '그레이지'), c('#9CAF88', '세이지'), c('#8D8259', '카키'), c('#C98C7A', '로즈 브라운'), c('#9E7B5F', '토프'), c('#7B6A5A', '웜 토프'), c('#D8C3A5', '베이지'), c('#6E7A6A', '그레이 올리브')],
    worst: [BLACK, PURE_WHITE, FUCHSIA, c('#2F6DB5', '코발트 블루'), NEON, ICY_PINK],
    drapeBest: [c('#BCA58A', '그레이지'), c('#9CAF88', '세이지'), c('#C98C7A', '로즈 브라운'), c('#8D8259', '카키')],
    drapeWorst: [BLACK, FUCHSIA, c('#2F6DB5', '코발트 블루'), ICY_PINK],
    tops: [c('#EEE8DA', '크림'), c('#D8C3A5', '베이지'), c('#C9D1BC', '세이지 그린'), c('#E3C9B6', '누드 핑크'), c('#BCA58A', '그레이지'), c('#A3B1C2', '웜 그레이 블루')],
    topsTip: '크림·베이지 셔츠에 토프 계열 니트를 겹치면 가장 편안하고 고급스럽습니다.',
    outer: [c('#9E7B5F', '토프'), c('#6F6552', '올리브 그레이'), c('#7B5B47', '모카'), c('#4B4A45', '웜 차콜'), c('#3A4252', '그레이시 네이비')],
    outerTip: '선명한 블랙 수트 대신 토프·웜 차콜로 부드럽게 맞추세요.',
    point: [c('#A0413C', '브릭 로즈'), c('#5E6E52', '올리브'), c('#B07A5A', '테라코타 베이지'), c('#4F6F6A', '그레이 틸')],
    metals: ['champagne-gold', 'gold', 'bronze'],
    avoidMetals: ['platinum'],
    hair: [
      { color: c('#6F5A48', '모카 브라운'), description: '부드럽고 차분한 인상' },
      { color: c('#7D6B5D', '애쉬 브라운'), description: '자연스럽고 세련됨' },
      { color: c('#5C4033', '다크 브라운'), description: '단정하고 안정적' },
      { color: c('#8A6E4B', '올리브 브라운'), description: '고급스러운 분위기' },
    ],
    hairIntro: '채도가 낮은 모카·애쉬 브라운이 피부를 매끄럽게 보이게 합니다.',
    hairAvoid: [BLUE_BLACK, c('#9A3A2C', '체리 레드')],
    hairTip: '블루 블랙이나 선명한 레드 계열은 얼굴을 딱딱하게 보이게 할 수 있어요.',
    makeup: { base: '뉴트럴~옐로 베이스 미디엄 베이지', lip: [c('#B87368', '로즈 브라운'), c('#C98C7A', 'MLBB 누드'), c('#A0574F', '말린 브릭')], eye: [c('#9E7B5F', '토프'), c('#8D8259', '카키 브라운')], cheek: [c('#D29B88', '누드 피치')] },
    avoidStyles: [
      { label: '올블랙 코디', colors: [BLACK], shape: 'jacket', reason: '강한 대비가 부드러운 피부 결을 거칠어 보이게 합니다.' },
      { label: '퓨어 화이트', colors: [PURE_WHITE], shape: 'shirt', reason: '차갑고 밝은 흰색이 피부를 누렇게 보이게 합니다.' },
      { label: '비비드 쿨 컬러', colors: [FUCHSIA, c('#2F6DB5', '코발트 블루')], shape: 'shirt', reason: '선명한 쿨 원색이 얼굴을 흐리게 만듭니다.' },
      { label: '형광/네온 컬러', colors: [NEON], shape: 'jacket', reason: '과한 채도가 차분한 인상과 충돌합니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  'autumn-warm': {
    tone: 'autumn-warm',
    season: 'autumn',
    nameKo: '가을웜 트루',
    nameEn: 'Autumn Warm True',
    accentHex: '#B5651D',
    description: '깊고 따뜻한 어스 컬러가 가장 잘 어울립니다. 카멜·테라코타·올리브에서 얼굴이 건강하고 깊이 있어 보입니다.',
    imageKeywords: ['따뜻한', '깊이 있는', '클래식', '성숙한'],
    firstImpression: ['따뜻하고 깊이 있는 인상', '클래식하고 성숙한 이미지', '안정감 있는 분위기', '건강하고 자연스러운 느낌'],
    hashtags: ['#클래식', '#따뜻함', '#깊이감', '#안정감'],
    analysisPoint: '노란 기와 채도가 함께 높아, 깊은 어스 컬러를 대었을 때 피부가 건강하고 윤기 있어 보입니다.',
    best: [CAMEL, c('#C46A2B', '테라코타'), c('#8A8F3C', '올리브'), c('#B5651D', '러스트'), c('#D4A017', '머스타드'), c('#2F5D50', '포레스트 그린'), c('#6F4E37', '커피 브라운'), c('#EEE8DA', '크림')],
    worst: [c('#C9DAEC', '파우더 블루'), ICY_PINK, FUCHSIA, COOL_GRAY, PURE_WHITE, c('#B7A6D6', '라벤더')],
    drapeBest: [CAMEL, c('#C46A2B', '테라코타'), c('#8A8F3C', '올리브'), c('#2F5D50', '포레스트 그린')],
    drapeWorst: [c('#C9DAEC', '파우더 블루'), ICY_PINK, FUCHSIA, c('#B7A6D6', '라벤더')],
    tops: [c('#EEE8DA', '크림'), c('#E8D9C0', '라이트 베이지'), c('#D9B48F', '카멜 베이지'), c('#C9C29A', '라이트 카키'), c('#E3A857', '애프리콧'), c('#A9B48E', '올리브 그린')],
    topsTip: '크림 셔츠에 카멜·올리브 아이템을 매치하면 가장 자연스럽습니다.',
    outer: [CAMEL, c('#6F4E37', '브라운'), c('#5E6E52', '올리브'), c('#3B3A36', '웜 차콜'), c('#8D8259', '카키')],
    outerTip: '블랙 대신 브라운·올리브 수트가 얼굴을 더 건강하게 보이게 합니다.',
    point: [c('#B5651D', '러스트'), c('#D4A017', '머스타드'), c('#2F5D50', '포레스트 그린'), c('#8C3B2E', '브릭 레드')],
    metals: ['gold', 'bronze', 'champagne-gold'],
    avoidMetals: ['silver', 'platinum'],
    hair: [
      { color: c('#6F4E37', '웜 브라운'), description: '깊고 따뜻한 인상' },
      { color: c('#8A5A35', '카퍼 브라운'), description: '윤기 있고 건강함' },
      { color: c('#5C4033', '다크 초콜릿'), description: '단정하고 클래식' },
      { color: c('#8E6A3F', '골드 브라운'), description: '부드러운 생기' },
    ],
    hairIntro: '따뜻한 브라운·카퍼 계열이 피부의 노란 기와 조화를 이룹니다.',
    hairAvoid: [BLUE_BLACK, ASH_GRAY_HAIR],
    hairTip: '애쉬 그레이·블루 블랙은 피부를 창백하게 보이게 할 수 있어요.',
    makeup: { base: '옐로 베이스 미디엄 베이지(23호 웜)', lip: [c('#B5651D', '브릭 브라운'), c('#C46A2B', '테라코타'), c('#A0413C', '칠리 레드')], eye: [c('#8B5A2B', '코냑 브라운'), c('#8A8F3C', '올리브')], cheek: [c('#D08A64', '테라코타 피치')] },
    avoidStyles: [
      { label: '쿨 파스텔', colors: [c('#C9DAEC', '파우더 블루'), ICY_PINK], shape: 'shirt', reason: '차가운 파스텔이 피부를 누렇게 보이게 합니다.' },
      { label: '푸시아·쿨 핑크', colors: [FUCHSIA], shape: 'shirt', reason: '쿨 핑크가 깊은 웜 피부와 충돌합니다.' },
      { label: '쿨 그레이 수트', colors: [COOL_GRAY], shape: 'suit', reason: '푸른 회색이 얼굴을 칙칙하게 만듭니다.' },
      { label: '퓨어 화이트', colors: [PURE_WHITE], shape: 'shirt', reason: '차가운 흰색보다 크림이 훨씬 자연스럽습니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  'autumn-deep': {
    tone: 'autumn-deep',
    season: 'autumn',
    nameKo: '가을웜 딥',
    nameEn: 'Autumn Warm Deep',
    accentHex: '#5C3A2A',
    description: '짙고 따뜻한 컬러가 잘 어울립니다. 다크 브라운·딥 올리브·와인 브라운에서 이목구비가 또렷하고 카리스마 있어 보입니다.',
    imageKeywords: ['깊은', '카리스마', '고급스러운', '중후한'],
    firstImpression: ['깊이 있고 카리스마 있는 인상', '고급스럽고 중후한 이미지', '진중하고 믿음직한 분위기', '또렷한 존재감'],
    hashtags: ['#카리스마', '#고급스러움', '#깊이감', '#중후함'],
    analysisPoint: '웜 베이스에 명도가 낮고 대비가 커서, 깊고 진한 웜 컬러를 대었을 때 얼굴 윤곽이 가장 또렷해집니다.',
    best: [c('#5C4033', '다크 브라운'), c('#1E4D3A', '딥 그린'), c('#6D2E2E', '와인 브라운'), c('#8B5A2B', '코냑'), c('#4F4A2A', '딥 올리브'), c('#2B3A4A', '딥 틸 네이비'), c('#B5651D', '러스트'), c('#EEE8DA', '크림')],
    worst: [c('#F4C9D2', '베이비 핑크'), c('#C9DAEC', '파우더 블루'), c('#C3B6DC', '쿨 라벤더'), COOL_GRAY, NEON, ICY_PINK],
    drapeBest: [c('#5C4033', '다크 브라운'), c('#1E4D3A', '딥 그린'), c('#6D2E2E', '와인 브라운'), c('#8B5A2B', '코냑')],
    drapeWorst: [c('#F4C9D2', '베이비 핑크'), c('#C9DAEC', '파우더 블루'), c('#C3B6DC', '쿨 라벤더'), ICY_PINK],
    tops: [c('#EEE8DA', '크림'), c('#D8C3A5', '베이지'), c('#B88A5A', '카멜'), c('#6E6A3E', '딥 올리브'), c('#7A3B2E', '브릭'), c('#2B3A4A', '딥 틸')],
    topsTip: '크림 셔츠 + 짙은 웜 컬러 아우터로 대비를 살리면 가장 멋스럽습니다.',
    outer: [c('#3E2C23', '초콜릿'), c('#2F3A2E', '딥 올리브'), c('#2B2B2E', '웜 블랙'), c('#5C4033', '다크 브라운'), c('#2E3A4A', '딥 네이비')],
    outerTip: '초콜릿·딥 올리브 수트가 존재감을 살립니다. 밝은 파스텔은 피하세요.',
    point: [c('#8C3B2E', '브릭 레드'), c('#B5651D', '러스트'), c('#1E4D3A', '딥 그린'), c('#D4A017', '골든 머스타드')],
    metals: ['gold', 'bronze'],
    avoidMetals: ['silver', 'platinum'],
    hair: [
      { color: c('#2B1D16', '에스프레소'), description: '깊고 또렷한 인상' },
      { color: c('#3E2C23', '다크 초콜릿'), description: '중후하고 고급스러움' },
      { color: c('#5C4033', '다크 브라운'), description: '부드러운 깊이감' },
      { color: c('#4A2E24', '마호가니 브라운'), description: '은은한 혈색' },
    ],
    hairIntro: '짙은 웜 브라운이 또렷한 이목구비를 살립니다.',
    hairAvoid: [ASH_GRAY_HAIR, c('#D9C7A3', '플래티넘 블론드')],
    hairTip: '밝은 애쉬·플래티넘 컬러는 얼굴을 흐리고 피곤해 보이게 할 수 있어요.',
    makeup: { base: '옐로 베이스 미디엄~딥 베이지', lip: [c('#7A3B2E', '브릭 브라운'), c('#6D2E2E', '와인 브라운'), c('#A0413C', '딥 칠리')], eye: [c('#5C4033', '다크 브라운'), c('#6E6A3E', '딥 카키')], cheek: [c('#B87360', '브라운 코럴')] },
    avoidStyles: [
      { label: '쿨 파스텔', colors: [c('#F4C9D2', '베이비 핑크'), c('#C9DAEC', '파우더 블루')], shape: 'shirt', reason: '연한 쿨 파스텔은 얼굴을 떠 보이게 합니다.' },
      { label: '라벤더·쿨 그레이', colors: [c('#C3B6DC', '쿨 라벤더'), COOL_GRAY], shape: 'knit', reason: '차갑고 흐린 색이 깊은 피부 톤과 맞지 않습니다.' },
      { label: '형광/네온 컬러', colors: [NEON], shape: 'jacket', reason: '인공적인 채도가 중후한 분위기를 깹니다.' },
      { label: '아이스 핑크', colors: [ICY_PINK], shape: 'shirt', reason: '창백한 핑크가 피부를 칙칙하게 합니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  /* ============================================================ WINTER */
  'winter-cool': {
    tone: 'winter-cool',
    season: 'winter',
    nameKo: '겨울쿨 트루',
    nameEn: 'Winter Cool True',
    accentHex: '#2E3F6E',
    description: '푸른 기가 강한 선명한 쿨 컬러와 무채색 대비가 잘 어울립니다. 블랙·화이트·로열 블루에서 인상이 또렷하고 도시적입니다.',
    imageKeywords: ['도시적인', '시크한', '또렷한', '모던'],
    firstImpression: ['또렷하고 시크한 인상', '모던하고 도시적인 이미지', '단단하고 자신감 있는 분위기', '깔끔하고 정돈된 느낌'],
    hashtags: ['#시크', '#도시적', '#또렷함', '#모던'],
    analysisPoint: '쿨 베이스에 피부와 헤어의 명도 대비가 커서, 선명한 쿨 컬러와 무채색을 대었을 때 얼굴이 가장 또렷합니다.',
    best: [BLACK, PURE_WHITE, c('#1D4E89', '로열 블루'), c('#232B57', '딥 네이비'), c('#B0234A', '라즈베리'), c('#2E8B57', '에메랄드'), c('#5F6368', '차콜 그레이'), c('#C8102E', '트루 레드')],
    worst: [CAMEL, MUSTARD, c('#F2A391', '피치'), OLIVE_KHAKI, c('#E3A857', '애프리콧'), BROWN],
    drapeBest: [c('#1D4E89', '로열 블루'), c('#232B57', '딥 네이비'), c('#B0234A', '라즈베리'), c('#2E8B57', '에메랄드')],
    drapeWorst: [CAMEL, MUSTARD, c('#F2A391', '피치'), OLIVE_KHAKI],
    tops: [PURE_WHITE, c('#D9D9DC', '라이트 그레이'), c('#A9C4E2', '아이스 블루'), c('#F3D3E3', '아이스 핑크'), c('#1D4E89', '로열 블루'), c('#111111', '블랙')],
    topsTip: '퓨어 화이트 셔츠 + 짙은 네이비/블랙 조합이 가장 선명합니다.',
    outer: [c('#111111', '블랙'), c('#232B57', '딥 네이비'), c('#3B3D42', '차콜'), c('#5F6368', '차콜 그레이'), c('#2E3F6E', '쿨 네이비')],
    outerTip: '블랙·차콜 수트도 잘 어울립니다. 브라운·카멜은 피하세요.',
    point: [c('#C8102E', '트루 레드'), c('#1D4E89', '로열 블루'), c('#6B4E9B', '로열 퍼플'), c('#2E8B57', '에메랄드')],
    metals: ['silver', 'platinum', 'white-gold'],
    avoidMetals: ['gold', 'bronze', 'champagne-gold'],
    hair: [
      { color: c('#111111', '블랙'), description: '선명하고 시크한 인상' },
      { color: c('#1A1F2B', '블루 블랙'), description: '도시적이고 또렷함' },
      { color: c('#2B2426', '쿨 다크 브라운'), description: '부드러운 대비' },
      { color: c('#3A2A33', '버건디 블랙'), description: '세련된 포인트' },
    ],
    hairIntro: '블랙·블루 블랙처럼 깊은 쿨 컬러가 대비를 살립니다.',
    hairAvoid: [GOLD_BLOND_HAIR, ORANGE_BROWN_HAIR],
    hairTip: '밝은 골드·오렌지 브라운은 피부를 누렇게 보이게 할 수 있어요.',
    makeup: { base: '핑크 베이스(21호 쿨)', lip: [c('#C8102E', '트루 레드'), c('#B0234A', '라즈베리'), c('#8C1C4A', '플럼 레드')], eye: [c('#5F6368', '차콜'), c('#6B4E9B', '퍼플')], cheek: [c('#E07A9A', '쿨 로즈')] },
    avoidStyles: [
      { label: '카멜·브라운 수트', colors: [CAMEL, BROWN], shape: 'suit', reason: '따뜻한 갈색이 얼굴을 탁하게 만듭니다.' },
      { label: '머스타드·카키', colors: [MUSTARD, OLIVE_KHAKI], shape: 'knit', reason: '노란 기가 강한 탁색이 피부와 충돌합니다.' },
      { label: '피치·애프리콧', colors: [c('#F2A391', '피치')], shape: 'shirt', reason: '흐린 웜 파스텔은 또렷한 인상을 흐립니다.' },
      { label: '베이지 톤온톤', colors: [c('#D8C3A5', '베이지')], shape: 'jacket', reason: '대비가 부족해 얼굴이 밋밋해 보입니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  'winter-bright': {
    tone: 'winter-bright',
    season: 'winter',
    nameKo: '겨울쿨 브라이트',
    nameEn: 'Winter Cool Bright',
    accentHex: '#C2185B',
    description: '쨍하고 선명한 쿨 컬러가 가장 잘 어울립니다. 비비드 핑크·코발트·에메랄드에서 이목구비가 화려하고 생기 있어 보입니다.',
    imageKeywords: ['화려한', '선명한', '세련된', '임팩트'],
    firstImpression: ['화려하고 선명한 인상', '세련되고 임팩트 있는 이미지', '자신감 있는 분위기', '눈빛이 또렷해 보이는 느낌'],
    hashtags: ['#화려함', '#선명함', '#임팩트', '#세련미'],
    analysisPoint: '쿨 베이스에 채도와 대비가 모두 높아, 쨍한 쿨 원색을 대었을 때 눈빛과 이목구비가 가장 살아납니다.',
    best: [c('#C2185B', '푸시아'), c('#2F6DB5', '코발트 블루'), c('#2E8B57', '에메랄드'), PURE_WHITE, BLACK, c('#C8102E', '트루 레드'), c('#3FA7C9', '터콰이즈 블루'), c('#6B4E9B', '로열 퍼플')],
    worst: [c('#A39E94', '웜 그레이'), CAMEL, OLIVE_KHAKI, c('#BCA58A', '그레이지'), c('#9CAF88', '세이지'), BROWN],
    drapeBest: [c('#C2185B', '푸시아'), c('#2F6DB5', '코발트 블루'), c('#2E8B57', '에메랄드'), c('#C8102E', '트루 레드')],
    drapeWorst: [c('#BCA58A', '그레이지'), CAMEL, OLIVE_KHAKI, c('#9CAF88', '세이지')],
    tops: [PURE_WHITE, c('#A9C4E2', '아이스 블루'), c('#F3D3E3', '아이스 핑크'), c('#E86A92', '핫 핑크'), c('#3FA7C9', '터콰이즈'), c('#111111', '블랙')],
    topsTip: '퓨어 화이트에 비비드 포인트 한 가지를 더하면 가장 세련됩니다.',
    outer: [c('#111111', '블랙'), c('#1D4E89', '로열 블루'), c('#232B57', '딥 네이비'), c('#3B3D42', '차콜'), c('#5F6368', '차콜 그레이')],
    outerTip: '블랙·네이비 수트에 선명한 컬러 포인트로 대비를 주세요.',
    point: [c('#C2185B', '푸시아'), c('#2F6DB5', '코발트'), c('#2E8B57', '에메랄드'), c('#C8102E', '트루 레드')],
    metals: ['silver', 'platinum', 'white-gold'],
    avoidMetals: ['bronze', 'gold'],
    hair: [
      { color: c('#111111', '블랙'), description: '선명한 대비' },
      { color: c('#1A1F2B', '블루 블랙'), description: '쨍하고 세련됨' },
      { color: c('#2B2426', '쿨 다크 브라운'), description: '부드러운 균형' },
      { color: c('#4B1E3A', '플럼 블랙'), description: '화려한 포인트' },
    ],
    hairIntro: '깊고 윤기 있는 블랙 계열이 선명한 이목구비와 잘 맞습니다.',
    hairAvoid: [c('#8A6E4B', '올리브 브라운'), ASH_GRAY_HAIR],
    hairTip: '탁한 애쉬·올리브 브라운은 얼굴의 생기를 떨어뜨릴 수 있어요.',
    makeup: { base: '핑크 베이스 맑은 피부 표현', lip: [c('#C2185B', '푸시아'), c('#C8102E', '트루 레드'), c('#E86A92', '핫 핑크')], eye: [c('#3B3D42', '차콜'), c('#6B4E9B', '퍼플')], cheek: [c('#F06292', '비비드 핑크')] },
    avoidStyles: [
      { label: '탁한 베이지 톤온톤', colors: [c('#BCA58A', '그레이지')], shape: 'jacket', reason: '채도가 낮은 색이 선명한 인상을 흐립니다.' },
      { label: '카멜·브라운', colors: [CAMEL, BROWN], shape: 'suit', reason: '따뜻한 갈색이 얼굴을 칙칙하게 합니다.' },
      { label: '올리브 카키', colors: [OLIVE_KHAKI], shape: 'jacket', reason: '탁한 웜 그린이 피부와 충돌합니다.' },
      { label: '웜 그레이', colors: [c('#A39E94', '웜 그레이')], shape: 'knit', reason: '흐린 웜 무채색은 생기를 떨어뜨립니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
  'winter-deep': {
    tone: 'winter-deep',
    season: 'winter',
    nameKo: '겨울쿨 딥',
    nameEn: 'Winter Cool Deep',
    accentHex: '#2B2440',
    description: '짙고 차가운 컬러가 잘 어울립니다. 블랙·딥 네이비·버건디·딥 플럼에서 인상이 강렬하고 고급스러워 보입니다.',
    imageKeywords: ['강렬한', '고급스러운', '카리스마', '시크'],
    firstImpression: ['강렬하고 카리스마 있는 인상', '고급스럽고 시크한 이미지', '진중하고 단단한 분위기', '또렷한 존재감'],
    hashtags: ['#카리스마', '#시크', '#고급스러움', '#강렬함'],
    analysisPoint: '쿨 베이스에 명도가 낮고 대비가 커서, 짙고 차가운 컬러를 대었을 때 이목구비가 가장 선명해집니다.',
    best: [BLACK, c('#232B57', '딥 네이비'), BURGUNDY, c('#4B2E5E', '딥 플럼'), c('#1E4D3A', '딥 그린'), PURE_WHITE, c('#3B3D42', '차콜'), c('#6D1F2F', '와인')],
    worst: [c('#F2A391', '피치'), c('#E3A857', '애프리콧'), CAMEL, c('#F5E1A4', '버터 옐로'), c('#9CAF88', '세이지'), c('#BCA58A', '그레이지')],
    drapeBest: [c('#232B57', '딥 네이비'), BURGUNDY, c('#4B2E5E', '딥 플럼'), c('#1E4D3A', '딥 그린')],
    drapeWorst: [c('#F2A391', '피치'), c('#E3A857', '애프리콧'), CAMEL, c('#F5E1A4', '버터 옐로')],
    tops: [PURE_WHITE, c('#D9D9DC', '라이트 그레이'), c('#C9D2E3', '아이스 블루'), c('#E6D3E3', '아이스 라일락'), c('#3B3D42', '차콜'), c('#111111', '블랙')],
    topsTip: '화이트·아이스 컬러 셔츠에 짙은 아우터로 대비를 주면 가장 고급스럽습니다.',
    outer: [c('#111111', '블랙'), c('#232B57', '딥 네이비'), c('#3B3D42', '차콜'), c('#2B2440', '딥 플럼 네이비'), c('#1E2A2A', '딥 틸')],
    outerTip: '블랙·딥 네이비 수트가 가장 잘 어울립니다. 카멜·베이지는 피하세요.',
    point: [BURGUNDY, c('#4B2E5E', '딥 플럼'), c('#1E4D3A', '딥 그린'), c('#C8102E', '트루 레드')],
    metals: ['silver', 'platinum', 'gunmetal'],
    avoidMetals: ['gold', 'champagne-gold', 'bronze'],
    hair: [
      { color: c('#111111', '블랙'), description: '강렬하고 또렷함' },
      { color: c('#1A1F2B', '블루 블랙'), description: '시크하고 고급스러움' },
      { color: c('#2B1D22', '다크 플럼 브라운'), description: '깊이 있는 혈색' },
      { color: c('#231A1A', '에스프레소 블랙'), description: '부드러운 카리스마' },
    ],
    hairIntro: '짙은 블랙·블루 블랙이 강한 대비를 살립니다.',
    hairAvoid: [GOLD_BLOND_HAIR, c('#A9805F', '밀크티 브라운')],
    hairTip: '밝고 따뜻한 브라운은 얼굴을 흐리고 누렇게 보이게 할 수 있어요.',
    makeup: { base: '뉴트럴~핑크 베이스 미디엄', lip: [c('#6D1F2F', '와인'), c('#8C1C2E', '버건디'), c('#B0234A', '라즈베리')], eye: [c('#3B3D42', '차콜'), c('#4B2E5E', '플럼')], cheek: [c('#B85C7A', '베리 로즈')] },
    avoidStyles: [
      { label: '웜 파스텔', colors: [c('#F2A391', '피치'), c('#F5E1A4', '버터 옐로')], shape: 'shirt', reason: '연한 웜 컬러가 얼굴을 떠 보이게 합니다.' },
      { label: '카멜·베이지 수트', colors: [CAMEL], shape: 'suit', reason: '따뜻한 중간색이 강한 이목구비와 맞지 않습니다.' },
      { label: '세이지·그레이지', colors: [c('#9CAF88', '세이지'), c('#BCA58A', '그레이지')], shape: 'knit', reason: '흐린 색이 카리스마를 약하게 만듭니다.' },
      { label: '형광/네온 컬러', colors: [NEON_PINK], shape: 'jacket', reason: '가벼운 형광색이 고급스러운 분위기를 깹니다.' },
    ],
    warmSamples: WARM_SAMPLES,
    coolSamples: COOL_SAMPLES,
  },
};

export const SEASON_LABEL_KO: Record<Season, string> = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

/** 톤 → 프로필 */
export const getToneProfile = (tone: Tone): ToneProfile => TONE_PROFILES[tone];

/** 웜/쿨 그라데이션 바 색 (③) */
export const WARM_GRADIENT = ['#F7D9B8', '#F0B98A', '#DE9A68', '#C07A4E', '#9A5B36'];
export const COOL_GRADIENT = ['#C9D6F0', '#A3B3DE', '#7E8CC2', '#5E679C', '#9A9FAE'];
