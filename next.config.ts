import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * CSP:
 * - Allow blob: workers (Chrome PDF viewer)
 * - Allow frames (iframe previews)
 * - Allow child-src as a fallback (older browsers)
 *
 * NOTE: We apply this CSP to PAGES, not API routes.
 */
function buildCsp() {
  const directives = [
    "default-src 'self'",

    // styles
    "style-src 'self' 'unsafe-inline'",

    // scripts
    // dev needs eval for HMR; blob: helps some browser PDF flows / worker bootstraps
    isProd
      ? "script-src 'self' 'unsafe-inline' blob:"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",

    // ✅ PDF viewer / pdf.js-like behavior
    "worker-src 'self' blob:",

    // ✅ allow iframe previews
    "frame-src 'self' blob:",
    "child-src 'self' blob:",

    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",

    // prevent clickjacking
    "frame-ancestors 'none'",

    ...(isProd ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

/**
 * Headers for PAGES (strict).
 * We do NOT apply these to /api/* because streaming responses + strict CORP/CSP
 * can cause confusing browser blocks (especially inside iframes).
 */
const pageSecurityHeaders = [
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),

  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

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

  // These are fine for pages
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },

  { key: "Content-Security-Policy", value: buildCsp() },
];

/**
 * Headers for API routes (relaxed).
 * Key idea: don’t let CORP/CSP interfere with streaming / iframe loading.
 */
const apiHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

  // ✅ This is the big one: allow API resources to be embedded/consumed
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // ✅ Apply strict headers ONLY to non-API routes
        source: "/((?!api).*)",
        headers: pageSecurityHeaders,
      },
      {
        // ✅ Apply relaxed headers to API routes
        source: "/api/:path*",
        headers: apiHeaders,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "salus-software",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    automaticVercelMonitors: true,
    treeshake: { removeDebugLogging: true },
  },
});
