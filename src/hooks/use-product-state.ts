"use client";

import { useLiveState } from "@/hooks/use-live-state";
import type { ProductState } from "@/lib/ugc/queries";

/** A first read and a refresh both stay live until their task settles. */
function isProductLive(state: ProductState): boolean {
  if (state.run.failed || state.run.stalled) return false;
  return ["queued", "running", "waiting"].includes(state.run.status);
}

/** Keeps the product page current while its material is being read. */
export function useProductState(
  productId: string,
  initial: ProductState,
): ProductState {
  return useLiveState(
    `/api/ugc/products/${productId}/state`,
    initial,
    isProductLive,
  );
}
