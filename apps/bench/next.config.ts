import type { NextConfig } from "next";

/** The docs site's own Vercel project (`apps/docs`). */
const DOCS_ORIGIN = "https://motif-docs.vercel.app";

const nextConfig: NextConfig = {
  // The compiler memoizes components itself, which is why this app no longer
  // writes useMemo or useCallback by hand.
  reactCompiler: true,
  // Mastra ships native/ESM-only bits that must not go through Next's
  // client/server bundling — same convention as materialdesk.
  serverExternalPackages: ["@mastra/*"],
  // No-build workspace packages: Next must transpile their `src/*.ts`
  // sources itself rather than expecting a `dist/`.
  transpilePackages: [
    "@motif/bench-core",
    "@motif/bench-db",
    "@motif/bench-env",
  ],
  // The docs are their own Blume project, served here under /docs.
  async rewrites() {
    return [
      { destination: `${DOCS_ORIGIN}/docs`, source: "/docs" },
      { destination: `${DOCS_ORIGIN}/docs/:path*`, source: "/docs/:path*" },
    ];
  },
  // The pages the docs replaced. `/commands/:id` stays a route, because
  // signed in it is the App's form for that Task.
  async redirects() {
    return [
      { destination: "/docs/commands", permanent: true, source: "/commands" },
      {
        destination: "/docs/looks-and-moods",
        permanent: true,
        source: "/looks",
      },
      { destination: "/docs/setup", permanent: true, source: "/setup" },
    ];
  },
  images: {
    // Mock samples are generated as inline SVG placeholders by
    // `/api/mock-image` (no fal access this phase — see
    // `lib/runs/mock-engine.ts`), so `next/image` needs SVG optimization
    // enabled. Safe here because the only SVG source is our own
    // same-origin route, never user- or provider-supplied content.
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
