import { describe, expect, it } from "vitest";

import {
  ASPECT_RATIOS,
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  enrichPrompt,
  GENERATION_MODELS,
  getLook,
  LOOKS,
  validateCreativeDirection,
} from "../src/index";

const LIVED_IN_CLAUSE =
  "Interior photograph shot square-on at eye level on a 35mm lens, warm off-white plaster, wide oak floorboards, linen, brass and a little pattern, light, bright and layered, collected rather than styled, slightly imperfect and lived-in rather than showroom-perfect, photographic realism. No text, no logos, no people";
const OVERCAST_CLAUSE =
  "overcast afternoon with rain on a tall window, soft even grey light";

/** Upper-case the first letter, as the sentence join does. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A flat look paired with a mood, which the SDK must refuse. */
function flatWithMood() {
  return enrichPrompt({
    creative: { look: "plate", mood: "lamplit" },
    prompt: "oak veneer",
  });
}

describe(enrichPrompt, () => {
  it("returns the sanitized base prompt unchanged without creative direction", () => {
    const result = enrichPrompt({
      prompt: "  studio portrait\r\n",
    });

    expect(result).toStrictEqual({
      basePrompt: "studio portrait",
      creative: {
        clauses: [],
        selected: {},
      },
      prompt: "studio portrait",
    });
  });

  it("joins the base prompt, look and mood as sentences, look first", () => {
    const result = enrichPrompt({
      creative: {
        mood: "overcast",
        look: "lived-in",
      },
      prompt: "a green kitchen",
    });

    expect(result).toStrictEqual({
      basePrompt: "a green kitchen",
      creative: {
        clauses: [LIVED_IN_CLAUSE, OVERCAST_CLAUSE],
        selected: {
          look: "lived-in",
          mood: "overcast",
        },
      },
      prompt: `A green kitchen. ${LIVED_IN_CLAUSE}. Overcast afternoon with rain on a tall window, soft even grey light.`,
    });
  });

  it("does not double a period the base prompt already ends with", () => {
    const result = enrichPrompt({
      creative: { mood: "dawn" },
      prompt: "a quiet hallway.",
    });

    expect(result.prompt).toBe(
      "A quiet hallway. Early morning light through tall glazing, cool and clear."
    );
  });

  it("throws a structured error for unknown creative option ids", () => {
    expect(() =>
      enrichPrompt({
        creative: {
          look: "cinematic",
        },
        prompt: "studio portrait",
      })
    ).toThrow(
      expect.objectContaining({
        availableIds: CREATIVE_TAXONOMY.look.map((option) => option.id),
        code: "INVALID_OPTION",
        field: "look",
        value: "cinematic",
      })
    );
  });

  it("refuses a mood on a flat look with a structured mood error", () => {
    const moodLooks = LOOKS.filter((look) => look.acceptsMood).map(
      (look) => look.id
    );

    expect(flatWithMood).toThrow(
      expect.objectContaining({
        availableIds: moodLooks,
        code: "INVALID_OPTION",
        field: "mood",
        value: "lamplit",
      })
    );
    expect(flatWithMood).toThrow(/plate look is flat/);
    expect(() =>
      validateCreativeDirection({ look: "object", mood: "window" })
    ).toThrow(expect.objectContaining({ field: "mood" }));
  });

  it("accepts a mood on a look that takes one, and a mood on its own", () => {
    expect(
      enrichPrompt({
        creative: { look: "editorial", mood: "lamplit" },
        prompt: "a reading chair",
      }).creative.selected
    ).toStrictEqual({ look: "editorial", mood: "lamplit" });
    expect(
      validateCreativeDirection({ mood: "nocturne" }).selected
    ).toStrictEqual({
      mood: "nocturne",
    });
  });

  it("enriches every look and mood id", () => {
    for (const field of CREATIVE_FIELDS) {
      for (const option of CREATIVE_TAXONOMY[field]) {
        const result = enrichPrompt({
          creative: { [field]: option.id },
          prompt: "a room",
        });

        expect(result.creative.selected).toStrictEqual({ [field]: option.id });
        expect(result.prompt).toBe(`A room. ${capitalise(option.clause)}.`);
      }
    }
  });
});

describe("house looks", () => {
  it("ships twelve looks and six moods with unique ids", () => {
    expect(CREATIVE_FIELDS).toStrictEqual(["look", "mood"]);
    expect(CREATIVE_TAXONOMY.look).toHaveLength(12);
    expect(CREATIVE_TAXONOMY.mood).toHaveLength(6);
    for (const field of CREATIVE_FIELDS) {
      const ids = CREATIVE_TAXONOMY[field].map((option) => option.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("defaults every look to a real generation model and aspect ratio", () => {
    for (const look of LOOKS) {
      expect(GENERATION_MODELS).toContain(look.model);
      expect(ASPECT_RATIOS).toContain(look.aspect);
    }
  });

  it("keeps em dashes out of every option string", () => {
    for (const field of CREATIVE_FIELDS) {
      for (const option of CREATIVE_TAXONOMY[field]) {
        expect(JSON.stringify(option)).not.toContain("\u2014");
      }
    }
  });

  it("marks exactly the five flat looks as refusing a mood", () => {
    expect(
      LOOKS.filter((look) => !look.acceptsMood).map((look) => look.id)
    ).toStrictEqual(["plate", "engraved", "ephemera", "canvas", "object"]);
  });

  it("only negates text, logos and people in look and mood texts", () => {
    const allowed = new Set(["text", "logos", "people"]);
    for (const field of CREATIVE_FIELDS) {
      for (const option of CREATIVE_TAXONOMY[field]) {
        for (const match of option.clause.matchAll(/\bno\s+([a-z-]+)/gi)) {
          expect(
            allowed.has(String(match[1]).toLowerCase()),
            `${option.id} negates "${match[0]}"`
          ).toBeTruthy();
        }
      }
    }
  });

  it("marks only the drawing look as experimental", () => {
    expect(
      LOOKS.filter((look) => look.experimental === true).map((look) => look.id)
    ).toStrictEqual(["drawing"]);
  });

  it("defaults editorial and object to flux2-pro", () => {
    expect(getLook("editorial")?.model).toBe("flux2-pro");
    expect(getLook("object")?.model).toBe("flux2-pro");
    expect(getLook("drawing")?.model).toBe("gpt2");
    expect(getLook("engraved")?.model).toBe("gpt2");
  });

  it("looks up a look by id", () => {
    expect(getLook("ephemera")).toMatchObject({
      aspect: "2:3",
      model: "ideogram4",
    });
    expect(getLook("not-a-look")).toBeUndefined();
  });
});
