/**
 * BI 에셋 경로와 색. 파일은 scripts/sync-public.mjs가 각 앱 public/bi/ 로 동기화한다 (원본: assets/bi).
 */
export const BI = {
  logoOnLight: '/bi/logo-on-light.svg',
  logoOnDark: '/bi/logo-on-dark.svg',
  symbolOnLight: '/bi/symbol-on-light.svg',
  symbolOnDark: '/bi/symbol-on-dark.svg',
  wordmarkOnLight: '/bi/wordmark-on-light.svg',
  wordmarkOnDark: '/bi/wordmark-on-dark.svg',
  /** 랜딩 세로형 그라데이션 배경 */
  haloBackground: '/bi/color-halo-background.svg',
  icon: '/bi/icon.svg',
  appleIcon: '/bi/apple-icon.png',
  icon192: '/bi/icon-192.png',
  icon512: '/bi/icon-512.png',
  iconMaskable512: '/bi/icon-maskable-512.png',
} as const;

/** assets/bi/colors.json */
export const BI_COLORS = {
  ink: '#25222B',
  ivory: '#FFFDF8',
  mint: '#50C89D',
  lime: '#D6F36C',
  iris: '#7274E9',
  pink: '#FF91BB',
  coral: '#FB603C',
} as const;
