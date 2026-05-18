import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Per-IP rate limiting for the API surface. Sized for the Vercel free plan
 * (function invocations + Supabase row writes) — generous for legitimate
 * humans, tight enough to cap runaway scripted abuse.
 *
 * Limits are intentionally additive: a request can match at most one rule
 * (first match wins) so we don't double-count. Window/limit pairs:
 *   - Room creation: 5 / hour / IP. Only endpoint that produces persistent
 *     rooms rows and consumes 4-char-code namespace.
 *   - Room mutations: 60 / min / IP. Covers /me, /join, /lock-letter,
 *     /submit, /state, /rename — sustained ~1/sec is far above the
 *     human-paced game's needs, low enough to discourage abuse.
 *   - Word validate: 30 / min / IP. Each call may hit dictionaryapi.dev
 *     and triggers a wordlist gunzip on cold start.
 *
 * 429 responses include `Retry-After` so well-behaved clients back off.
 */

type LimitRule = {
  match: (path: string, method: string) => boolean;
  limit: number;
  windowMs: number;
  scope: string;
};

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

const LIMITS: LimitRule[] = [
  {
    scope: "create-room",
    match: (p, m) => m === "POST" && p === "/api/rooms",
    limit: 5,
    windowMs: HOUR,
  },
  {
    scope: "word-validate",
    match: (p, m) => m === "POST" && p === "/api/words/validate",
    limit: 30,
    windowMs: MINUTE,
  },
  {
    scope: "room-mutations",
    match: (p, m) => m === "POST" && p.startsWith("/api/rooms/"),
    limit: 60,
    windowMs: MINUTE,
  },
];

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    // Vercel sets the real client IP as the first entry.
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function proxy(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  const method = request.method;

  for (const rule of LIMITS) {
    if (!rule.match(path, method)) continue;
    const ip = getClientIp(request);
    const result = rateLimit(`${rule.scope}:${ip}`, rule.limit, rule.windowMs);
    if (!result.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((result.resetAt - Date.now()) / 1000)
      );
      return new NextResponse(
        JSON.stringify({ error: "Too many requests" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
          },
        }
      );
    }
    break;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
