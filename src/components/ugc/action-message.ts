const MESSAGE_KEYS: Record<string, string> = {
  invalid_input: "ugc_error_invalid_input",
  not_found: "ugc_error_not_found",
  product_needs_link_or_image: "ugc_error_product_needs_link_or_image",
  talent_needs_image: "ugc_error_talent_needs_image",
  talent_needs_prompt: "ugc_error_talent_needs_prompt",
  batch_too_large: "ugc_error_batch_too_large",
  media_provider_unconfigured: "ugc_error_media_provider_unconfigured",
  clip_not_failed: "ugc_error_clip_not_failed",
};

/**
 * Server actions return a stable code; the copy is resolved here so no raw
 * server text ever reaches the interface.
 */
export function actionMessageKey(code: string | undefined): string {
  return (code && MESSAGE_KEYS[code]) || "ugc_error_unexpected";
}
