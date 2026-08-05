import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
