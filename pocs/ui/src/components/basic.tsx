/**
 * 기본 컴포넌트: 버튼, 카드, 섹션 헤더, 페이지, 헤더, 알림, 배지, 빈 상태, 로딩.
 * 서버/클라이언트 컴포넌트 양쪽에서 사용 가능 (상태 없음).
 */
import clsx from 'clsx';
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { BI } from '../bi';
import { Icon, type IconName } from './icons';

/* ------------------------------------------------------------------ Button */

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'dark-outline' | 'ghost' | 'danger';

type ButtonBaseProps = {
  /** primary: 잉크 바탕 / secondary: 윤곽선 / dark: 어두운 화면용 아이보리 / danger: 초기화 */
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  block?: boolean;
  loading?: boolean;
  icon?: IconName;
  children?: ReactNode;
};
export type ButtonProps = ButtonBaseProps &
  (({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>) | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>));

export function Button(props: ButtonProps) {
  const { variant = 'primary', size = 'md', block, loading, icon, children, className, ...rest } = props;
  const cls = clsx('cb-btn', `cb-btn--${variant}`, size === 'sm' && 'cb-btn--sm', block && 'cb-btn--block', className);
  const inner = (
    <>
      {loading ? <Spinner size={16} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </>
  );
  if ('href' in rest && rest.href !== undefined) {
    const a = rest as AnchorHTMLAttributes<HTMLAnchorElement>;
    return (
      <a {...a} className={cls}>
        {inner}
      </a>
    );
  }
  const b = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" {...b} className={cls} disabled={b.disabled || loading} aria-busy={loading || undefined}>
      {inner}
    </button>
  );
}

/* ------------------------------------------------------------------ Layout */

export function PageContainer({ children, wide, className }: { children: ReactNode; wide?: boolean; className?: string }) {
  return <main className={clsx('cb-page', wide && 'cb-page--wide', className)}>{children}</main>;
}

