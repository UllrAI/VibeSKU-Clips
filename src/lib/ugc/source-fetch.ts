import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 12_000;

export class UnreadableSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadableSourceError";
  }
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80") ||
      normalized.startsWith("::ffff:")
    );
  }

  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(Number.isNaN)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Product pages are operator-supplied URLs, so the fetch is deliberately
 * narrow: public HTTPS hosts only, no redirects into private space, a hard size
 * cap, and a timeout. A blocked or unreadable link pauses that one product
 * instead of letting the product step spin forever.
 */
export async function fetchProductSource(rawUrl: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnreadableSourceError("The product link is not a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new UnreadableSourceError("Product links must use HTTPS.");
  }

  const host = url.hostname;
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new UnreadableSourceError(
          "The product link's host could not be resolved.",
        );
      });

  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new UnreadableSourceError(
      "The product link resolves to a non-public address.",
    );
  }

  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "text/html,application/xhtml+xml" },
  }).catch(() => {
    throw new UnreadableSourceError("The product link could not be reached.");
  });

  if (!response.ok) {
    throw new UnreadableSourceError(
      `The product link returned HTTP ${response.status}.`,
    );
  }

  const body = await response.text();
  return htmlToText(body.slice(0, MAX_BYTES));
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
