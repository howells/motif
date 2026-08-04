/**
 * `storeModeFromEnv`/`engineModeFromEnv` are the pure functions
 * `repository.ts` derives `useMockStore`/`useMockEngine` from — see that
 * file's header for why the two are computed independently even though they
 * both currently read the same `BENCH_MOCK` value. This is a direct test of
 * the composition-root decision, without touching `process.env` (a raw read
 * happens once at module scope in `repository.ts` itself, not here) or
 * either store.
 */
import { describe, expect, it } from "vitest";

import { engineModeFromEnv, storeModeFromEnv } from "./repository";

// A variable read through `process.env`, not a literal `undefined` argument
// — `BENCH_MOCK` really is `string | undefined` at the one real call site
// (`process.env.BENCH_MOCK`), and an unset env var reads back as `undefined`.
const unsetBenchMock: string | undefined = process.env.__BENCH_TEST_UNSET__;

describe("storeModeFromEnv", () => {
  it('selects the in-memory mock store only for exactly "1"', () => {
    expect(storeModeFromEnv("1")).toBe("mock");
  });

  it("selects Postgres for every other value, including unset", () => {
    expect(storeModeFromEnv("0")).toBe("postgres");
    expect(storeModeFromEnv(unsetBenchMock)).toBe("postgres");
    expect(storeModeFromEnv("")).toBe("postgres");
    expect(storeModeFromEnv("true")).toBe("postgres");
  });
});

describe("engineModeFromEnv", () => {
  it('selects the live engine only for exactly "0"', () => {
    expect(engineModeFromEnv("0")).toBe("live");
  });

  it("defaults to the mock engine for every other value, including unset — BRIEF.md rule 6, mock by default", () => {
    expect(engineModeFromEnv("1")).toBe("mock");
    expect(engineModeFromEnv(unsetBenchMock)).toBe("mock");
    expect(engineModeFromEnv("")).toBe("mock");
    expect(engineModeFromEnv("nope")).toBe("mock");
  });

  it('never selects "live" whenever storeModeFromEnv selects "mock" — the store/engine combination this phase\'s bug relied on can no longer arise', () => {
    const mockStoreValues = ["0", "1", unsetBenchMock, "", "banana"].filter(
      (rawBenchMock) => storeModeFromEnv(rawBenchMock) === "mock"
    );
    expect(mockStoreValues).toEqual(["1"]);
    for (const rawBenchMock of mockStoreValues) {
      expect(engineModeFromEnv(rawBenchMock)).toBe("mock");
    }
  });
});