export function Card({
  children,
  tone = 'card',
  flush,
  className,
  as: As = 'section',
}: {
  children: ReactNode;
  /** card: 아이보리+선 / paper: 종이 바탕 / dark: 촬영 바탕 */
  tone?: 'card' | 'paper' | 'dark';
  flush?: boolean;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <As className={clsx('cb-card', tone !== 'card' && `cb-card--${tone}`, flush && 'cb-card--flush', className)}>{children}</As>;
}

/** ① 같은 원형 번호 */
export function NumberBadge({ n }: { n: number | string }) {
  return <span className={clsx('cb-num', String(n).length > 1 && 'cb-num--wide')}>{n}</span>;
}

/** 섹션 제목 (리포트 번호 + 제목 + 보조 설명 + 우측 슬롯) */
export function SectionHeader({ no, title, subtitle, right, as: As = 'h2' }: { no?: number | string; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; as?: 'h2' | 'h3' }) {
  return (
    <div className="cb-section-header">
      {no !== undefined ? <NumberBadge n={no} /> : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <As className="cb-section-title" style={As === 'h3' ? { fontSize: 17, lineHeight: '24px' } : undefined}>
          {title}
        </As>
        {subtitle ? <div className="cb-section-header__sub">{subtitle}</div> : null}
      </div>
      {right}
    </div>
  );
}

/** 상단 헤더: 뒤로가기(링크) 또는 심볼 로고, 제목, 우측 슬롯 */
export function AppHeader({ title, backHref, right, showSymbol = true }: { title?: ReactNode; backHref?: string; right?: ReactNode; showSymbol?: boolean }) {
  return (
    <header className="cb-header">
      <div className="cb-header__inner">
        <div className="cb-header__slot">
          {backHref ? (
            <a className="cb-icon-btn" href={backHref} aria-label="뒤로">
              <Icon name="back" size={22} />
            </a>
          ) : showSymbol ? (
            <a className="cb-icon-btn" href="/" aria-label="처음으로">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={BI.symbolOnLight} alt="CELEBER" width={26} height={26} />
            </a>
          ) : null}
        </div>
        <div className="cb-header__title">{title}</div>
        <div className="cb-header__slot">{right}</div>
      </div>
    </header>
  );
}

/** BI 로고 이미지 */
export function BiLogo({ variant = 'logo-on-light', width = 120, className }: { variant?: 'logo-on-light' | 'logo-on-dark' | 'symbol-on-light' | 'symbol-on-dark' | 'wordmark-on-light' | 'wordmark-on-dark'; width?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/bi/${variant}.svg`} alt="CELEBER" width={width} className={className} style={{ height: 'auto' }} />;
}

/* ------------------------------------------------------------------ 텍스트 요소 */

export function Chip({ children, tone = 'paper' }: { children: ReactNode; tone?: 'paper' | 'iris' }) {
  return <span className={clsx('cb-chip', tone === 'iris' && 'cb-chip--iris')}>{children}</span>;
}
export function Chips({ items, tone }: { items: string[]; tone?: 'paper' | 'iris' }) {
  return (
    <div className="cb-chips">
      {items.map((t) => (
        <Chip key={t} tone={tone}>
          {t}
        </Chip>
      ))}
    </div>
  );
}

/** 체크 아이콘 bullet 목록 (첫인상 브리핑, 오늘 바로 적용할 포인트) */
export function CheckList({ items, icon = 'check-circle' }: { items: ReactNode[]; icon?: IconName }) {
  return (
    <ul className="cb-checklist">
      {items.map((t, i) => (
        <li key={i}>
          <span className="cb-checklist__icon">
            <Icon name={icon} size={18} />
          </span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function Notice({ tone = 'info', title, children, icon }: { tone?: 'info' | 'ok' | 'warn' | 'danger'; title?: ReactNode; children?: ReactNode; icon?: IconName }) {
  const ic: IconName = icon ?? (tone === 'ok' ? 'check-circle' : tone === 'info' ? 'info' : 'warn');
  return (
    <div className={clsx('cb-notice', tone !== 'info' && `cb-notice--${tone}`)} role={tone === 'danger' || tone === 'warn' ? 'alert' : undefined}>
      <Icon name={ic} size={18} style={{ flex: 'none', marginTop: 1 }} />
      <div>
        {title ? <div className="cb-notice__title">{title}</div> : null}
        {children}
      </div>
    </div>
  );
}

/** "데모 데이터" 배지. 키가 없어 Mock으로 동작할 때 표시 */
export function MockBadge({ floating, title, label = '데모 데이터' }: { floating?: boolean; title?: string; label?: string }) {
  return (
    <span className={clsx('cb-mock-badge', floating && 'cb-mock-badge--floating')} title={title} role="status">
      {label}
    </span>
  );
}

export function EmptyState({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="cb-empty">
      <div className="cb-empty__title">{title}</div>
      {description ? <div className="cb-empty__desc">{description}</div> : null}
      {action ? <div className="cb-empty__action">{action}</div> : null}
    </div>
  );
}

export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} aria-label={label}>
      <span className="cb-spinner" style={{ width: size, height: size }} />
    </span>
  );
}

/** 분석 중 오버레이: 부모(position:relative) 위에 덮어 사진/선택 맥락을 유지 */
export function AnalyzingOverlay({ message = '분석 중', sub }: { message?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="cb-analyzing" role="status" aria-live="polite">
      <Spinner size={28} />
      <div className="cb-analyzing__msg">{message}</div>
      {sub ? <div className="cb-analyzing__sub">{sub}</div> : null}
    </div>
  );
}

/** 둥근 사진 + 하단 라벨(예: '업로드한 사진') + 오버레이 슬롯(SVG 등) */
export function PhotoFrame({
  src,
  alt,
  label,
  aspect = '3 / 4',
  overlay,
  children,
  className,
}: {
  src?: string;
  alt: string;
  label?: ReactNode;
  aspect?: string;
  overlay?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('cb-photo', className)} style={{ aspectRatio: aspect }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={alt} /> : null}
      {children}
      {overlay ? <div className="cb-photo__overlay">{overlay}</div> : null}
      {label ? <span className="cb-photo__label">{label}</span> : null}
    </div>
  );
}

/** 단계 표시 (환경 → 정면 → 측면 → 전신) */
export function StepIndicator({ steps, current, dark, showLabels = true }: { steps: string[]; current: number; dark?: boolean; showLabels?: boolean }) {
  return (
    <div className={clsx(dark && 'cb-steps--dark')} aria-label={`${steps.length}단계 중 ${current + 1}단계: ${steps[current] ?? ''}`}>
      <div className="cb-steps">
        {steps.map((s, i) => (
          <span key={s} className={clsx('cb-steps__bar', i < current && 'cb-steps__bar--done', i === current && 'cb-steps__bar--current')} />
        ))}
      </div>
      {showLabels ? (
        <div className="cb-steps__label">
          {steps.map((s, i) => (
            <span key={s} style={{ fontWeight: i === current ? 700 : 400, color: i === current ? (dark ? 'var(--cb-ivory)' : 'var(--cb-ink)') : undefined }}>
              {s}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
