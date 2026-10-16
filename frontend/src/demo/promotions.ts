// Re-export the shared promotion table (backend/common/data/promotions.ts) so the page and the
// server's PROMOTE op never disagree.
export { PROMOTIONS, promotionsFor } from '@common/data/promotions.ts';
export type { Promotion } from '@common/data/promotions.ts';
