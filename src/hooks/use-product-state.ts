"use client";

import { useLiveState } from "@/hooks/use-live-state";
import type { ProductState } from "@/lib/ugc/queries";

/** Reading is live until facts land, the reader gives up, or nobody takes it. */
function isProductLive(state: ProductState): boolean {
  if (state.run.failed || state.run.stalled) return false;
  return state.status === "draft" || state.status === "analyzing";
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
