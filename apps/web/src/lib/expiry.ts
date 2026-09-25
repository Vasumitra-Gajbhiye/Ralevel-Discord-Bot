/** Whether a warning / point entry has passed its expiry date. */
export function isExpired(expiresAt?: string | null): boolean {
  return Boolean(expiresAt) && new Date(expiresAt as string).getTime() <= Date.now();
}

/** Mongo filter for documents that have not expired (missing = never). */
export function notExpiredFilter(now = new Date()) {
  return { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] };
}
