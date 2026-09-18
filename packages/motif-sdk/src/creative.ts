import type { AspectRatio } from "./types";

// oxlint-disable-next-line no-control-regex -- intentionally matches control characters for prompt sanitization
const CONTROL_CHAR_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const TRAILING_PERIODS_REGEX = /\.+$/;

/**
 * Creative direction fields applied to prompts in Motif's canonical order.
 *
 * A look sets the overall register of the image; a mood sets its light. The
 * order matters because clauses are appended look first, then mood, for
 * stable dry runs, tests, and history.
 */
export type CreativeField = "look" | "mood";

/**
 * Selected creative option ids keyed by direction field.
 *
 * Values must match option ids from `CREATIVE_TAXONOMY`; unknown ids throw a
 * `CreativeOptionError` before any fal request body is built.
 */
export type CreativeDirection = Partial<Record<CreativeField, string>>;

/** A single selectable creative direction option exposed to CLI and MCP schemas. */
export interface CreativeOption {
  /** Prompt sentence appended when this option is selected. */
  clause: string;
  /** Human-facing explanation used in schema metadata and generated docs. */
  description: string;
  /** Stable machine id accepted by `CreativeDirection`. */
  id: string;
  /** Short display label for UIs and schema enum descriptions. */
  label: string;
}

/**
 * A house look: a creative option that also carries the aspect ratio and
 * model it was tuned for. Callers apply these only when the user named none.
 */
export interface LookOption extends CreativeOption {
  /**
   * Whether a mood may be combined with this look. Flat looks (surfaces,
   * paintings, illustrations, studio objects) carry their own light and
   * refuse one.
   */
  acceptsMood: boolean;
  /** Default aspect ratio, e.g. `"3:2"`. */
  aspect: AspectRatio;
  /**
   * Marks a look still being tuned. It works, but its text and defaults may
   * change more than the others.
   */
  experimental?: boolean;
  /** Default generation Model id, e.g. `"flux2-pro"`. */
  model: string;
}

/** Structured details returned when a creative direction id is not recognized. */
export interface CreativeOptionErrorDetails {
  availableIds: string[];
  code: "INVALID_OPTION";
  field: CreativeField;
  value: string;
}

/**
 * Error thrown when prompt enrichment receives an unknown creative option id.
 *
 * The extra fields make CLI and agent callers able to show field-specific
 * recovery hints without parsing the error message.
 */
export class CreativeOptionError
  extends Error
  implements CreativeOptionErrorDetails
{
  readonly availableIds: string[];
  readonly code = "INVALID_OPTION";
  readonly field: CreativeField;
  readonly value: string;

  constructor(
    details: Omit<CreativeOptionErrorDetails, "code">,
    message = `Unknown creative ${details.field}: ${details.value}. Available: ${details.availableIds.join(", ")}`
  ) {
    super(message);
    this.name = "CreativeOptionError";
    this.availableIds = details.availableIds;
    this.field = details.field;
    this.value = details.value;
  }
}

/** Canonical creative field order used for prompt enrichment and schema output. */
export const CREATIVE_FIELDS = [
  "look",
  "mood",
] as const satisfies readonly CreativeField[];

/**
 * Built-in creative direction catalogue: nine house looks and six light moods.
 *
 * Each option carries the exact prompt sentence appended when it is selected.
 * Looks also carry the aspect ratio and model they were tuned for. The five
 * photographic looks come first, then the four flat ones.
 */
