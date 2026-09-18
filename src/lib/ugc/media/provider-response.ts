const MAX_DETAIL_CHARACTERS = 300;

function clamp(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_DETAIL_CHARACTERS);
}

/**
 * Why a media provider refused, in its own words. Both APIs name the field
 * they rejected, and an error that keeps only the status code leaves the log
 * with nothing to act on — which is how an HTTP 422 becomes a guess.
 */
export async function rejectionDetail(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  if (!text) return "";
  try {
    const body: unknown = JSON.parse(text);
    const detail = (body as { detail?: unknown })?.detail;
    // FastAPI validation errors arrive as one entry per offending field.
    if (Array.isArray(detail))
      return clamp(
        detail
          .map((item: { loc?: unknown[]; msg?: unknown }) =>
            [(item.loc ?? []).join("."), item.msg].filter(Boolean).join(": "),
          )
          .join("; "),
      );
    if (typeof detail === "string") return clamp(detail);
    const message = (body as { msg?: unknown }).msg;
    if (typeof message === "string") return clamp(message);
  } catch {
    // Not JSON; the raw body is still better than nothing.
  }
  return clamp(text);
}
