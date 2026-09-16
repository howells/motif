// `resolveTask` is the only place a Model is chosen, so these cases pin the observable answer -
// the Model, which rule chose it, and how a caller would unblock a refusal - and never the
// internals that produce it.

import { describe, expect, it } from "vitest";

import { getLook } from "../src/creative";
import { MODELS } from "../src/models";
import type { TaskEnvironment } from "../src/resolve";
import {
  NO_MODEL_AVAILABLE,
  resolveTask,
  tierChangesChoice,
} from "../src/resolve";
import { TASK_IDS, TIERS } from "../src/tasks";

const fal: TaskEnvironment = { keys: ["FAL_KEY"] };
const falAndOpenAi: TaskEnvironment = { keys: ["FAL_KEY", "OPENAI_API_KEY"] };

describe("resolveTask ranking", () => {
  it("takes the first Model of the asked-for Tier", () => {
    expect(resolveTask("generate", { tier: "balanced" }, fal)).toMatchObject({
      chosenBy: "ranking",
      model: "banana",
      ok: true,
      tier: "balanced",
    });
    expect(resolveTask("generate", { tier: "fast" }, fal)).toMatchObject({
      model: "flux2-turbo",
      tier: "fast",
    });
    expect(resolveTask("generate", { tier: "quality" }, fal)).toMatchObject({
      model: "gpt2",
      tier: "quality",
    });
  });

  it("skips a Model whose transparency key is missing", () => {
    expect(
      resolveTask("generate", { tier: "quality", transparent: true }, fal)
    ).toMatchObject({ model: "gpt", ok: true });
    expect(
      resolveTask(
        "generate",
        { tier: "quality", transparent: true },
        falAndOpenAi
      )
    ).toMatchObject({ model: "gpt2", ok: true });
  });

  it("honours the reference count a Model accepts", () => {
    expect(
      resolveTask("generate", { references: 14, tier: "balanced" }, fal)
    ).toMatchObject({ model: "banana", ok: true });
    expect(
      resolveTask("generate", { references: 20, tier: "balanced" }, fal)
    ).toMatchObject({
      blockedBy: "references",
      error: NO_MODEL_AVAILABLE,
      ok: false,
      unblockedBy: ["option"],
    });
  });

  it("chooses a mask-capable Model for a mask request", () => {
    const result = resolveTask(
      "generate",
      { mask: true, tier: "balanced" },
      fal
    );
    expect(result.ok).toBeTruthy();
    if (result.ok) {
      expect(MODELS[result.model]?.supportsMaskImage).toBeTruthy();
    }
  });
});

describe("resolveTask precedence", () => {
  it("lets a Look fix the Model and ignore the Tier", () => {
    expect(
      resolveTask("generate", { look: "editorial", tier: "fast" }, fal)
    ).toMatchObject({
      chosenBy: "look",
      model: getLook("editorial")?.model,
      ok: true,
      tier: "fast",
    });
  });

  it("lets an explicit Model beat a Look and a pin", () => {
    expect(
      resolveTask(
        "generate",
        { look: "editorial", model: "flux-fast" },
        { keys: ["FAL_KEY"], pins: { generate: "recraft" } }
      )
    ).toMatchObject({ chosenBy: "model", model: "flux-fast", ok: true });
  });

  it("takes a pin when nothing more explicit is given", () => {
    expect(
      resolveTask(
        "generate",
        {},
        { keys: ["FAL_KEY"], pins: { generate: "flux-fast" } }
      )
    ).toMatchObject({ chosenBy: "pin", model: "flux-fast", ok: true });
  });
});

