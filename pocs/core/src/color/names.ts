/**
 * 한국어 색 이름 테이블과 최근접 색 이름 매핑 (ΔE2000).
 * 패션/퍼스널컬러 문맥에서 쓰는 이름 위주. 리포트·스와치 라벨에 사용.
 */
import { hexToLab, type Lab } from './convert';
import { deltaE2000 } from './metrics';

export interface ColorNameEntry {
  hex: string;
  /** 한국어 이름 (UI 표시) */
  ko: string;
  /** 영문 이름 */
  en: string;
  /** 대분류 (필터/집계용) */
  family:
    | 'white'
    | 'gray'
    | 'black'
    | 'red'
    | 'pink'
    | 'orange'
    | 'yellow'
    | 'green'
    | 'blue'
    | 'navy'
    | 'purple'
    | 'brown'
    | 'beige'
    | 'skin'
    | 'metal';
}

export const COLOR_NAMES: ColorNameEntry[] = [
  // 무채색
  { hex: '#FFFFFF', ko: '퓨어 화이트', en: 'Pure White', family: 'white' },
  { hex: '#F8F6F0', ko: '오프 화이트', en: 'Off White', family: 'white' },
  { hex: '#F3EBDD', ko: '아이보리', en: 'Ivory', family: 'white' },
  { hex: '#EEE8DA', ko: '크림', en: 'Cream', family: 'white' },
  { hex: '#D9D9DC', ko: '라이트 그레이', en: 'Light Gray', family: 'gray' },
  { hex: '#B9BBC0', ko: '실버 그레이', en: 'Silver Gray', family: 'gray' },
  { hex: '#A5A3AA', ko: '쿨 그레이', en: 'Cool Gray', family: 'gray' },
  { hex: '#A39E94', ko: '웜 그레이', en: 'Warm Gray', family: 'gray' },
  { hex: '#8C8C8C', ko: '미디엄 그레이', en: 'Medium Gray', family: 'gray' },
  { hex: '#5F6368', ko: '차콜 그레이', en: 'Charcoal Gray', family: 'gray' },
  { hex: '#3B3D42', ko: '차콜', en: 'Charcoal', family: 'gray' },
  { hex: '#2B2B2E', ko: '오프 블랙', en: 'Off Black', family: 'black' },
  { hex: '#111111', ko: '블랙', en: 'Black', family: 'black' },
  // 네이비/블루
  { hex: '#1F2A44', ko: '네이비', en: 'Navy', family: 'navy' },
  { hex: '#232B57', ko: '딥 네이비', en: 'Deep Navy', family: 'navy' },
  { hex: '#39455E', ko: '소프트 네이비', en: 'Soft Navy', family: 'navy' },
  { hex: '#2E3F6E', ko: '쿨 네이비', en: 'Cool Navy', family: 'navy' },
  { hex: '#334A6B', ko: '인디고', en: 'Indigo', family: 'blue' },
  { hex: '#1D4E89', ko: '로열 블루', en: 'Royal Blue', family: 'blue' },
  { hex: '#2F6DB5', ko: '코발트 블루', en: 'Cobalt Blue', family: 'blue' },
  { hex: '#5B7DB1', ko: '미디엄 블루', en: 'Medium Blue', family: 'blue' },
  { hex: '#6E8CA8', ko: '그레이시 블루', en: 'Grayish Blue', family: 'blue' },
  { hex: '#91A6BE', ko: '더스티 블루', en: 'Dusty Blue', family: 'blue' },
  { hex: '#7FA7D6', ko: '소프트 블루', en: 'Soft Blue', family: 'blue' },
  { hex: '#A9C4E2', ko: '스카이 블루', en: 'Sky Blue', family: 'blue' },
  { hex: '#C9DAEC', ko: '파우더 블루', en: 'Powder Blue', family: 'blue' },
  { hex: '#BFD8E6', ko: '아이스 블루', en: 'Ice Blue', family: 'blue' },
  { hex: '#3FA7C9', ko: '터콰이즈 블루', en: 'Turquoise Blue', family: 'blue' },
  { hex: '#2A8C8C', ko: '틸', en: 'Teal', family: 'green' },
  { hex: '#6FB7B0', ko: '아쿠아 민트', en: 'Aqua Mint', family: 'green' },
  // 퍼플
  { hex: '#A7A0B9', ko: '라벤더 그레이', en: 'Lavender Gray', family: 'purple' },
  { hex: '#C3B6DC', ko: '쿨 라벤더', en: 'Cool Lavender', family: 'purple' },
  { hex: '#B7A6D6', ko: '라벤더', en: 'Lavender', family: 'purple' },
  { hex: '#8E7CC3', ko: '라일락 퍼플', en: 'Lilac Purple', family: 'purple' },
  { hex: '#6B4E9B', ko: '로열 퍼플', en: 'Royal Purple', family: 'purple' },
  { hex: '#4B2E5E', ko: '딥 플럼', en: 'Deep Plum', family: 'purple' },
  { hex: '#9B748A', ko: '모브', en: 'Mauve', family: 'purple' },
  { hex: '#7A5A7E', ko: '그레이프', en: 'Grape', family: 'purple' },
  // 핑크/레드
  { hex: '#F4C9D2', ko: '베이비 핑크', en: 'Baby Pink', family: 'pink' },
  { hex: '#E8B4BC', ko: '로즈 핑크', en: 'Rose Pink', family: 'pink' },
  { hex: '#D7A3A8', ko: '더스티 핑크', en: 'Dusty Pink', family: 'pink' },
  { hex: '#C98C9A', ko: '말린 장미', en: 'Dried Rose', family: 'pink' },
  { hex: '#E86A92', ko: '핫 핑크', en: 'Hot Pink', family: 'pink' },
  { hex: '#C2185B', ko: '푸시아', en: 'Fuchsia', family: 'pink' },
  { hex: '#F2A391', ko: '피치', en: 'Peach', family: 'orange' },
  { hex: '#F08A7E', ko: '코럴 핑크', en: 'Coral Pink', family: 'pink' },
  { hex: '#FB603C', ko: '코럴', en: 'Coral', family: 'orange' },
  { hex: '#E0473F', ko: '토마토 레드', en: 'Tomato Red', family: 'red' },
  { hex: '#C8102E', ko: '트루 레드', en: 'True Red', family: 'red' },
  { hex: '#B0234A', ko: '라즈베리', en: 'Raspberry', family: 'red' },
  { hex: '#8C1C2E', ko: '버건디', en: 'Burgundy', family: 'red' },
  { hex: '#6D1F2F', ko: '와인', en: 'Wine', family: 'red' },
  { hex: '#A0413C', ko: '브릭 레드', en: 'Brick Red', family: 'red' },
  // 오렌지/옐로
  { hex: '#D9622B', ko: '브릭 오렌지', en: 'Brick Orange', family: 'orange' },
  { hex: '#F28C28', ko: '탠저린', en: 'Tangerine', family: 'orange' },
  { hex: '#E3A857', ko: '애프리콧', en: 'Apricot', family: 'orange' },
  { hex: '#C46A2B', ko: '테라코타', en: 'Terracotta', family: 'orange' },
  { hex: '#B5651D', ko: '러스트', en: 'Rust', family: 'orange' },
  { hex: '#D4A017', ko: '머스타드', en: 'Mustard', family: 'yellow' },
  { hex: '#E9C46A', ko: '골든 옐로', en: 'Golden Yellow', family: 'yellow' },
  { hex: '#F6E27F', ko: '레몬 옐로', en: 'Lemon Yellow', family: 'yellow' },
  { hex: '#F3E5AB', ko: '버터', en: 'Butter', family: 'yellow' },
  { hex: '#D6F36C', ko: '라임', en: 'Lime', family: 'green' },
  { hex: '#B5F23D', ko: '네온 그린', en: 'Neon Green', family: 'green' },
  // 그린
  { hex: '#8A8F3C', ko: '올리브', en: 'Olive', family: 'green' },
  { hex: '#6B6B3A', ko: '올리브 카키', en: 'Olive Khaki', family: 'green' },
  { hex: '#8D8259', ko: '카키', en: 'Khaki', family: 'green' },
  { hex: '#9CAF88', ko: '세이지', en: 'Sage', family: 'green' },
  { hex: '#A8C3A0', ko: '민트 그레이', en: 'Mint Gray', family: 'green' },
  { hex: '#50C89D', ko: '민트', en: 'Mint', family: 'green' },
  { hex: '#2E8B57', ko: '에메랄드', en: 'Emerald', family: 'green' },
  { hex: '#2F5D50', ko: '포레스트 그린', en: 'Forest Green', family: 'green' },
  { hex: '#1E4D3A', ko: '딥 그린', en: 'Deep Green', family: 'green' },
  { hex: '#4F7942', ko: '모스 그린', en: 'Moss Green', family: 'green' },
  // 브라운/베이지
  { hex: '#E8D9C0', ko: '라이트 베이지', en: 'Light Beige', family: 'beige' },
  { hex: '#D8C3A5', ko: '베이지', en: 'Beige', family: 'beige' },
  { hex: '#C8AD8D', ko: '샌드 베이지', en: 'Sand Beige', family: 'beige' },
  { hex: '#BCA58A', ko: '그레이지', en: 'Greige', family: 'beige' },
  { hex: '#C19A6B', ko: '카멜', en: 'Camel', family: 'brown' },
  { hex: '#B88A5A', ko: '카멜 베이지', en: 'Camel Beige', family: 'brown' },
  { hex: '#A67B5B', ko: '탠', en: 'Tan', family: 'brown' },
  { hex: '#8B5A2B', ko: '코냑 브라운', en: 'Cognac Brown', family: 'brown' },
  { hex: '#7B5B47', ko: '모카', en: 'Mocha', family: 'brown' },
  { hex: '#6F4E37', ko: '커피 브라운', en: 'Coffee Brown', family: 'brown' },
  { hex: '#5C4033', ko: '다크 브라운', en: 'Dark Brown', family: 'brown' },
  { hex: '#3E2C23', ko: '초콜릿', en: 'Chocolate', family: 'brown' },
  { hex: '#2B1D16', ko: '에스프레소', en: 'Espresso', family: 'brown' },
  { hex: '#7D6B5D', ko: '애쉬 브라운', en: 'Ash Brown', family: 'brown' },
  { hex: '#8A6E4B', ko: '골드 브라운', en: 'Golden Brown', family: 'brown' },
  { hex: '#9E7B5F', ko: '토프', en: 'Taupe', family: 'brown' },
  // 피부 참조 (피부색 라벨용)
  { hex: '#F3D9C6', ko: '밝은 아이보리 피부', en: 'Light Ivory Skin', family: 'skin' },
  { hex: '#F0D0C0', ko: '밝은 핑크 베이지 피부', en: 'Light Pink Beige Skin', family: 'skin' },
  { hex: '#E8C4A8', ko: '라이트 베이지 피부', en: 'Light Beige Skin', family: 'skin' },
  { hex: '#E3BBA6', ko: '로지 베이지 피부', en: 'Rosy Beige Skin', family: 'skin' },
  { hex: '#D9AE8C', ko: '내추럴 베이지 피부', en: 'Natural Beige Skin', family: 'skin' },
  { hex: '#D4A58E', ko: '뉴트럴 베이지 피부', en: 'Neutral Beige Skin', family: 'skin' },
  { hex: '#C99A74', ko: '골든 베이지 피부', en: 'Golden Beige Skin', family: 'skin' },
  { hex: '#B98463', ko: '허니 피부', en: 'Honey Skin', family: 'skin' },
  { hex: '#9C6B4E', ko: '탠 피부', en: 'Tan Skin', family: 'skin' },
  { hex: '#6E4A35', ko: '딥 피부', en: 'Deep Skin', family: 'skin' },
  // 금속
  { hex: '#C0C0C0', ko: '실버', en: 'Silver', family: 'metal' },
  { hex: '#E5E4E2', ko: '플래티넘', en: 'Platinum', family: 'metal' },
  { hex: '#D4AF37', ko: '골드', en: 'Gold', family: 'metal' },
  { hex: '#B76E79', ko: '로즈골드', en: 'Rose Gold', family: 'metal' },
  { hex: '#53565A', ko: '건메탈', en: 'Gunmetal', family: 'metal' },
  { hex: '#A97142', ko: '브론즈', en: 'Bronze', family: 'metal' },
];

