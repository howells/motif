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
  return createMotif({ falKey: "test", fetch: noNetwork, openAiKey: "" });
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
    ).toThrow("MAI Image 2.5 Pro aspect must be one of");
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
    ).toThrow("Grok Imagine Image resolution must be one of 1K, 2K");
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
  it("projects a MAI Image 2.5 Pro edit at $0.27", () => {
    const plan = planned("vary", { image: IMAGE, model: "mai-image-2.5-pro" });

    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.27 });
  });

  it("adds $0.01 per input image to a Grok Imagine Image 2.0 edit", () => {
    const plan = planned("vary", {
      image: IMAGE,
      model: "grok-image-2",
      references: [REFERENCE],
    });

    expect(plan.cost.usd).toBeCloseTo(0.08 + 0.02);
  });

  it("projects Nano Banana 2 Lite at about $0.048", () => {
    const plan = planned("generate", {
      model: "banana2-lite",
      prompt: "a red chair",
    });

    expect(plan.cost).toStrictEqual({ basis: "projected", usd: 0.048 });
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
