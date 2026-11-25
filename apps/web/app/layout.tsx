import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import type { ReactNode } from 'react';
import { DeviceFrame } from '@/ui/DeviceFrame';
import '@celeber/ui/styles.css';
import '@/ui/tokens.css';
import '@/ui/base.css';

const pretendard = localFont({
  src: '../../../pocs/ui/mockup/src/fonts/PretendardVariable.woff2',
  weight: '45 920',
  display: 'swap',
  variable: '--font-pretendard',
});

export const metadata: Metadata = {
  title: 'CELEBER',
  description: '내 퍼스널컬러를 알아보고 연예인 스타일을 내게 맞춰 보세요.',
  icons: { icon: '/bi/icon.svg', apple: '/bi/apple-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <DeviceFrame>{children}</DeviceFrame>
      </body>
    </html>
  );
}
