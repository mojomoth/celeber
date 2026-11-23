import Link from 'next/link';
import type { BodySessionListItem } from '../../src/lib/types';
import { BODY_STATUS_LABEL_KO } from '../../src/lib/summary';
import { Icon, MockBadge } from '@celeber/ui';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function SessionList({ items }: { items: BodySessionListItem[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((it) => (
        <li key={it.id} style={{ borderTop: '1px solid var(--cb-line)' }}>
          <Link href={`/sessions/${it.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', color: 'inherit', textDecoration: 'none', minHeight: 44 }}>
            <span style={{ width: 48, height: 64, borderRadius: 8, overflow: 'hidden', background: 'var(--cb-paper)', flex: 'none', display: 'grid', placeItems: 'center' }}>
              {it.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Icon name="body" size={22} />
              )}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="cb-row-title" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.status === 'complete' ? it.summary : BODY_STATUS_LABEL_KO[it.status]}
              </span>
              <span className="cb-caption cb-muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {fmt(it.createdAt)}
                {it.label ? ` · ${it.label}` : ''}
                {it.isMock ? <MockBadge /> : null}
              </span>
            </span>
            <Icon name="chevron-right" size={18} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