describe("resolveTask refusals", () => {
  it("fails an explicit Model that needs a key the environment lacks", () => {
    expect(
      resolveTask("generate", { model: "gpt2", transparent: true }, fal)
    ).toMatchObject({
      blockedBy: "key",
      missingKey: "OPENAI_API_KEY",
      ok: false,
      unblockedBy: ["key"],
    });
  });

  it("fails an explicit Model the Task does not rank", () => {
    const result = resolveTask("generate", { model: "topaz-image" }, fal);
    expect(result).toMatchObject({
      blockedBy: "unknown-model",
      ok: false,
      unblockedBy: ["model"],
    });
    if (!result.ok) {
      expect(result.message).toContain("generate");
    }
  });

  it("fails a pin that cannot do what the request asks", () => {
    expect(
      resolveTask(
        "generate",
        { mask: true },
        { keys: ["FAL_KEY"], pins: { generate: "recraft" } }
      )
    ).toMatchObject({
      blockedBy: "mask",
      ok: false,
      unblockedBy: ["model", "option"],
    });
  });

  it("fails every Task without FAL_KEY", () => {
    expect(resolveTask("generate", {}, { keys: [] })).toMatchObject({
      blockedBy: "key",
      missingKey: "FAL_KEY",
      ok: false,
      unblockedBy: ["key"],
    });
  });

  it("refuses a video Source on an image-only Task", () => {
    expect(resolveTask("generate", { source: "video" }, fal)).toMatchObject({
      blockedBy: "video",
      ok: false,
    });
  });
});

describe("Tier and Source", () => {
  it.each(TIERS)("cuts out video at the %s Tier", (tier) => {
    expect(resolveTask("cutout", { source: "video", tier }, fal)).toMatchObject(
      {
        model: "bria-video-rmbg",
        ok: true,
        tier,
      }
    );
  });

  it("reports whether the Tier changes the choice", () => {
    expect(tierChangesChoice("cutout", { source: "video" }, fal)).toBeFalsy();
    expect(tierChangesChoice("generate", {}, fal)).toBeTruthy();
  });

  it.each(
    TASK_IDS.flatMap((task) => TIERS.map((tier) => [task, tier] as const))
  )("resolves %s at the %s Tier with an empty request", (task, tier) => {
    const source = task === "generate" || task === "vary" ? undefined : "image";
    expect(resolveTask(task, { source, tier }, fal).ok).toBeTruthy();
  });
});

