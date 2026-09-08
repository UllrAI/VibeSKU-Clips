const MESSAGE_KEYS: Record<string, string> = {
  invalid_input: "ugc_error_invalid_input",
  not_found: "ugc_error_not_found",
  product_busy: "ugc_error_product_busy",
  product_needs_link_or_image: "ugc_error_product_needs_link_or_image",
  product_needs_source_url: "ugc_error_product_needs_source_url",
  media_provider_unconfigured: "ugc_error_media_provider_unconfigured",
  work_needs_product: "ugc_error_work_needs_product",
  product_not_read: "ugc_error_product_not_read",
  work_needs_frames: "ugc_error_work_needs_frames",
  work_already_rendered: "ugc_error_work_already_rendered",
  work_busy: "ugc_error_work_busy",
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
  FIRECRAWL_NOT_CONFIGURED: "ugc_product_failure_firecrawl_config",
  FIRECRAWL_AUTH_FAILED: "ugc_product_failure_firecrawl_auth",
  FIRECRAWL_QUOTA_EXHAUSTED: "ugc_product_failure_firecrawl_quota",
  FIRECRAWL_SITE_UNSUPPORTED: "ugc_product_failure_site_unsupported",
  FIRECRAWL_REQUEST_REJECTED: "ugc_product_failure_firecrawl_request",
  FIRECRAWL_INVALID_RESPONSE: "ugc_product_failure_firecrawl_response",
  FIRECRAWL_UNAVAILABLE: "ugc_product_failure_firecrawl_unavailable",
  UGC_PRODUCT_SOURCE_READ_FAILED: "ugc_product_failure_source_read",
  UGC_STORYBOARD_TIMEOUT: "ugc_work_failure_timeout",
  UGC_RENDER_TIMEOUT: "ugc_work_failure_timeout",
  UGC_RENDER_FAILED: "ugc_work_failure_render",
  INVALID_JOB_PAYLOAD: "ugc_work_failure_invalid_task",
  PRISM_NOT_CONFIGURED: "ugc_work_failure_prism_config",
  PRISM_AUTH_FAILED: "ugc_work_failure_prism_auth",
  PRISM_REQUEST_REJECTED: "ugc_work_failure_prism_request",
  PRISM_INVALID_RESPONSE: "ugc_work_failure_prism_response",
  PRISM_UNREACHABLE: "ugc_work_failure_prism_unavailable",
  PRISM_UNAVAILABLE: "ugc_work_failure_prism_unavailable",
  LK666_NOT_CONFIGURED: "ugc_work_failure_lk666_config",
  LK666_AUTH_FAILED: "ugc_work_failure_lk666_auth",
  LK666_REQUEST_REJECTED: "ugc_work_failure_lk666_request",
  LK666_INVALID_RESPONSE: "ugc_work_failure_lk666_response",
  LK666_UNREACHABLE: "ugc_work_failure_lk666_unavailable",
  LK666_UNAVAILABLE: "ugc_work_failure_lk666_unavailable",
  VIDEO_PROVIDER_TASK_INVALID: "ugc_work_failure_incomplete",
  QUEUE_JOB_TERMINATED: "ugc_work_failure_terminated",
};

export function jobFailureKey(code: string | null): string {
  return (code && JOB_FAILURE_KEYS[code]) || "ugc_work_step_failed_unknown";
}

const PRODUCT_IMPORT_FAILURE_CODES = new Set([
  "FIRECRAWL_NOT_CONFIGURED",
  "FIRECRAWL_AUTH_FAILED",
  "FIRECRAWL_QUOTA_EXHAUSTED",
  "FIRECRAWL_SITE_UNSUPPORTED",
  "FIRECRAWL_REQUEST_REJECTED",
  "FIRECRAWL_INVALID_RESPONSE",
  "FIRECRAWL_UNAVAILABLE",
]);

/** Whether retrying the failed operation should refresh page-derived material. */
export function isProductImportFailure(code: string | null): boolean {
  return code !== null && PRODUCT_IMPORT_FAILURE_CODES.has(code);
}
