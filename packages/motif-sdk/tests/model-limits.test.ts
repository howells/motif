// What fal's schemas and prices bound: the aspect ratios and resolutions an
// endpoint's enum takes, Topaz's per-started-24MP billing, edit surcharges and
// Kling's duration range. A value outside an enum is a request fal rejects, so
// each is refused or ranked past before anything is sent.

import { describe, expect, it } from "vitest";

import { buildGenerateBody } from "../src/generate";
import { resolveTask } from "../src/resolve";
import type { TaskEnvironment } from "../src/resolve";
import { createMotif } from "../src/task-client";
import type { FalFetch, TaskInput } from "../src/task-client";
import type { TaskId } from "../src/tasks";

const IMAGE = "https://example.com/source.png";
const REFERENCE = "https://example.com/reference.png";
const fal: TaskEnvironment = { keys: ["FAL_KEY"] };

const noNetwork: FalFetch = () => {
  throw new Error("plan must not fetch");
};

function motif() {
  return createMotif({ falKey: "test", fetch: noNetwork });
}

function planned(task: TaskId, input: TaskInput) {
  const result = motif().plan(task, input);
  if (result.isErr()) {
    throw result.error;
  }
  return result.value;
}

function refused(task: TaskId, input: TaskInput) {
  const result = motif().plan(task, input);
  if (result.isOk()) {
    throw new Error(`expected ${task} to be refused`);
  }
  return result.error;
}

function uint32(value: number): number[] {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return [...bytes];
}

