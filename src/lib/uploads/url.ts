// Store an authenticated application URL, never a long-lived object credential.
export function buildFileUrl(key: string): string {
  return `/api/files/content?key=${encodeURIComponent(key)}`;
}

/** Returns the object key carried by one of our authenticated file URLs. */
export function fileKeyFromUrl(value: string): string | null {
  if (!value.startsWith("/")) return null;
  try {
    const url = new URL(value, "https://files.local");
    if (url.origin !== "https://files.local") return null;
    if (url.pathname !== "/api/files/content") return null;
    return url.searchParams.get("key");
  } catch {
    return null;
  }
}