export const CREATIVE_TAXONOMY = {
  look: [
    {
      acceptsMood: true,
      aspect: "1:1",
      clause:
        "Editorial photograph in the register of Atelier Ellis, Aman hotels, Kinfolk magazine and Aesop, pigment-rich mineral colour on named matte surfaces, quiet composition with generous negative space, shallow depth of field, shot on film with fine grain, restrained and materially rich. No text, no logos, no people",
      description:
        "Quiet, materially rich editorial photography for brand and mood imagery.",
      id: "editorial",
      label: "Quiet editorial",
      model: "flux2-pro",
    },
    {
      acceptsMood: true,
      aspect: "1:1",
      clause:
        "Editorial still life in the register of Aesop and Kinfolk, on a warm bone plaster ground, chalky unglazed surfaces in muted mineral colour, a long soft shadow, generous empty space, shot on film with fine grain, restrained and materially rich. No text, no logos, no people",
      description:
        "Objects and products on a plaster ground, for product and editorial still life.",
      id: "still-life",
      label: "Editorial still life",
      model: "flux2-pro",
    },
    {
      acceptsMood: true,
      aspect: "3:2",
      clause:
        "Interior photograph in the register of House & Garden and Kinfolk, shot square-on at eye level on a 35mm lens, warm off-white plaster, wide oak floorboards, linen, brass and a little pattern, light, bright and layered, collected rather than styled, lived-in rather than showroom-perfect, soft natural daylight, shot on film with fine grain. No text, no logos, no people",
      description:
        "Bright, collected rooms that feel lived in, for interior scenes.",
      id: "interior",
      label: "Interior",
      model: "flux2-pro",
    },
    {
      acceptsMood: true,
      aspect: "4:5",
      clause:
        "Architectural photograph in the register of House & Garden and Kinfolk, a considered house seen from outside at editorial distance with its garden and setting, pale render, stone or timber meeting precise detailing, clipped planting, soft warm daylight and long shadow, generous negative space, immaculate and calm, shot on film with fine grain. No text, no logos, no people",
      description:
        "Buildings and their settings from outside, for architecture, property and place.",
      id: "architectural",
      label: "Architectural exterior",
      model: "banana",
    },
    {
      acceptsMood: true,
      aspect: "1:1",
      clause:
        "Editorial documentary portrait in the register of Kinfolk, muted warm palette, waist-up and unposed against a plain plaster or linen ground, plain clothing with no logos, soft natural light, shot on film with fine grain. No text",
      description:
        "Natural, unposed documentary portraits of people. Pair with a mood for the light.",
      id: "portrait",
      label: "Documentary portrait",
      model: "seedream45",
    },
    {
      acceptsMood: false,
      aspect: "1:1",
      clause:
        "A single matte object centred with generous empty space, soft diffused studio light, minimal and quiet in the register of Aesop, one committed muted mineral colour on a plain ground. No text, no logos, no people",
      description:
        "One object in one colour on a clean ground, for icons and simple product shots.",
      id: "object",
      label: "Studio object",
      model: "flux2-pro",
    },
    {
      acceptsMood: false,
      aspect: "1:1",
      clause:
        "Straight-on orthographic photograph of the surface filling the entire frame edge to edge, even shadowless studio light, crisp macro texture, colour-accurate and quietly material. No text, no logos",
      description:
        "Flat, edge-to-edge surface photographs, for textures, backgrounds and material swatches.",
      id: "surface",
      label: "Flat surface",
      model: "flux2-pro",
    },
    {
      acceptsMood: false,
      aspect: "3:2",
      clause:
        "Painted abstraction filling the frame edge to edge, mineral pigment and chalk gesso on coarse natural linen, two or three confident gestures, warm ivory, oatmeal, putty and soft charcoal, flat diffuse reproduction light. No text",
      description:
        "Painted abstraction edge to edge, for wall art, heroes and calm backgrounds.",
      id: "abstract",
      label: "Painted abstract",
      model: "banana",
    },
    {
      acceptsMood: false,
      aspect: "1:1",
      clause:
        "Stylised editorial illustration in the register of Kinfolk, colour laid as flat planes in a warm muted palette of ivory, putty, sage and charcoal, fine hand-drawn line with a gentle gouache wash, generous empty space, clearly a drawing rather than a photograph. No text, no logos",
      description:
        "Line and gouache illustration of any subject, for drawn editorial imagery.",
      experimental: true,
      id: "illustration",
      label: "Editorial illustration",
      model: "gpt2",
    },
  ],
  mood: [
    {
      clause:
        "soft natural daylight from a window out of frame, gentle falloff into the corners, low contrast, even diffused light with soft, held highlights",
      description: "Soft, even daylight from a window. The safe default.",
      id: "window",
      label: "Window light",
    },
    {
      clause: "early morning light through tall glazing, cool and clear",
      description: "Cool, clear early morning light.",
      id: "dawn",
      label: "Dawn",
    },
    {
      clause:
        "low raking daylight from the left, long soft shadows that reveal texture",
      description: "Low side light that brings out surface texture.",
      id: "raking",
      label: "Raking light",
    },
    {
      clause:
        "overcast afternoon with rain on a tall window, soft even grey light",
      description: "Soft grey light on a rainy afternoon.",
      id: "overcast",
      label: "Overcast",
    },
    {
      clause:
        "evening, warm practical lamps around 2400K, candles and a lit fire, cosy and warm, never gloomy",
      description: "Warm evening light from lamps, candles and a fire.",
      id: "lamplit",
      label: "Lamplit evening",
    },
    {
      clause: "night, one warm low practical light, deep shadow, candlelit",
      description: "Dark night scene lit by one warm low light.",
      id: "nocturne",
      label: "Nocturne",
    },
  ],
} as const satisfies {
  look: readonly LookOption[];
  mood: readonly CreativeOption[];
};

/** Every house look, in catalogue order. */
export const LOOKS: readonly LookOption[] = CREATIVE_TAXONOMY.look;

