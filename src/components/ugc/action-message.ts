const MESSAGE_KEYS: Record<string, string> = {
  invalid_input: "ugc_error_invalid_input",
  not_found: "ugc_error_not_found",
  product_needs_link_or_image: "ugc_error_product_needs_link_or_image",
  media_provider_unconfigured: "ugc_error_media_provider_unconfigured",
  work_needs_product: "ugc_error_work_needs_product",
  product_not_read: "ugc_error_product_not_read",
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
  PRISM_NOT_CONFIGURED: "ugc_work_failure_prism_config",
  PRISM_AUTH_FAILED: "ugc_work_failure_prism_auth",
  PRISM_REQUEST_REJECTED: "ugc_work_failure_prism_request",
  PRISM_INVALID_RESPONSE: "ugc_work_failure_prism_response",
  PRISM_UNREACHABLE: "ugc_work_failure_prism_unavailable",
  PRISM_UNAVAILABLE: "ugc_work_failure_prism_unavailable",
  QUEUE_JOB_TERMINATED: "ugc_work_failure_terminated",
};

export function jobFailureKey(code: string | null): string {
  return (code && JOB_FAILURE_KEYS[code]) || "ugc_work_step_failed_unknown";
}
