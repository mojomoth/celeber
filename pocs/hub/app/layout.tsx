import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@celeber/ui/styles.css';
import './hub.css';

export const metadata: Metadata = {
  title: 'CELEBER · PoC 허브',
  description: '퍼스널컬러 진단과 연예인 추구미 가이드 기능 프로토타입 6종의 허브',
  icons: { icon: '/bi/icon.svg', apple: '/bi/apple-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1D1B23',
};

// 키 유무·앱 실행 상태를 요청마다 확인한다.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
