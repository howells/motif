import type { GenerationModelName } from "./models";
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
   * prints, paintings, studio objects) carry their own light and refuse one.
   */
  acceptsMood: boolean;
  /** Default aspect ratio, e.g. `"3:2"`. */
  aspect: AspectRatio;
  /**
   * Marks a look still being tuned. It works, but its text and defaults may
   * change more than the others.
   */
  experimental?: boolean;
  /** Default generation model alias, e.g. `"flux2-pro"`. */
  model: GenerationModelName;
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
 * Built-in creative direction catalogue: twelve house looks and six light moods.
 *
 * Each option carries the exact prompt sentence appended when it is selected.
 * Looks also carry the aspect ratio and model they were tuned for.
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
        "Editorial still life on a warm bone plaster ground, chalky unglazed surfaces, a long soft shadow, generous empty space, shot on film with fine grain. No text, no logos, no people",
      description:
        "Objects and material samples on a plaster ground, for product and swatch shots.",
      id: "still-life",
      label: "Material still life",
      model: "flux2-pro",
    },
    {
      acceptsMood: true,
      aspect: "3:2",
      clause:
        "Interior photograph shot square-on at eye level on a 35mm lens, warm off-white plaster, wide oak floorboards, linen, brass and a little pattern, light, bright and layered, collected rather than styled, slightly imperfect and lived-in rather than showroom-perfect, photographic realism. No text, no logos, no people",
      description:
        "Bright, collected rooms that feel lived in, for interior scenes.",
      id: "lived-in",
      label: "Lived-in interior",
      model: "flux2-pro",
    },
    {
      acceptsMood: true,
      aspect: "4:5",
      clause:
        "Architectural editorial photograph at full room scale, honest materials meeting precise detailing, one hero element genuinely installed, plausible light and shadow, generous negative space, empty of people. No text, no logos",
      description:
        "Whole rooms with one product installed, for showing a material at scale.",
      id: "architectural",
      label: "Architectural scale",
      model: "banana",
    },
    {
      acceptsMood: true,
      aspect: "4:3",
      clause:
        "Amateur phone photo of a real home taken by the homeowner, slightly wonky framing, unstyled domestic photography, ordinary exposure. No text, no people",
      description:
        "Unstyled phone snapshots of real homes, for believable before and after shots.",
      id: "homeowner",
      label: "Homeowner snapshot",
      model: "seedream45",
    },
    {
      acceptsMood: true,
      aspect: "1:1",
      clause:
        "Stylised architectural illustration of the room, colour laid as flat planes on walls, joinery and trim, fine hand-drawn line with a gentle gouache wash, clearly a drawing of a design decision rather than a photograph. No text, no people",
      description:
        "Line and gouache room drawings, for showing a colour scheme as a design idea.",
      experimental: true,
      id: "drawing",
      label: "Palette drawing",
      model: "gpt2",
    },
    {
      acceptsMood: false,
      aspect: "1:1",
      clause:
        "Straight-on orthographic photograph of the surface filling the entire frame edge to edge, even shadowless studio light, crisp macro texture, colour-accurate. No text, no logos",
      description:
        "Flat, edge-to-edge surface photographs, for textures and material swatches.",
      id: "plate",
      label: "Flat plate",
      model: "flux2-pro",
    },
    {
      acceptsMood: false,
      aspect: "1:1",
      clause:
        "Fine hand-engraved botanical plate with delicate hatching and dry brush, grey ink only, reaching near-black at its densest, on matte uncoated stock under flat even light, cropped mid-motif and running past all four edges, never simplified or cartoonish. No text",
      description:
        "Grey-ink botanical engravings that run off the edges, for patterns and backgrounds.",
      id: "engraved",
      label: "Engraved grey ink",
      model: "gpt2",
    },
    {
      acceptsMood: false,
      aspect: "2:3",
      clause:
        "Tightly cropped photograph of a single piece of late-1940s American printed matter, flat and square-on in even light, every pixel paper, letterpress and wood type, sun-faded ink, foxing, soft creases and thumbtack holes, era-correct typography, nothing that looks like a digital photo run through a filter",
      description:
        "Aged mid-century printed matter such as posters and cards, where the lettering matters.",
      id: "ephemera",
      label: "Period ephemera",
      model: "ideogram4",
    },
    {
      acceptsMood: false,
      aspect: "3:4",
      clause:
        "Physical mineral pigment and chalk gesso on coarse natural linen, two or three confident gestures, warm ivory, oatmeal, putty and soft charcoal, flat diffuse museum reproduction lighting, shown unframed. No text",
      description:
        "Loose abstract paintings on linen, for wall art and calm backgrounds.",
      id: "canvas",
      label: "Linen abstract",
      model: "banana",
    },
    {
      acceptsMood: true,
      aspect: "1:1",
      clause:
        "Editorial documentary portrait, muted warm palette, waist-up, unposed, plain clothing with no logos. No text",
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
        "A single matte object centred with generous empty space, soft diffused studio light, minimal and quiet, one committed colour. No text, no logos, no people",
      description:
        "One object in one colour on a clean ground, for icons and simple product shots.",
      id: "object",
      label: "Studio object",
      model: "flux2-pro",
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

/** Stable id of a house look, e.g. `"lived-in"`. */
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
      ? joinSentences([basePrompt, ...clauses])
      : basePrompt,
  };
}
