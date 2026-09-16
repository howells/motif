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
    const source =
      task === "cutout" || task === "upscale" ? "image" : undefined;
    expect(resolveTask(task, { source, tier }, fal).ok).toBeTruthy();
  });
});
