// next.config.ts
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * A conservative CSP that generally works for Next.js without breaking dev.
 * In production we keep it on but avoid nonces for now (we can add nonces later).
 *
 * NOTE: If you use any third-party scripts (analytics, chat widgets), you’ll need to extend this.
 */
function buildCsp() {
  const directives = [
    "default-src 'self'",
    // Next.js may need inline styles (styled-jsx) and/or style tags from libs.
    // If you later add nonces/hashes, we can remove 'unsafe-inline'.
    "style-src 'self' 'unsafe-inline'",
    // Scripts: avoid unsafe-eval in production. Dev needs eval for HMR in many setups.
    isProd
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Use CSP instead of X-Frame-Options
    "frame-ancestors 'none'",
    // Upgrade http:// to https:// on supporting browsers (prod only)
    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

const securityHeaders = [
  // HSTS: only set in production (requires HTTPS).
  // 2 years + include subdomains + preload is a strong stance. If you’re unsure, drop preload for now.
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),

  // Prevent MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },

  // Clickjacking protection is handled by CSP frame-ancestors.
  // If you prefer X-Frame-Options anyway, use SAMEORIGIN (but it’s less flexible than CSP).
  // { key: "X-Frame-Options", value: "DENY" },

  // Reduce referrer leakage
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // Basic permissions lockdown (tweak as needed)
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "interest-cohort=()",
      "payment=()",
      "usb=()",
    ].join(", "),
  },

  // Helps avoid some cross-origin leakage
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },

  // CSP (we’ll apply to all routes)
  { key: "Content-Security-Policy", value: buildCsp() },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to everything (pages + API)
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
