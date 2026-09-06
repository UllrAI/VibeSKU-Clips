/**
 * The queue runs one job at a time per scope key, so scope keys are what decide
 * how much of a user's work runs in parallel. Rendering is spread over a fixed
 * number of lanes; everything else stays serialised per object.
 */
const RENDER_LANES = 4;

export function productScopeKey(userId: string, productId: string): string {
  return `user:${userId}:product:${productId}`;
}

export function batchScopeKey(userId: string, batchId: string): string {
  return `user:${userId}:batch:${batchId}`;
}

export function workScopeKey(userId: string, workId: string): string {
  return `user:${userId}:work:${workId}`;
}

export function renderScopeKey(
  userId: string,
  batchId: string,
  laneIndex: number,
): string {
  return `${batchScopeKey(userId, batchId)}#${laneIndex % RENDER_LANES}`;
}

export function isOwnedScope(scopeKey: string, userId: string): boolean {
  const prefix = `user:${userId}`;
  return scopeKey === prefix || scopeKey.startsWith(`${prefix}:`);
}
