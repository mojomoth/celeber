/**
 * 선 아이콘 세트 (24×24, stroke=currentColor). 이모지 대신 사용.
 */
import type { SVGProps } from 'react';

export type IconName =
  | 'check'
  | 'check-circle'
  | 'close'
  | 'back'
  | 'chevron-right'
  | 'camera'
  | 'upload'
  | 'refresh'
  | 'info'
  | 'warn'
  | 'trash'
  | 'search'
  | 'image'
  | 'sun'
  | 'bulb'
  | 'user'
  | 'body'
  | 'skin'
  | 'value'
  | 'chroma'
  | 'clarity'
  | 'contrast'
  | 'keyword'
  | 'brow'
  | 'beard'
  | 'fragrance'
  | 'base'
  | 'lip'
  | 'eye'
  | 'cheek'
  | 'hair'
  | 'nail'
  | 'clipboard'
  | 'skip'
  | 'swap';

const P: Record<IconName, React.ReactNode> = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.3l2.7 2.7L16.5 9" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  'chevron-right': <path d="M9 5l7 7-7 7" />,
  camera: (
    <>
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  upload: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  refresh: <path d="M19 8a7.5 7.5 0 10.8 6M19 3.5V8h-4.5" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  warn: (
    <>
      <path d="M12 3.5l9.5 16.5h-19z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
  trash: <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.7" />
      <path d="M4 17l5-4.5 4 3.5 3-2.5 4.5 3.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  ),
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0012 3z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1.2-4 4.1-6 7.5-6s6.3 2 7.5 6" />
    </>
  ),
  body: (
    <>
      <circle cx="12" cy="4.5" r="2" />
      <path d="M8 8.5h8l-1 6h-2l-.5 7h-1l-.5-7H9z" />
    </>
  ),
  skin: <path d="M12 3.5l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.5l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  value: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v16" />
      <path d="M12 4a8 8 0 010 16z" fill="currentColor" stroke="none" />
    </>
  ),
  chroma: (
    <>
      <path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 01-11 0c0-3 2.5-6 5.5-10z" />
    </>
  ),
  clarity: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
    </>
  ),
  contrast: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M12 8h8M12 12h8.5M12 16h8" />
    </>
  ),
  keyword: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0112 7.3 4.3 4.3 0 0119.5 10c0 5.4-7.5 10-7.5 10z" />,
  brow: <path d="M4 13c3-3.5 9-4.5 16-1.5M6 17.5c2.5-1 5-1 7.5 0" />,
  beard: <path d="M5 8c0 7 3 12 7 12s7-5 7-12M8.5 13.5c1.2 1 2.3 1.5 3.5 1.5s2.3-.5 3.5-1.5" />,
  fragrance: (
    <>
      <rect x="6.5" y="9" width="11" height="11.5" rx="2.5" />
      <path d="M10 9V6.5h4V9M12 3.5v3" />
    </>
  ),
  base: (
    <>
      <rect x="7" y="9" width="10" height="11.5" rx="2" />
      <path d="M9 9V5.5h6V9" />
    </>
  ),
  lip: <path d="M3.5 11.5C6 8 9 7.5 12 9.5c3-2 6-1.5 8.5 2-2.5 4-5.5 5.5-8.5 5.5s-6-1.5-8.5-5.5zM3.5 11.5h17" />,
  eye: (
    <>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  cheek: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="8.5" cy="13.5" r="1.6" />
      <circle cx="15.5" cy="13.5" r="1.6" />
    </>
  ),
  hair: <path d="M5 20c0-9 2.5-15.5 7-15.5S19 11 19 20M9 20c0-6 1-10 3-12M15 20c0-6-1-10-3-12" />,
  nail: <path d="M8 21V10a4 4 0 018 0v11M8 13h8" />,
  clipboard: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16.5" rx="2" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 13.5h7M8.5 17h4.5" />
    </>
  ),
  skip: <path d="M6 6l7 6-7 6M16 6v12" />,
  swap: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
};

export function Icon({ name, size = 20, strokeWidth = 1.7, ...rest }: { name: IconName; size?: number; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {P[name]}
    </svg>
  );
}
