import { withSentryConfig } from "@sentry/nextjs";
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
    "style-src 'self' 'unsafe-inline'",

    // Scripts: dev needs eval for HMR; blob: is needed for some libs that create blob-based workers.
    isProd
      ? "script-src 'self' 'unsafe-inline' blob:"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",

    // ✅ Allow blob workers (pdf.js and similar)
    "worker-src 'self' blob:",

    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "connect-src 'self' https:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",

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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "salus-software",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
