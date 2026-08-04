import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mastra ships native/ESM-only bits that must not go through Next's
  // client/server bundling — same convention as materialdesk.
  serverExternalPackages: ["@mastra/*"],
  // No-build workspace packages: Next must transpile their `src/*.ts`
  // sources itself rather than expecting a `dist/`.
  transpilePackages: ["@motif/bench-db", "@motif/bench-env"],
};

export default nextConfig;