describe("modes and required inputs", () => {
  it("resolves a plain erase to object-removal, and finegrain-eraser at quality", () => {
    expect(resolveTask("erase", { source: "image" }, fal)).toMatchObject({
      model: "object-removal",
      ok: true,
    });
    expect(
      resolveTask("erase", { source: "image", tier: "quality" }, fal)
    ).toMatchObject({ model: "finegrain-eraser", ok: true });
  });

  it("resolves an erase with a mask to object-removal-mask, and bria-eraser at quality", () => {
    expect(resolveTask("erase", { mask: true }, fal)).toMatchObject({
      model: "object-removal-mask",
      ok: true,
    });
    expect(
      resolveTask("erase", { mask: true, tier: "quality" }, fal)
    ).toMatchObject({ model: "bria-eraser", ok: true });
  });

  it("resolves erase mode text to text-removal", () => {
    expect(resolveTask("erase", { mode: "text" }, fal)).toMatchObject({
      model: "text-removal",
      ok: true,
    });
  });

  it("refuses erase mode with unless a mask is given, then resolves to bria-genfill", () => {
    const withoutMask = resolveTask("erase", { mode: "with" }, fal);
    expect(withoutMask).toMatchObject({
      blockedBy: "mask",
      ok: false,
      unblockedBy: ["input"],
    });
    if (!withoutMask.ok) {
      expect(withoutMask.message).toContain("mask input");
    }
    expect(
      resolveTask("erase", { mask: true, mode: "with" }, fal)
    ).toMatchObject({ model: "bria-genfill", ok: true });
  });

  it("refuses an unknown erase mode", () => {
    expect(resolveTask("erase", { mode: "sky" }, fal)).toMatchObject({
      blockedBy: "mode",
      ok: false,
      unblockedBy: ["option"],
    });
  });

  it("refuses an explicit Model that requires a mask the request lacks", () => {
    expect(resolveTask("erase", { model: "bria-eraser" }, fal)).toMatchObject({
      blockedBy: "mask",
      ok: false,
      unblockedBy: ["input"],
    });
  });

  it("refuses an explicit Model given a mode it does not serve", () => {
    expect(
      resolveTask(
        "map",
        { model: "marigold-depth", mode: "pose", source: "image" },
        fal
      )
    ).toMatchObject({
      blockedBy: "unknown-model",
      ok: false,
      unblockedBy: ["model", "option"],
    });
  });

  it("refuses an explicit Model paired with an unknown mode", () => {
    expect(
      resolveTask("erase", { model: "object-removal", mode: "bogus" }, fal)
    ).toMatchObject({ blockedBy: "mode", ok: false });
  });

  it("resolves upscale transparency to topaz-transparent, and video to topaz-video", () => {
    expect(resolveTask("upscale", { transparent: true }, fal)).toMatchObject({
      model: "topaz-transparent",
      ok: true,
    });
    expect(resolveTask("upscale", { source: "video" }, fal)).toMatchObject({
      model: "topaz-video",
      ok: true,
    });
  });

  it("resolves a plain restore to topaz-restore, and mode colour to ddcolor", () => {
    expect(resolveTask("restore", { source: "image" }, fal)).toMatchObject({
      model: "topaz-restore",
      ok: true,
    });
    expect(resolveTask("restore", { mode: "colour" }, fal)).toMatchObject({
      model: "ddcolor",
      ok: true,
    });
  });

  it("resolves map mode edges to pidi at fast and teed at quality", () => {
    expect(
      resolveTask("map", { mode: "edges", tier: "fast" }, fal)
    ).toMatchObject({ model: "pidi", ok: true });
    expect(
      resolveTask("map", { mode: "edges", tier: "quality" }, fal)
    ).toMatchObject({ model: "teed", ok: true });
  });

  it("resolves segment mode rle on video to sam3-video-rle", () => {
    expect(
      resolveTask("segment", { mode: "rle", source: "video" }, fal)
    ).toMatchObject({ model: "sam3-video-rle", ok: true });
  });

  it("says the Tier never changes animate's single Model", () => {
    expect(tierChangesChoice("animate", { source: "image" }, fal)).toBeFalsy();
  });

  it("resolves reframe to bria-expand at fast, and mode margin to flux-outpaint", () => {
    expect(resolveTask("reframe", { tier: "fast" }, fal)).toMatchObject({
      model: "bria-expand",
      ok: true,
    });
    expect(resolveTask("reframe", { mode: "margin" }, fal)).toMatchObject({
      model: "flux-outpaint",
      ok: true,
    });
  });

  it("lets a mode-specific pin fall through to the ranking when it doesn't serve that mode", () => {
    expect(
      resolveTask(
        "map",
        { mode: "pose" },
        { keys: ["FAL_KEY"], pins: { map: "marigold-depth" } }
      )
    ).toMatchObject({ chosenBy: "ranking", model: "dwpose", ok: true });
  });

  it("lets a mode-specific pin fall through to the ranking for the plain job, and win for its own mode", () => {
    const pinned: TaskEnvironment = {
      keys: ["FAL_KEY"],
      pins: { erase: "text-removal" },
    };
    expect(resolveTask("erase", {}, pinned)).toMatchObject({
      chosenBy: "ranking",
      model: "object-removal",
      ok: true,
    });
    expect(resolveTask("erase", { mode: "text" }, pinned)).toMatchObject({
      chosenBy: "pin",
      model: "text-removal",
      ok: true,
    });
  });

  it("ignores a Look on a Task a Look cannot fix", () => {
    expect(resolveTask("erase", { look: "editorial" }, fal)).toMatchObject({
      chosenBy: "ranking",
      model: "object-removal",
      ok: true,
    });
  });
});

describe("fixed Models that do not fit the request", () => {
  it("fails a pin the Task does not know", () => {
    const result = resolveTask(
      "erase",
      { source: "image" },
      { keys: ["FAL_KEY"], pins: { erase: "banana" } }
    );
    expect(result).toMatchObject({ blockedBy: "unknown-model", ok: false });
  });

  it("reports a missing key before a missing input", () => {
    const result = resolveTask("erase", { source: "image" }, { keys: [] });
    expect(result).toMatchObject({
      blockedBy: "key",
      missingKey: "FAL_KEY",
      ok: false,
      unblockedBy: ["key"],
    });
  });

  it("lets a Look whose Model cannot edit fall through on vary", () => {
    const result = resolveTask(
      "vary",
      { look: "ephemera", references: 1 },
      { keys: ["FAL_KEY"] }
    );
    expect(result).toMatchObject({ chosenBy: "ranking", ok: true });
  });
});
