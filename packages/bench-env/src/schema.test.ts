import { describe, expect, it } from "vitest";

import { envSchema, parseServerEnv } from "./schema";

const VALID_INPUT = {
  DATABASE_URL: "postgres://user:pass@ep-foo-pooler.us-east-1.aws.neon.tech/db",
  DIRECT_DATABASE_URL: "postgres://user:pass@ep-foo.us-east-1.aws.neon.tech/db",
  FAL_KEY: "fal_test_key",
};

describe("bench-env schema", () => {
  it("defines the schema without parsing anything (module import is side-effect free)", () => {
    expect(envSchema.definition.server).toBeDefined();
  });

  it("parses a valid input", () => {
    const parsed = parseServerEnv(VALID_INPUT);
    expect(parsed.DATABASE_URL).toBe(VALID_INPUT.DATABASE_URL);
    expect(parsed.FAL_KEY).toBe("fal_test_key");
    expect(parsed.BENCH_MOCK).toBeUndefined();
    expect(parsed.BENCH_SCHEMA_PUSH_TARGET).toBeUndefined();
  });

  it("rejects a missing required secret", () => {
    const withoutFalKey: Record<string, unknown> = { ...VALID_INPUT };
    delete withoutFalKey.FAL_KEY;
    expect(() => parseServerEnv(withoutFalKey)).toThrow(/./u);
  });

  it("rejects a non-postgresql DIRECT_DATABASE_URL", () => {
    expect(() =>
      parseServerEnv({
        ...VALID_INPUT,
        DIRECT_DATABASE_URL: "https://example.com",
      })
    ).toThrow(/./u);
  });

  it("coerces BENCH_MOCK truthy/falsy string forms", () => {
    expect(
      parseServerEnv({ ...VALID_INPUT, BENCH_MOCK: "true" }).BENCH_MOCK
    ).toBe(true);
    expect(parseServerEnv({ ...VALID_INPUT, BENCH_MOCK: "0" }).BENCH_MOCK).toBe(
      false
    );
  });

  it("only accepts the motif-bench-dev literal for the push-target acknowledgement", () => {
    expect(() =>
      parseServerEnv({ ...VALID_INPUT, BENCH_SCHEMA_PUSH_TARGET: "other" })
    ).toThrow(/./u);
    expect(
      parseServerEnv({
        ...VALID_INPUT,
        BENCH_SCHEMA_PUSH_TARGET: "motif-bench-dev",
      }).BENCH_SCHEMA_PUSH_TARGET
    ).toBe("motif-bench-dev");
  });
});
