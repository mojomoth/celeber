/**
 * ⑧ 악세서리 아이콘 (시계·귀걸이·목걸이·반지·안경테 등), 금속 색으로 칠한다.
 */
import type { Metal, PersonalColorReport } from '@celeber/core/contracts';
import { METAL_HEX, shadeHex } from '../lib';

type Kind = PersonalColorReport['accessories']['items'][number]['kind'];

export function AccessoryIcon({ kind, metal, size = 44 }: { kind: Kind; metal: Metal; size?: number }) {
  const fill = METAL_HEX[metal];
  const edge = shadeHex(fill, -0.35);
  const hi = shadeHex(fill, 0.45);
  const common = { width: size, height: size, viewBox: '0 0 48 48', 'aria-hidden': true } as const;
  switch (kind) {
    case 'watch':
      return (
        <svg {...common}>
          <rect x="17" y="3" width="14" height="12" rx="3" fill={fill} stroke={edge} />
          <rect x="17" y="33" width="14" height="12" rx="3" fill={fill} stroke={edge} />
          <circle cx="24" cy="24" r="11" fill={fill} stroke={edge} strokeWidth="1.4" />
          <circle cx="24" cy="24" r="8" fill="#F8F7F3" stroke={edge} strokeWidth="0.8" />
          <path d="M24 24V19M24 24l3.5 2" stroke="#25222B" strokeWidth="1.2" strokeLinecap="round" />
          <rect x="35" y="22.5" width="2.5" height="3" rx="1" fill={edge} />
          <path d="M19 6h4" stroke={hi} strokeWidth="1" />
        </svg>
      );
    case 'earring':
      return (
        <svg {...common}>
          <circle cx="24" cy="10" r="2.5" fill={fill} stroke={edge} />
          <circle cx="24" cy="27" r="13" fill="none" stroke={edge} strokeWidth="5" />
          <circle cx="24" cy="27" r="13" fill="none" stroke={fill} strokeWidth="3.5" />
          <path d="M14 20a12 12 0 0 1 6-5" stroke={hi} strokeWidth="1.2" fill="none" />
        </svg>
      );
    case 'necklace':
      return (
        <svg {...common}>
          <path d="M8 8c2 16 10 22 16 22s14-6 16-22" fill="none" stroke={edge} strokeWidth="2.6" />
          <path d="M8 8c2 16 10 22 16 22s14-6 16-22" fill="none" stroke={fill} strokeWidth="1.6" strokeDasharray="2 1.4" />
          <path d="M24 30l5 7-5 7-5-7z" fill={fill} stroke={edge} />
          <path d="M22 35l2-3" stroke={hi} strokeWidth="1" />
        </svg>
      );
    case 'ring':
      return (
        <svg {...common}>
          <ellipse cx="24" cy="29" rx="13" ry="12" fill="none" stroke={edge} strokeWidth="5.5" />
          <ellipse cx="24" cy="29" rx="13" ry="12" fill="none" stroke={fill} strokeWidth="4" />
          <path d="M19 14l5-6 5 6-5 4z" fill={hi} stroke={edge} />
        </svg>
      );
    case 'glasses':
      return (
        <svg {...common}>
          <circle cx="14" cy="26" r="8" fill="rgba(255,255,255,0.4)" stroke={edge} strokeWidth="3" />
          <circle cx="14" cy="26" r="8" fill="none" stroke={fill} strokeWidth="1.8" />
          <circle cx="34" cy="26" r="8" fill="rgba(255,255,255,0.4)" stroke={edge} strokeWidth="3" />
          <circle cx="34" cy="26" r="8" fill="none" stroke={fill} strokeWidth="1.8" />
          <path d="M22 25c1-1.5 3-1.5 4 0" stroke={edge} strokeWidth="2" fill="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="24" cy="24" r="14" fill={fill} stroke={edge} />
          <path d="M16 18a10 10 0 0 1 8-5" stroke={hi} strokeWidth="1.4" fill="none" />
        </svg>
      );
  }
}