/** The PNG signature and IHDR chunk: enough header to carry dimensions. */
function pngDataUrl(width: number, height: number): string {
  const bytes = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...uint32(13),
    ...Buffer.from("IHDR"),
    ...uint32(width),
    ...uint32(height),
    8,
    6,
    0,
    0,
    0,
  ];
  return `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
}

describe("aspect ratios fal's enum takes", () => {
  it("ranks a transparent 21:9 generate past Ideogram V3 Transparent", () => {
    const plan = planned("generate", {
      aspect: "21:9",
      prompt: "a red chair",
      transparent: true,
    });

    expect(plan.model).not.toBe("ideogram3-transparent");
    expect(
      planned("generate", { prompt: "a red chair", transparent: true }).model
    ).toBe("ideogram3-transparent");
  });

  it("refuses a ratio outside the enum on a named Model", () => {
    expect(
      resolveTask(
        "generate",
        { aspect: "21:9", model: "ideogram3-transparent", transparent: true },
        fal
      )
    ).toMatchObject({ blockedBy: "aspect", ok: false });
    expect(() =>
      buildGenerateBody({
        aspect: "5:4",
        model: "mai-image-2.5-pro",
        prompt: "a red chair",
      })
    ).toThrow(/aspect/);
  });
});

describe("resolutions fal's enum takes", () => {
  it("refuses 4K on Grok Imagine Image 2.0", () => {
    expect(
      resolveTask("generate", { model: "grok-image-2", resolution: "4K" }, fal)
    ).toMatchObject({ blockedBy: "resolution", ok: false });
    expect(() =>
      buildGenerateBody({
        model: "grok-image",
        prompt: "a red chair",
        resolution: "0.5K",
      })
    ).toThrow(/resolution/);
  });

  it("ranks a 0.5K generate past Models that can't take it", () => {
    const plan = planned("generate", {
      prompt: "a red chair",
      resolution: "0.5K",
    });

    expect(plan.model).toBe("banana2");
  });
});

describe("Topaz billing per started 24MP", () => {
  it("projects one step for a small source and two past 24MP", () => {
    const small = planned("restore", {
      image: pngDataUrl(1000, 1000),
      mode: "softness",
    });
    expect(small.model).toBe("topaz-sharpen");
    expect(small.cost).toStrictEqual({ basis: "projected", usd: 0.08 });

    const large = planned("restore", {
      image: IMAGE,
      mode: "softness",
      sourceSize: { height: 5000, width: 6000 },
    });
    expect(large.cost.usd).toBeCloseTo(0.16);
  });

  it("projects Topaz Transparent from 16 times the source area", () => {
    const plan = planned("upscale", {
      image: pngDataUrl(2000, 2000),
      transparent: true,
    });

    expect(plan.model).toBe("topaz-transparent");
    // 8000x8000 is 64MP: three started 24MP steps.
    expect(plan.cost.usd).toBeCloseTo(0.24);
  });
});

describe("edit prices", () => {
  it("adds $0.01 per input image to a Grok Imagine Image 2.0 edit", () => {
    const plan = planned("vary", {
      image: IMAGE,
      model: "grok-image-2",
      references: [REFERENCE],
    });

    expect(plan.cost.usd).toBeCloseTo(0.08 + 0.02);
  });

  it("keeps token-billed Nano Banana 2 Lite's total cost unknown", () => {
    const plan = planned("generate", {
      model: "banana2-lite",
      prompt: "a red chair",
    });

    expect(plan.cost).toStrictEqual({ basis: "unknown", usd: null });
  });
});

describe("Kling durations", () => {
  it.each(["kling", "kling-turbo"])(
    "refuses a %s duration outside 3 to 15 seconds",
    (model) => {
      const error = refused("animate", { duration: 20, image: IMAGE, model });

      expect(error.code).toBe("INVALID_OPTION");
      expect(error.details).toMatchObject({ field: "duration", model });
      expect(
        planned("animate", { duration: 15, image: IMAGE, model }).body.duration
      ).toBe("15");
    }
  );
});

function upscaleTask(model: string): TaskId {
  return model === "seedvr-seamless" ? "tile" : "upscale";
}

describe("upscale factors fal's schema takes", () => {
  const RANGES = [
    ["topaz-precision", 4],
    ["topaz-image", 4],
    ["topaz-creative", 4],
    ["topaz-generative", 4],
    ["topaz-video", 4],
    ["seedvr-upscale", 10],
    ["seedvr-seamless", 10],
    ["clarity", 4],
    ["crystal", 200],
  ] as const;
  const source = (model: string): TaskInput =>
    model === "topaz-video"
      ? {
          model,
          sourceVideo: {
            fps: 24,
            frames: 96,
            height: 720,
            seconds: 4,
            width: 1280,
          },
          video: "https://example.com/source.mp4",
        }
      : { image: IMAGE, model };
  const MODES: Record<string, string> = {
    "seedvr-seamless": "upscale",
    "topaz-creative": "creative",
    "topaz-generative": "generative",
  };
  const input = (model: string, extra: Partial<TaskInput>): TaskInput => ({
    ...source(model),
    ...(MODES[model] === undefined ? {} : { mode: MODES[model] }),
    ...extra,
  });

  it.each(RANGES)(
    "%s takes 1 to its ceiling of %i and refuses either side",
    (model, max) => {
      for (const scale of [1, max]) {
        expect(planned(upscaleTask(model), input(model, { scale })).model).toBe(
          model
        );
      }
      for (const scale of [0.5, max + 1]) {
        const error = refused(upscaleTask(model), input(model, { scale }));
        expect(error.message).toContain(`it takes 1 to ${max}`);
        expect(error.details).toMatchObject({
          field: "scale",
          range: { max, min: 1 },
        });
      }
    }
  );

  it.each(RANGES)(
    "%s holds the same range for a factor sent in params",
    (model, max) => {
      const key = model === "crystal" ? "scale_factor" : "upscale_factor";
      expect(
        planned(upscaleTask(model), input(model, { params: { [key]: max } }))
          .model
      ).toBe(model);
      const error = refused(
        upscaleTask(model),
        input(model, { params: { [key]: max + 1 } })
      );
      expect(error.message).toContain(`it takes 1 to ${max}`);
    }
  );

  it("ranks past a Model that cannot do the factor", () => {
    const at = (scale: number, tier: "balanced" | "fast" | "quality") =>
      planned("upscale", { image: IMAGE, scale, tier }).model;
    expect(at(3, "balanced")).toBe("clarity");
    expect(at(8, "balanced")).toBe("seedvr-upscale");
    expect(at(8, "quality")).toBe("seedvr-upscale");
    expect(at(8, "fast")).toBe("crystal");
    expect(at(16, "balanced")).toBe("crystal");
    expect(at(16, "quality")).toBe("crystal");
  });

  it("refuses a factor below 1 and one above every Model's ceiling", () => {
    expect(refused("upscale", { image: IMAGE, scale: 0.5 }).code).toBe(
      "INVALID_OPTION"
    );
    expect(refused("upscale", { image: IMAGE, scale: 201 }).code).toBe(
      "INVALID_OPTION"
    );
  });
});
