import { describe, expect, it } from "vitest";

import {
  buildSafeBenchAttributes,
  safeParseBenchAttribute,
  SafeBenchAttributeKeySchema,
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
    expect(safeParseBenchAttribute("bench.quality_score", 3.25)).toEqual({
      key: "bench.quality_score",
      value: 3.25,
    });
    expect(safeParseBenchAttribute("bench.quality_level", "editorial")).toEqual(
      { key: "bench.quality_level", value: "editorial" }
    );
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

  it("drops an out-of-vocabulary quality level and a negative quality score", () => {
    expect(
      safeParseBenchAttribute("bench.quality_level", "amazing")
    ).toBeNull();
    expect(safeParseBenchAttribute("bench.quality_score", -0.1)).toBeNull();
  });

  it("drops a negative or non-integer number for an integer-only key", () => {
    expect(safeParseBenchAttribute("bench.sample_index", -1)).toBeNull();
    expect(safeParseBenchAttribute("bench.cost_micros", 1.5)).toBeNull();
    expect(safeParseBenchAttribute("bench.width", 0)).toBeNull();
  });
});

describe("no base64/data URI can reach a span attribute", () => {
  // Executable form of BRIEF.md rule 1 ("no base64 or a data URI reach a
  // span, a log, or Langfuse"): a realistic data URI, and a bare base64
  // blob long enough to be an inlined image, are tried against *every* key
  // in the closed vocabulary — string-typed keys reject it via
  // `urlLikePattern`/length; every other key rejects it by failing its own
  // type (a string can never satisfy a number/boolean/enum schema).
  const DATA_URI_PAYLOAD =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  const BARE_BASE64_PAYLOAD = "A".repeat(400);

  it.each(SafeBenchAttributeKeySchema.options)(
    "rejects a data: URI under %s",
    (key) => {
      expect(safeParseBenchAttribute(key, DATA_URI_PAYLOAD)).toBeNull();
    }
  );

  it.each(SafeBenchAttributeKeySchema.options)(
    "rejects a long bare base64 blob under %s",
    (key) => {
      expect(safeParseBenchAttribute(key, BARE_BASE64_PAYLOAD)).toBeNull();
    }
  );

  it("never lets either payload survive buildSafeBenchAttributes across the whole vocabulary at once", () => {
    const hostileBag = Object.fromEntries(
      SafeBenchAttributeKeySchema.options.map((key, index) => [
        key,
        index % 2 === 0 ? DATA_URI_PAYLOAD : BARE_BASE64_PAYLOAD,
      ])
    );

    expect(buildSafeBenchAttributes(hostileBag)).toEqual({});
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
