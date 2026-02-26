export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;

export function normalizePage(value: unknown, fallback = DEFAULT_PAGE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(Math.floor(parsed), 1);
}

export function normalizePageSize(
  value: unknown,
  fallback = DEFAULT_PAGE_SIZE,
  max = MAX_PAGE_SIZE
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const size = Math.max(Math.floor(parsed), 1);
  return Math.min(size, max);
}

export function normalizeOptionalLimit(value: unknown, max = MAX_PAGE_SIZE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const limit = Math.floor(parsed);
  if (limit <= 0) return 0;
  return Math.min(limit, max);
}
