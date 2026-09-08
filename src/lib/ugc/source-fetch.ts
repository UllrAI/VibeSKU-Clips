import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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

/** Product links are untrusted even when a remote scraper will fetch them. */
export async function validatePublicProductUrl(rawUrl: string): Promise<URL> {
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
  return url;
}
