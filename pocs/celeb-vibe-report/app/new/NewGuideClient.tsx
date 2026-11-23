'use client';
import { useRouter } from 'next/navigation';
import { VibeGuideFlow } from '../../src/flow';
import { stashGuideWarning } from '../../src/lib/warning-handoff';

export function NewGuideClient({ reportId, vibeId, celebId, query }: { reportId: string | null; vibeId: string | null; celebId: string | null; query: string | null }) {
  const router = useRouter();
  return (
    <VibeGuideFlow
      initialReportId={reportId}
      initialVibeId={vibeId}
      initialCelebId={celebId}
      initialQuery={query}
      reportNewHref="/report/new"
      reportHref={(id) => `/report/${encodeURIComponent(id)}`}
      onComplete={({ guide, warning }) => {
        stashGuideWarning(guide.id, warning);
        router.push(`/guides/${encodeURIComponent(guide.id)}`);
      }}
    />
  );
}