/** Stable id of a house look, e.g. `"interior"`. */
export type LookId = (typeof CREATIVE_TAXONOMY.look)[number]["id"];

/** Stable id of a light mood, e.g. `"overcast"`. */
export type MoodId = (typeof CREATIVE_TAXONOMY.mood)[number]["id"];

/**
 * Look up a house look by id.
 *
 * Returns `undefined` for unknown ids; `enrichPrompt` is the validating path
 * and throws `CreativeOptionError` for the same input.
 */
export function getLook(id: string): LookOption | undefined {
  return LOOKS.find((look) => look.id === id);
}

/** Result of applying creative direction to a base prompt. */
export interface CreativePromptResult {
  /** Sanitized user prompt before Motif adds creative clauses. */
  basePrompt: string;
  creative: {
    /** Clauses appended to the prompt, de-duplicated in canonical field order. */
    clauses: string[];
    /** Validated option ids that were applied. */
    selected: CreativeDirection;
  };
  /** Final prompt sent to fal after creative enrichment. */
  prompt: string;
}

/** Input for Motif's prompt enrichment step. */
export interface EnrichPromptOptions {
  /** Optional selected creative option ids. */
  creative?: CreativeDirection;
  /** User-authored prompt before Motif normalization and enrichment. */
  prompt: string;
}

/**
 * Remove control characters and surrounding whitespace from a prompt.
 *
 * Newline style is normalized to `\n`; other text content is left unchanged.
 */
export function sanitizePrompt(prompt: string): string {
  return prompt.replace(CONTROL_CHAR_REGEX, "").replaceAll("\r\n", "\n").trim();
}

/**
 * Join prompt parts as sentences, `"A. B. C."`: each part is trimmed, loses
 * any trailing period and gets a capital first letter, and no period doubles.
 */
function joinSentences(parts: readonly string[]): string {
  const sentences = parts.map((part) => {
    const sentence = part.trim().replace(TRAILING_PERIODS_REGEX, "");
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  });
  return `${sentences.join(". ")}.`;
}

/**
 * Validate a creative direction and return its clauses in canonical order.
 *
 * Throws `CreativeOptionError` for an unknown id, and for a mood paired with a
 * look whose `acceptsMood` is false; that error is on field `mood` and its
 * `availableIds` lists the looks that do accept a mood. A mood with no look is
 * valid. Empty-string ids are treated as unset.
 */
export function validateCreativeDirection(
  creative: CreativeDirection | undefined
): CreativePromptResult["creative"] {
  const clauses: string[] = [];
  const selected: CreativeDirection = {};

  for (const field of CREATIVE_FIELDS) {
    const optionId = creative?.[field];
    if (optionId === undefined || optionId === "") {
      continue;
    }

    const fieldOptions: readonly CreativeOption[] = CREATIVE_TAXONOMY[field];
    const option = fieldOptions.find((candidate) => candidate.id === optionId);
    if (!option) {
      throw new CreativeOptionError({
        availableIds: fieldOptions.map((candidate) => candidate.id),
        field,
        value: optionId,
      });
    }

    selected[field] = option.id;
    if (!clauses.includes(option.clause)) {
      clauses.push(option.clause);
    }
  }

  const look = selected.look === undefined ? undefined : getLook(selected.look);
  if (look && !look.acceptsMood && selected.mood !== undefined) {
    const moodLooks = LOOKS.filter((candidate) => candidate.acceptsMood).map(
      (candidate) => candidate.id
    );
    throw new CreativeOptionError(
      { availableIds: moodLooks, field: "mood", value: selected.mood },
      `The ${look.id} look is flat and takes no mood, so mood ${selected.mood} cannot be applied. Drop the mood, or use a look that accepts one: ${moodLooks.join(", ")}`
    );
  }

  return { clauses, selected };
}

/**
 * Append selected creative direction clauses to a prompt as sentences.
 *
 * Options are validated by `validateCreativeDirection` and applied in
 * `CREATIVE_FIELDS` order (look, then mood). The base prompt comes first; each
 * part loses any trailing period and gets a capital first letter, then they
 * are joined with `". "` and closed with a period. With no clauses the sanitized prompt is returned unchanged.
 */
export function enrichPrompt(
  options: EnrichPromptOptions
): CreativePromptResult {
  const basePrompt = sanitizePrompt(options.prompt);
  const { clauses, selected } = validateCreativeDirection(options.creative);

  return {
    basePrompt,
    creative: {
      clauses,
      selected,
    },
    prompt: clauses.length
      ? joinSentences([basePrompt, ...clauses].filter((part) => part !== ""))
      : basePrompt,
  };
}
