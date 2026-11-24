import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { DeviceFrame } from '@/ui/DeviceFrame';
import '@/ui/tokens.css';
import '@/ui/base.css';

const pretendard = localFont({
  src: '../src/fonts/PretendardVariable.woff2',
  weight: '45 920',
  display: 'block',
  variable: '--font-pretendard',
});

export const metadata: Metadata = {
  title: 'CELEBER',
  description: '퍼스널컬러 진단과 추구미 가이드 UI 목업 (v4 시안)',
  icons: { icon: '/bi/icon.svg', apple: '/bi/apple-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

// ?chrome=sim: 모바일 뷰포트에서도 9:41 상태 표시줄·홈 인디케이터와 iPhone 안전 영역(54/34)을 켠다 (시안 비교 스크린샷용)
const SIM_SCRIPT = "if(/[?&]chrome=sim\\b/.test(location.search))document.documentElement.dataset.chrome='sim'";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SIM_SCRIPT }} />
      </head>
      <body>
        <DeviceFrame>{children}</DeviceFrame>
      </body>
    </html>
  );
}
