// src/lib/security/csrf.ts
import { headers } from "next/headers";

/**
 * Basic same-origin protection:
 * - Accept requests from your app's canonical URL(s)
 * - Also accept same-host requests (for local dev / preview host situations)
 *
 * This is not a full CSRF token system; it’s a practical origin/referrer gate
 * for public token endpoints.
 */
export async function validateCSRF(): Promise<boolean> {
  const h = await headers();

  const origin = h.get("origin");
  const referer = h.get("referer");
  const host = h.get("host");

  // If both are missing, it's often non-browser/server-to-server.
  // For portal endpoints, default-deny is safer.
  if (!origin && !referer) return false;

  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL ?? null,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  ].filter(Boolean) as string[];

  // Allow exact match against configured origins
  const originOk =
    !!origin && allowedOrigins.some((allowed) => origin === allowed);

  // Allow referer beginning with allowed origins
  const refererOk =
    !!referer && allowedOrigins.some((allowed) => referer.startsWith(allowed));

  // Also allow same-host (useful for local dev / some preview configurations)
  const sameHostOk =
    (!!origin && !!host && origin.includes(host)) ||
    (!!referer && !!host && referer.includes(host));

  return originOk || refererOk || sameHostOk;
}
