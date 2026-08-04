import { describe, expect, it } from "vitest";

import {
  buildSafeBenchAttributes,
  safeParseBenchAttribute,
} from "./safe-attributes";

describe("safeParseBenchAttribute", () => {
  it("accepts a well-formed value for every closed key", () => {
    expect(safeParseBenchAttribute("bench.model", "flux-fast")).toEqual({
      key: "bench.model",
      value: "flux-fast",
    });
    expect(safeParseBenchAttribute("bench.sample_index", 0)).toEqual({
      key: "bench.sample_index",
      value: 0,
    });
    expect(safeParseBenchAttribute("bench.concurrency", 4)).toEqual({
      key: "bench.concurrency",
      value: 4,
    });
    expect(safeParseBenchAttribute("bench.provider_ms", 1234.5)).toEqual({
      key: "bench.provider_ms",
      value: 1234.5,
    });
    expect(safeParseBenchAttribute("bench.download_ms", 42)).toEqual({
      key: "bench.download_ms",
      value: 42,
    });
    expect(safeParseBenchAttribute("bench.cost_micros", 3000)).toEqual({
      key: "bench.cost_micros",
      value: 3000,
    });
    expect(safeParseBenchAttribute("bench.cost_basis", "images")).toEqual({
      key: "bench.cost_basis",
      value: "images",
    });
    expect(safeParseBenchAttribute("bench.width", 1024)).toEqual({
      key: "bench.width",
      value: 1024,
    });
    expect(safeParseBenchAttribute("bench.height", 1024)).toEqual({
      key: "bench.height",
      value: 1024,
    });
    expect(safeParseBenchAttribute("bench.error.code", "TIMEOUT")).toEqual({
      key: "bench.error.code",
      value: "TIMEOUT",
    });
    expect(
      safeParseBenchAttribute("bench.dropped_params", ["aspect", "seed"])
    ).toEqual({
      key: "bench.dropped_params",
      value: ["aspect", "seed"],
    });
    expect(safeParseBenchAttribute("bench.queue_polled", true)).toEqual({
      key: "bench.queue_polled",
      value: true,
    });
  });

  it("drops an unknown key", () => {
    expect(safeParseBenchAttribute("bench.prompt", "a cat")).toBeNull();
    expect(safeParseBenchAttribute("random.key", 1)).toBeNull();
  });

  it("drops a URL-like value even under an otherwise-valid key", () => {
    expect(
      safeParseBenchAttribute("bench.model", "https://fal.media/files/x.png")
    ).toBeNull();
    expect(
      safeParseBenchAttribute("bench.model", "data:image/png;base64,aGVsbG8=")
    ).toBeNull();
  });

  it("drops a prompt-shaped (over-length) value", () => {
    const longValue = "a".repeat(200);
    expect(safeParseBenchAttribute("bench.model", longValue)).toBeNull();
  });

  it("drops an out-of-vocabulary error code", () => {
    expect(
      safeParseBenchAttribute("bench.error.code", "SOMETHING_ELSE")
    ).toBeNull();
  });

  it("drops an out-of-vocabulary cost basis rather than accepting an unrecognized unit", () => {
    expect(safeParseBenchAttribute("bench.cost_basis", "gallons")).toBeNull();
  });

  it("drops a negative or non-integer number for an integer-only key", () => {
    expect(safeParseBenchAttribute("bench.sample_index", -1)).toBeNull();
    expect(safeParseBenchAttribute("bench.cost_micros", 1.5)).toBeNull();
    expect(safeParseBenchAttribute("bench.width", 0)).toBeNull();
  });
});

describe("buildSafeBenchAttributes", () => {
  it("keeps only the entries that pass their schema, silently dropping the rest", () => {
    const result = buildSafeBenchAttributes({
      "bench.model": "flux-fast",
      "bench.sample_index": 2,
      "bench.prompt": "a secret prompt", // unknown key
      "bench.error.code": "NOT_A_CODE", // known key, bad value
    });

    expect(result).toEqual({
      "bench.model": "flux-fast",
      "bench.sample_index": 2,
    });
  });

  it("never throws on a hostile input bag", () => {
    expect(() =>
      buildSafeBenchAttributes({
        "bench.model": "https://evil.example/x",
        "bench.width": Number.NaN,
        "bench.dropped_params": "not-an-array",
      })
    ).not.toThrow();
    expect(
      buildSafeBenchAttributes({
        "bench.model": "https://evil.example/x",
        "bench.width": Number.NaN,
        "bench.dropped_params": "not-an-array",
      })
    ).toEqual({});
  });
});
