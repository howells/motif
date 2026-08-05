// Colocated vitest port of `docs/arc/bench/verify-kernel.mjs`, the kernel's
// standalone verifier. Keeps the same four checks the standalone script
// performs, but drives the actual `alignParams` export (not a hand-mirrored
// copy) against the real built SDK — no network, no fal calls.
import {
  ASPECT_RATIOS,
  aspectToFalImageSize,
  aspectToGptSize,
  buildGenerateBody,
  GENERATION_MODELS,
  MODELS,
} from "@howells/motif-sdk";
import type { GenerateOptions } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";

import { alignParams } from "./align-params";
import type { BenchSpec } from "./align-params";

const BASE_PROMPT = "a sunlit mid-century living room, wide angle";

// Run against both the default (1:1, the only aspect all three sizing
// dialects agree on — see BRIEF.md) and 3:2 (the kernel verifier's original
// spec), per the task brief's explicit instruction to cover both.
const SPECS: readonly (readonly [string, BenchSpec])[] = [
  [
    "1:1",
    {
      aspect: "1:1",
      outputFormat: "jpeg",
      prompt: BASE_PROMPT,
      resolution: "2K",
      seed: 12_345,
    },
  ],
  [
    "3:2",
    {
      aspect: "3:2",
      outputFormat: "jpeg",
      prompt: BASE_PROMPT,
      resolution: "2K",
      seed: 12_345,
    },
  ],
];

// Params the kernel may drop for a given model. Forcing each back into the
// aligned options and calling `buildGenerateBody` directly proves the drift
// guard: dropped params must be rejected, kept params must be accepted.
const FORCE_PROBES: Record<string, unknown> = {
  outputFormat: "jpeg",
  resolution: "4K",
  seed: 999,
};

describe("GENERATION_MODELS coverage", () => {
  it("is the 24 aliases currently registered (qwen3 added 2026-08-05)", () => {
    expect(GENERATION_MODELS).toHaveLength(24);
  });
});

describe.each(SPECS)("align-params kernel — spec aspect %s", (_label, spec) => {
  it("1. every alias aligns and builds a body without throwing", () => {
    const failures: string[] = [];
    for (const alias of GENERATION_MODELS) {
      const result = alignParams(alias, spec, 0);
      if (!result.ok) {
        failures.push(`${alias}: ${result.message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("2. bidirectional drift guard — every dropped param is rejected by buildGenerateBody, every kept param is accepted", () => {
    const failures: string[] = [];
    for (const alias of GENERATION_MODELS) {
      const result = alignParams(alias, spec, 0);
      if (!result.ok) {
        continue;
      }
      for (const [param, value] of Object.entries(FORCE_PROBES)) {
        const wasDropped = result.dropped.some((d) => d.param === param);
        const probe: GenerateOptions = {
          ...result.options,
          [param]: value,
        };
        let threw = false;
        try {
          buildGenerateBody(probe);
        } catch {
          threw = true;
        }
        if (wasDropped && !threw) {
          failures.push(
            `${alias}.${param}: we dropped it but the SDK accepts it`
          );
        }
        if (!wasDropped && threw) {
          failures.push(
            `${alias}.${param}: we kept it but the SDK rejected it`
          );
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("3. no sync_mode leaks; prompt present; num_images sane", () => {
    const failures: string[] = [];
    for (const alias of GENERATION_MODELS) {
      const result = alignParams(alias, spec, 0);
      if (!result.ok) {
        continue;
      }
      if (result.body.sync_mode !== undefined) {
        failures.push(`${alias}: sync_mode set — would return a data URI`);
      }
      if (
        typeof result.body.prompt !== "string" ||
        result.body.prompt.length === 0
      ) {
        failures.push(`${alias}: missing prompt`);
      }
      if (
        result.body.num_images !== undefined &&
        result.body.num_images !== 1
      ) {
        failures.push(
          `${alias}: num_images=${JSON.stringify(result.body.num_images)}`
        );
      }
    }
    expect(failures).toEqual([]);
  });

  it("4. per-sample seed offsetting is applied only where supported", () => {
    const failures: string[] = [];
    for (const alias of GENERATION_MODELS) {
      const first = alignParams(alias, spec, 0);
      const second = alignParams(alias, spec, 1);
      if (!first.ok || !second.ok) {
        continue;
      }
      if (MODELS[alias]?.supportsSeed === true) {
        if (first.body.seed === second.body.seed) {
          failures.push(`${alias}: sample 0 and 1 share a seed`);
        }
      } else if (first.body.seed !== undefined) {
        failures.push(
          `${alias}: seed sent to a model that does not support it`
        );
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("aspect coercion mappers — no fabricated throws", () => {
  // A previous autofixer fabricated `throw` statements into exactly these two
  // mappers' switch defaults (see BRIEF.md). Every AspectRatio value must map
  // cleanly through both, with no exceptions.
  it("maps all 15 AspectRatio values through aspectToGptSize and aspectToFalImageSize", () => {
    expect(ASPECT_RATIOS).toHaveLength(15);
    for (const aspect of ASPECT_RATIOS) {
      let gptSize: string | undefined;
      let falSize: string | undefined;
      expect(() => {
        gptSize = aspectToGptSize(aspect);
      }, `aspectToGptSize(${aspect}) threw`).not.toThrow();
      expect(() => {
        falSize = aspectToFalImageSize(aspect);
      }, `aspectToFalImageSize(${aspect}) threw`).not.toThrow();
      expect(typeof gptSize).toBe("string");
      expect(gptSize?.length).toBeGreaterThan(0);
      expect(typeof falSize).toBe("string");
      expect(falSize?.length).toBeGreaterThan(0);
    }
  });
});
