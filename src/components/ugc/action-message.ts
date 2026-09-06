const MESSAGE_KEYS: Record<string, string> = {
  invalid_input: "ugc_error_invalid_input",
  not_found: "ugc_error_not_found",
  product_needs_link_or_image: "ugc_error_product_needs_link_or_image",
  talent_needs_image: "ugc_error_talent_needs_image",
  talent_needs_prompt: "ugc_error_talent_needs_prompt",
  batch_too_large: "ugc_error_batch_too_large",
  media_provider_unconfigured: "ugc_error_media_provider_unconfigured",
  clip_not_failed: "ugc_error_clip_not_failed",
  work_needs_product: "ugc_error_work_needs_product",
  product_not_read: "ugc_error_product_not_read",
  clip_from_work: "ugc_error_clip_from_work",
  work_needs_frames: "ugc_error_work_needs_frames",
};

/**
 * Server actions return a stable code; the copy is resolved here so no raw
 * server text ever reaches the interface.
 */
export function actionMessageKey(code: string | undefined): string {
  return (code && MESSAGE_KEYS[code]) || "ugc_error_unexpected";
}

/**
 * A background step that gave up carries our own error code. Codes that mean
 * something to the operator get their own line; anything else falls back to a
 * generic one rather than leaking a handler's message into the interface.
 */
const JOB_FAILURE_KEYS: Record<string, string> = {
  UGC_WORK_MISSING: "ugc_error_not_found",
  UGC_WORK_NO_PRODUCT: "ugc_error_work_needs_product",
  UGC_WORK_NO_SCRIPT: "ugc_work_failure_no_script",
  UGC_WORK_NO_FRAMES: "ugc_error_work_needs_frames",
  UGC_WORK_INCOMPLETE: "ugc_work_failure_incomplete",
  UGC_PRODUCT_NOT_READ: "ugc_error_product_not_read",
  UGC_STORAGE_UNAVAILABLE: "ugc_work_failure_storage",
  UGC_STORYBOARD_TIMEOUT: "ugc_work_failure_timeout",
  UGC_RENDER_TIMEOUT: "ugc_work_failure_timeout",
  UGC_RENDER_FAILED: "ugc_work_failure_render",
  QUEUE_JOB_TERMINATED: "ugc_work_failure_terminated",
};

export function jobFailureKey(code: string | null): string {
  return (code && JOB_FAILURE_KEYS[code]) || "ugc_work_step_failed_unknown";
}
