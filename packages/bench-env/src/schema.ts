import { defineEnv } from "@howells/envy";
import { z } from "zod";

const parseOptionalBoolean = (value: unknown): unknown => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (value === true || value === false) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return value;
};

const parsePostgresqlUrl = (value: string): URL | undefined => {
  try {
    const url = new URL(value);
    return url.protocol === "postgres:" || url.protocol === "postgresql:"
      ? url
      : undefined;
  } catch {
    return undefined;
  }
};

const postgresqlUrl = z
  .string()
  .refine((value) => parsePostgresqlUrl(value) !== undefined);

// Consumed secrets are required: every key read by application code must fail
// loudly here when missing or empty. Never add `.optional()` to a consumed
// key or coalesce against it (e.g. `env.X ?? ""`).
//
// Defining this schema performs no I/O and reads nothing from `process.env`
// — `defineEnv` is side-effect free until `.parseServer(...)` is called (see
// `./server.ts`). This file is deliberately excluded from the package export
// map; consumers reach it only through `./config` (parse-free) or `./server`
// (eager parse + `requireServerEnv`).
// The environment carries ONLY credentials (user decision, 2026-08-05):
// tokens, API keys, and connection strings — never behavior config. Mode
// (mock vs live) is DERIVED from which credentials are present, and the
// schema-push acknowledgement is passed inline at invocation
// (`BENCH_SCHEMA_PUSH_TARGET=motif-bench-dev pnpm db:push`), never stored.
export const envSchema = defineEnv({
  server: {
    // Push acknowledgement — deliberate per-invocation friction for a
    // remote-DB schema push, not persistent config. Validated here so the
    // guard in bench-db reads it through envy like everything else.
    BENCH_SCHEMA_PUSH_TARGET: z.literal("motif-bench-dev").optional(),
    /** Vercel Blob read-write token for the private `motif-bench-images`
     * store. Optional, and the one exception to "consumed secrets are
     * required" above — its absence is not a misconfiguration but a
     * *capability*: without it the live engine keeps images on local disk,
     * which is exactly right for a throwaway local sweep and exactly wrong
     * on Vercel, where the filesystem does not survive the invocation. The
     * store it belongs to decides where bytes go, so this is a credential,
     * not behaviour config. */
    BLOB_READ_WRITE_TOKEN: z.string().trim().min(1).optional(),
    DATABASE_URL: z.url(),
    DIRECT_DATABASE_URL: postgresqlUrl,
    FAL_KEY: z.string().trim().min(1),
  },
  system: {
    CI: z.preprocess(parseOptionalBoolean, z.boolean().optional()),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    VERCEL: z.string().min(1).optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  },
});

export type ServerEnv = ReturnType<typeof envSchema.parseServer>;

export const parseServerEnv = (input: Record<string, unknown>): ServerEnv =>
  envSchema.parseServer(input);
