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
export const envSchema = defineEnv({
  optional: {
    // Mock-by-default flag for the harness (see `docs/arc/bench/BRIEF.md`
    // rule 6). `bench-core` owns the actual default-to-mock behavior; this
    // schema only validates the raw value.
    BENCH_MOCK: z.preprocess(parseOptionalBoolean, z.boolean().optional()),
  },
  server: {
    BENCH_SCHEMA_PUSH_TARGET: z.literal("motif-bench-dev").optional(),
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
