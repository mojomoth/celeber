/**
 * 디자인 토큰 (JS 값). canvas/SVG에서 색이 필요할 때 사용. CSS에서는 var(--cb-*) 사용.
 */
export const COLORS = {
  ink: '#25222B',
  ivory: '#FFFDF8',
  paper: '#F7F5F0',
  card: '#FFFDF8',
  text2: '#625C6A',
  line: '#E7E1E6',
  iris: '#7274E9',
  irisDeep: '#4C45AD',
  irisSoft: '#EEECFA',
  mint: '#50C89D',
  lime: '#D6F36C',
  pink: '#FF91BB',
  coral: '#FB603C',
  cameraBg: '#1D1B23',
  cameraText: '#C9C4D0',
  ok: '#216652',
  warn: '#865018',
  danger: '#A13942',
} as const;

export const SPACE = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32 } as const;
export const LAYOUT = { pageMax: 390, gutter: 24, buttonH: 52, touch: 44, radiusCard: 16, radiusPhoto: 14 } as const;
export const FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Noto Sans KR', 'Malgun Gothic', system-ui, sans-serif";
