// 시안 render.py의 ICONS와 같은 24×24 선 아이콘. 굵기 1.7, 색은 currentColor.
const PATHS = {
  back: <path d="M15 5l-7 7 7 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  share: (
    <>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M5 12v6.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V12" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </>
  ),
  scan: (
    <>
      <path d="M4 8.5V6a2 2 0 012-2h2.5M15.5 4H18a2 2 0 012 2v2.5M20 15.5V18a2 2 0 01-2 2h-2.5M8.5 20H6a2 2 0 01-2-2v-2.5" />
      <circle cx="12" cy="11" r="2.6" />
      <path d="M8 17c.8-1.7 2.3-2.6 4-2.6s3.2.9 4 2.6" />
    </>
  ),
  palette: (
    <>
      <circle cx="9" cy="12" r="5.2" />
      <circle cx="15" cy="12" r="5.2" />
    </>
  ),
  library: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2.5" />
      <path d="M4 9.5h16M10 9.5V20" />
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  upload: <path d="M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15M12 15V4M7.5 8.5L12 4l4.5 4.5" />,
  imgplus: (
    <>
      <rect x="3.5" y="5" width="13" height="13" rx="2" />
      <path d="M3.5 15l3.5-3.5 3 3 2-2 4.5 4.5" />
      <circle cx="8.3" cy="9.3" r="1.2" />
      <path d="M19.5 3v6M16.5 6h6" />
    </>
  ),
  chev: <path d="M9 6l6 6-6 6" />,
  flip: (
    <>
      <path d="M4 9a8 8 0 0114.5-3.5L20 7M20 15a8 8 0 01-14.5 3.5L4 17" />
      <path d="M20 3v4h-4M4 21v-4h4" />
    </>
  ),
  bolt: <path d="M13 3L5 13.5h6L10 21l8-10.5h-6L13 3z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 10-2.3 5.7M20 5v6h-6" />,
  trash: <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4z" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, stroke = 1.7, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
