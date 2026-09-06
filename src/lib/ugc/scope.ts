/**
 * The queue runs one job at a time per scope key, so scope keys are what decide
 * how much of a user's work runs in parallel. Each product and work stays
 * serialised within its own scope.
 */
export function productScopeKey(userId: string, productId: string): string {
  return `user:${userId}:product:${productId}`;
}

export function workScopeKey(userId: string, workId: string): string {
  return `user:${userId}:work:${workId}`;
}
