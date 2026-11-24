import Link from 'next/link';
import type { LandingData } from '@/data/types';
import { ROUTES } from '@/lib/routes';
import { Icon, Screen } from '@/ui';
import s from './screen.module.css';

/**
 * 01 랜딩 (v3 시안 그대로). 인물·드레이핑 화보를 화면 가득 깔고 BI 로고와 시작하기만 올린다.
 * 화보가 늦게 뜨는 동안에는 color-halo 배경이 같은 색조로 자리를 채운다.
 */
export function LandingScreen({ data }: { data: LandingData }) {
  return (
    <Screen immersive tone="dark" className={s.root} style={{ backgroundImage: `url(${data.background})` }}>
      <div className={s.stage} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={s.scene} src={data.portrait} alt="" fetchPriority="high" decoding="async" />
        <div className={s.shade} />
      </div>
      <h1 className={s.logo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={data.logo} alt="CELEBER" />
      </h1>
      <Link href={ROUTES.capture} className={s.start}>
        {data.startLabel}
        <Icon name="arrow" size={17.5} stroke={1.85} className={s.arrow} />
      </Link>
    </Screen>
  );
}
