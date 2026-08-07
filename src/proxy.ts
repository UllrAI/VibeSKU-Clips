import { NextRequest, NextResponse } from "next/server";

/**
 * Local-tool CORS for /api/*.
 *
 * Browser pages served from OTHER local ports call our API cross-origin — the
 * first consumer is the infinite-canvas workbench running the ClipForge video
 * node plugin (canvas at :3800/:3000 → ClipForge at :3457). Without these
 * headers every such fetch dies at the browser wall.
 *
 * Security: only localhost/127.0.0.1/[::1] origins (any port) are reflected.
 * A remote malicious page's origin never matches, so the browser-side wall
 * against drive-by abuse of the local instance (which can trigger paid-model
 * spending) stays intact. Additional trusted origins can be granted explicitly
 * via CLIPFORGE_CORS_ORIGINS (comma-separated full origins).
 */

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  if (LOCAL_ORIGIN.test(origin)) return origin;
  const extra = (process.env.CLIPFORGE_CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

function corsHeaders(origin: string, req: NextRequest): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    // echo whatever headers the preflight asks for (Content-Type today; future-proof)
    "Access-Control-Allow-Headers": req.headers.get("access-control-request-headers") || "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export function proxy(req: NextRequest) {
  const origin = allowedOrigin(req.headers.get("origin"));
  // answer preflights here — API routes have no OPTIONS handlers
  if (req.method === "OPTIONS" && origin) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin, req) });
  }
  const res = NextResponse.next();
  if (origin) {
    for (const [k, v] of Object.entries(corsHeaders(origin, req))) res.headers.set(k, v);
  }
  return res;
}

export const config = { matcher: "/api/:path*" };
