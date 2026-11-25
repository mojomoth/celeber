import { LandingScreen } from '@/screens/01-landing';

export default function Page() {
  return (
    <LandingScreen data={{
      portrait: '/photos/landing-editorial.webp',
      logo: '/bi/logo-on-dark.svg',
      background: '/bi/color-halo-background.svg',
      startLabel: '시작하기',
    }} />
  );
}
