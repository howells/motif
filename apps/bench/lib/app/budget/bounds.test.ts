import { createMotif } from "@howells/motif-sdk";
import type { TaskInput } from "@howells/motif-sdk";
import { estimateCost } from "@motif/bench-core/sdk-internal";
import { describe, expect, it } from "vitest";

import { BOUNDED_GENERATION_MODELS, boundFor } from "./bounds";
import type { BoundContext, PlannedCall } from "./bounds";
import { USAGE_HOLD_MICROS_PER_IMAGE } from "./policy";

const motif = createMotif({ falKey: "fal_test_key" });
const SOURCE = "https://example.com/source.png";
const NO_REFERENCES: BoundContext = { references: [] };

const planned = (
  task: Parameters<typeof motif.plan>[0],
  input: TaskInput
): PlannedCall => {
  const plan = motif.plan(task, input, { dryRun: true })._unsafeUnwrap();
  return { body: plan.body, model: plan.model, provider: plan.provider, task };
};

const heldMicros = (call: PlannedCall, context: BoundContext): number => {
  const bound = boundFor(call, context);
  if (bound.kind !== "bounded") {
    throw new Error(`expected a bound, got: ${bound.reason}`);
  }
  return bound.micros;
};

describe("boundFor", () => {
  it("holds every listed generation Model above the SDK's own estimate at every size", () => {
    // Guard: if the SDK raises a Model's price above the App's ceiling, this
    // fails before the App could under-hold it.
    for (const model of BOUNDED_GENERATION_MODELS) {
      for (const resolution of [undefined, "1K", "2K", "4K"] as const) {
        for (const count of [1, 4]) {
          const estimate = estimateCost(model, resolution, count, 1);
          if (estimate === null) {
            continue;
          }
          const call: PlannedCall = {
            body: {
              image_size: { height: 2048, width: 2048 },
              num_images: count,
            },
            model,
            provider: "fal",
            task: "generate",
          };
          const held = heldMicros(call, {
            references: [{ height: 2048, width: 2048 }],
          });
          expect(
            held,
            `${model} ${resolution ?? "default"} ×${count}`
          ).toBeGreaterThanOrEqual(Math.ceil(estimate * 1_000_000));
        }
      }
    }
  });

  it("holds the published flat price plus headroom for an erase", () => {
    const call = planned("erase", { image: SOURCE, prompt: "the car" });
    expect(call.model).toBe("object-removal");
    // $0.024 listed, a quarter on top.
    expect(
      heldMicros(call, {
        references: [],
        source: { height: 1000, width: 1000 },
      })
    ).toBe(30_000);
  });

  it("holds the dearest variant of a Model with paid settings", () => {
    const call = planned("erase", {
      image: SOURCE,
      prompt: "the car",
      tier: "quality",
    });
    expect(call.model).toBe("finegrain-eraser");
    expect(
      heldMicros(call, { references: [], source: { height: 800, width: 800 } })
    ).toBe(450_000);
  });

  it("holds an upscale by its output size at the requested factor", () => {
    const call = planned("upscale", {
      image: SOURCE,
      scale: 4,
      sourceSize: { height: 1000, width: 1000 },
    });
    expect(call.model).toBe("clarity");
    // 4000 × 4000 = 16 MP at $0.03, then headroom.
    expect(
      heldMicros(call, {
        references: [],
        source: { height: 1000, width: 1000 },
      })
    ).toBe(600_000);
  });

  it("holds a Topaz upscale per started 24 megapixels of output", () => {
    const call = planned("upscale", {
      image: SOURCE,
      scale: 4,
      tier: "quality",
    });
    expect(call.model).toBe("topaz-precision");
    // 6000 × 6000 = 36 MP: two started 24 MP steps at $0.08.
    expect(
      heldMicros(call, {
        references: [],
        source: { height: 1500, width: 1500 },
      })
    ).toBe(200_000);
  });

  it("refuses an upscale whose factor isn't in the request", () => {
    const bound = boundFor(
      {
        body: { image_url: SOURCE },
        model: "topaz-image",
        provider: "fal",
        task: "upscale",
      },
      { references: [], source: { height: 1000, width: 1000 } }
    );
    expect(bound.kind).toBe("unbounded");
  });

  // Daniel's decision, 1 November 2026 (MOT-74): image Models fal bills by
  // usage run, each image held at a fixed $0.50 rather than refused.
  it("holds a usage-billed Model at a fixed amount per image", () => {
    const call = planned("generate", { model: "banana21", prompt: "a jug" });
    expect(boundFor(call, NO_REFERENCES)).toMatchObject({
      billing: "usage",
      kind: "bounded",
      listMicros: USAGE_HOLD_MICROS_PER_IMAGE,
      micros: USAGE_HOLD_MICROS_PER_IMAGE,
    });
  });

  it("holds every image a usage-billed run asks for", () => {
    const call = planned("generate", {
      count: 3,
      model: "sunburst",
      prompt: "a jug",
    });
    expect(boundFor(call, NO_REFERENCES)).toMatchObject({
      billing: "usage",
      micros: 3 * USAGE_HOLD_MICROS_PER_IMAGE,
    });
  });

  it("holds a token-billed Model the same way", () => {
    const call = planned("generate", { model: "gpt2", prompt: "a jug" });
    expect(boundFor(call, NO_REFERENCES)).toMatchObject({
      billing: "usage",
      micros: USAGE_HOLD_MICROS_PER_IMAGE,
    });
  });

  it("holds Motif's own Balanced choice for generate", () => {
    const plan = motif
      .plan("generate", { prompt: "a jug", tier: "balanced" }, { dryRun: true })
      ._unsafeUnwrap();
    const bound = boundFor({ ...plan, task: "generate" }, NO_REFERENCES);
    expect(bound.kind).toBe("bounded");
  });

  it("marks a listed price as a ceiling, not usage", () => {
    const call = planned("generate", {
      model: "grok-image-2",
      prompt: "a jug",
    });
    expect(boundFor(call, NO_REFERENCES)).toMatchObject({ billing: "listed" });
  });

  it("refuses a Model billed per compute second, even at a listed $0", () => {
    const call = planned("cutout", { image: SOURCE });
    expect(call.model).toBe("birefnet");
    expect(
      boundFor(call, { references: [], source: { height: 10, width: 10 } }).kind
    ).toBe("unbounded");
  });

  it("holds a per-megapixel generation whose size isn't fixed as usage", () => {
    const bound = boundFor(
      {
        body: { prompt: "a jug" },
        model: "flux2-pro",
        provider: "fal",
        task: "generate",
      },
      NO_REFERENCES
    );
    expect(bound).toMatchObject({
      billing: "usage",
      micros: USAGE_HOLD_MICROS_PER_IMAGE,
    });
  });

  it("holds a per-megapixel generation from its fixed size and its References", () => {
    const call = planned("generate", {
      aspect: "1:1",
      model: "flux2-pro",
      prompt: "a jug",
      references: [SOURCE],
    });
    const plan = motif
      .plan(
        "generate",
        {
          aspect: "1:1",
          model: "flux2-pro",
          prompt: "a jug",
          references: [SOURCE],
        },
        { dryRun: true }
      )
      ._unsafeUnwrap();
    const held = heldMicros(call, {
      references: [{ height: 2000, width: 2000 }],
    });
    expect(held).toBeGreaterThanOrEqual(
      Math.ceil((plan.cost.usd ?? 0) * 1_000_000)
    );
  });

  it("refuses any provider other than fal", () => {
    expect(
      boundFor(
        { body: {}, model: "seedream5", provider: "openai", task: "generate" },
        NO_REFERENCES
      ).kind
    ).toBe("unbounded");
  });

  it("refuses a Task that isn't in the App yet, whatever it costs", () => {
    const call = planned("restore", { image: SOURCE });
    expect(
      boundFor(call, { references: [], source: { height: 10, width: 10 } }).kind
    ).toBe("unbounded");
  });

  it("refuses an unlisted Model", () => {
    expect(
      boundFor(
        { body: {}, model: "made-up", provider: "fal", task: "erase" },
        NO_REFERENCES
      ).kind
    ).toBe("unbounded");
  });
});
