import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@celeber/ui/styles.css';
import { getCapabilities, mockReasons } from '@celeber/core/server/env';
import { MockBadge } from '@celeber/ui';

export const metadata: Metadata = {
  title: 'CELEBER · 추구미 추출',
  description: '사진 한 장에서 코디, 퍼스널컬러, 분위기를 추출합니다.',
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
