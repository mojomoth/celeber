import { ROUTES } from '@/lib/routes';

export const guideHref = (id: string) => `${ROUTES.muse}?guide=${encodeURIComponent(id)}`;
export const reportHref = (id: string) => `${ROUTES.personalColor}?report=${encodeURIComponent(id)}`;
