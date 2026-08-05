import { getLiveCredentials } from "@motif/bench-env/runtime";
/**
 * Mode derivation — DB-free. `getLiveCredentials` is the single decision
 * the composition root consumes: all live credentials present -> live store
 * and engine; anything missing -> mock for both. There is no flag, so the
 * historical BENCH_MOCK failure class (store and engine disagreeing about
 * what "live" means) cannot be expressed at all — that is the test below.
 */
import { describe, expect, it } from "vitest";

const FULL = {
  DATABASE_URL: "postgresql://user:pass@db.example.neon.tech/neondb",
  DIRECT_DATABASE_URL:
    "postgresql://user:pass@db-direct.example.neon.tech/neondb",
  FAL_KEY: "fal-key-under-test",
} as NodeJS.ProcessEnv;

describe("getLiveCredentials", () => {
  it("resolves when every live credential is present", () => {
    expect(getLiveCredentials(FULL)).toStrictEqual({
      databaseUrl: FULL.DATABASE_URL,
      falKey: FULL.FAL_KEY,
    });
  });

  it.each(["FAL_KEY", "DATABASE_URL", "DIRECT_DATABASE_URL"])(
    "returns null (mock mode) when %s is missing — never throws",
    (key) => {
      const partial = { ...FULL };
      delete partial[key];
      expect(getLiveCredentials(partial)).toBeNull();
    }
  );

  it("returns null for an empty environment — a fresh clone runs mock", () => {
    expect(getLiveCredentials({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("rejects a blank FAL_KEY rather than treating it as live", () => {
    expect(getLiveCredentials({ ...FULL, FAL_KEY: "  " })).toBeNull();
  });
});
