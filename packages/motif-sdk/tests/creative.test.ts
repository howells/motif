import { describe, expect, it } from "vitest";

import {
  ASPECT_RATIOS,
  CREATIVE_FIELDS,
  CREATIVE_TAXONOMY,
  enrichPrompt,
  getLook,
  LOOKS,
  validateCreativeDirection,
} from "../src/index";
import { GENERATION_MODELS } from "../src/models";

/** The clause the taxonomy holds for an option id. */
function clauseOf(field: "look" | "mood", id: string): string {
  const option = CREATIVE_TAXONOMY[field].find((entry) => entry.id === id);
  if (option === undefined) {
    throw new Error(`no ${field} option ${id}`);
  }
  return option.clause;
}

const INTERIOR_CLAUSE = clauseOf("look", "interior");
const OVERCAST_CLAUSE = clauseOf("mood", "overcast");

/** Upper-case the first letter, as the sentence join does. */
function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A flat look paired with a mood, which the SDK must refuse. */
function flatWithMood() {
  return enrichPrompt({
    creative: { look: "surface", mood: "lamplit" },
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
        look: "interior",
      },
      prompt: "a green kitchen",
    });

    expect(result).toStrictEqual({
      basePrompt: "a green kitchen",
      creative: {
        clauses: [INTERIOR_CLAUSE, OVERCAST_CLAUSE],
        selected: {
          look: "interior",
          mood: "overcast",
        },
      },
      prompt: `A green kitchen. ${INTERIOR_CLAUSE}. ${capitalise(OVERCAST_CLAUSE)}.`,
    });
  });

  it("does not double a period the base prompt already ends with", () => {
    const result = enrichPrompt({
      creative: { mood: "dawn" },
      prompt: "a quiet hallway.",
    });

    expect(result.prompt).toBe(
      `A quiet hallway. ${capitalise(clauseOf("mood", "dawn"))}.`
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
  it("gives every look and mood a unique id", () => {
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

  it("looks up a look by id", () => {
    expect(getLook("abstract")?.id).toBe("abstract");
    expect(getLook("not-a-look")).toBeUndefined();
  });
});
