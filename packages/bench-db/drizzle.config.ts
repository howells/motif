import { requireServerEnv, serverEnv } from "@motif/bench-env/server";
import { defineConfig } from "drizzle-kit";

import { assertSchemaPushTarget } from "./src/schema-push-target";

const databaseUrl = requireServerEnv("DATABASE_URL");
const directDatabaseUrl = requireServerEnv("DIRECT_DATABASE_URL");

assertSchemaPushTarget({
  acknowledgedTarget: serverEnv.BENCH_SCHEMA_PUSH_TARGET,
  ci: serverEnv.CI,
  databaseUrl,
  directDatabaseUrl,
  nodeEnv: serverEnv.NODE_ENV,
  vercel: serverEnv.VERCEL,
  vercelEnv: serverEnv.VERCEL_ENV,
});

export default defineConfig({
  dbCredentials: { url: directDatabaseUrl },
  dialect: "postgresql",
  schema: "./src/schema.ts",
  strict: true,
  verbose: true,
});