const LABS: Lab[] = COLOR_NAMES.map((c) => hexToLab(c.hex));

export interface NearestColorName {
  entry: ColorNameEntry;
  /** ΔE2000 (작을수록 정확한 이름) */
  deltaE: number;
}

/**
 * 가장 가까운 한국어 색 이름. families로 후보를 제한할 수 있다(예: 피부는 ['skin']).
 */
export function nearestColorName(input: string | Lab, opts: { families?: ColorNameEntry['family'][]; exclude?: ColorNameEntry['family'][] } = {}): NearestColorName {
  const lab = typeof input === 'string' ? hexToLab(input) : input;
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < COLOR_NAMES.length; i++) {
    const f = COLOR_NAMES[i].family;
    if (opts.families && !opts.families.includes(f)) continue;
    if (opts.exclude && opts.exclude.includes(f)) continue;
    const d = deltaE2000(lab, LABS[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { entry: COLOR_NAMES[Math.max(0, best)], deltaE: bestD };
}

/** hex → 한국어 색 이름 (피부/금속 이름은 제외한 일반 색) */
export function colorNameKo(input: string | Lab): string {
  return nearestColorName(input, { exclude: ['skin', 'metal'] }).entry.ko;
}
/** 피부색 hex → 피부 라벨 (예: '로지 베이지 피부') */
export function skinNameKo(input: string | Lab): string {
  return nearestColorName(input, { families: ['skin'] }).entry.ko;
}
