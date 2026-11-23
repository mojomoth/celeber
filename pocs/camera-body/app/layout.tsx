import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@celeber/ui/styles.css';
import { getCapabilities, mockReasons } from '@celeber/core/server/env';
import { MockBadge } from '@celeber/ui';

export const metadata: Metadata = {
  title: 'CELEBER · 전신 비율',
  description: '전신 사진으로 등신, 상·하체, 어깨·골반 비율을 측정합니다.',
  icons: { icon: '/bi/icon.svg', apple: '/bi/apple-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFDF8',
};

// 환경변수(키 유무)에 따라 Mock 배지가 바뀌므로 빌드 시점에 고정하지 않는다.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  const reasons = mockReasons(getCapabilities(), ["ai"]);
  return (
    <html lang="ko">
      <body>
        {reasons.length > 0 ? <MockBadge floating title={reasons.join('\n')} /> : null}
        {children}
      </body>
    </html>
  );
}
