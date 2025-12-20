import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  apiRatelimit,
  uploadRatelimit,
  tokenCheckRatelimit,
} from "@/lib/rate-limit";

function getClientIp(req: NextRequest) {
  // NextRequest.ip exists at runtime on Edge, but is not typed
  const ip =
    (req as unknown as { ip?: string }).ip ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  return ip;
}

function withRateLimitHeaders(
  res: NextResponse,
  limit: number,
  remaining: number,
  reset: number
) {
  res.headers.set("X-RateLimit-Limit", String(limit));
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  res.headers.set("X-RateLimit-Reset", String(reset));
  return res;
}

async function applyRateLimiting(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Only rate limit API routes
  if (!pathname.startsWith("/api/")) return null;

  let rl:
    | typeof apiRatelimit
    | typeof uploadRatelimit
    | typeof tokenCheckRatelimit = apiRatelimit;

  // Tune these to match your actual API paths (safe defaults)
  if (
    pathname.startsWith("/api/uploads") ||
    pathname.startsWith("/api/public/upload")
  ) {
    rl = uploadRatelimit;
  } else if (
    pathname.startsWith("/api/public/client") ||
    pathname.startsWith("/api/portal/") ||
    pathname.includes("/token") ||
    pathname.includes("/validate")
  ) {
    rl = tokenCheckRatelimit;
  } else {
    rl = apiRatelimit;
  }

  const ip = getClientIp(req);

  // Keying by IP + route is a good baseline
  const key = `${ip}:${pathname}`;
  const result = await rl.limit(key);

  if (!result.success) {
    const res = NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many requests. Please try again shortly.",
      },
      { status: 429 }
    );
    return withRateLimitHeaders(
      res,
      result.limit,
      result.remaining,
      result.reset
    );
  }

  const res = NextResponse.next();
  return withRateLimitHeaders(
    res,
    result.limit,
    result.remaining,
    result.reset
  );
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 1) Rate limiting for API routes
  const rlResponse = await applyRateLimiting(req);
  if (rlResponse) return rlResponse;

  // ✅ IMPORTANT: Do NOT run Supabase auth logic for API routes
  // (prevents load issues / timeouts when hammering API endpoints)
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 2) Supabase auth protection for app pages (/clients/*)
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isProtected = pathname.startsWith("/clients");
  const isAuthRoute =
    pathname.startsWith("/login") || pathname.startsWith("/auth/");

  if (isProtected && !user && !isAuthRoute) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return res;
}

export const config = {
  matcher: ["/clients/:path*", "/api/:path*"],
};
