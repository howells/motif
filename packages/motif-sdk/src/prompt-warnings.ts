/**
 * Advisory checks on a user-written prompt.
 *
 * These run on the caller's own prompt only, never on look or mood text, and
 * never block a request. They flag phrasings that image models tend to
 * misread.
 */

/** Stable id of a prompt warning rule. */
export type PromptWarningRule =
  | "edit-has-verb"
  | "negated-object"
  | "text-bearing-object";

/** One advisory finding about a prompt. */
export interface PromptWarning {
  /** The text in the prompt that triggered the rule. */
  match: string;
  /** Plain-English advice for the caller. */
  message: string;
  rule: PromptWarningRule;
}

const EDIT_VERB_REGEX = /^\s*(remove|erase|extend|outpaint)\b/i;

/** The CLI verb that does each edit directly, keyed by the prompt's first word. */
const EDIT_VERBS: Record<string, string> = {
  erase: 'motif erase "<thing>" <image> takes one object out and fills the gap',
  extend:
    "motif reframe --<preset> <image> extends the canvas to a new aspect ratio",
  outpaint:
    "motif reframe --<preset> <image> extends the canvas to a new aspect ratio",
  remove:
    'motif erase "<thing>" <image> takes one object out and fills the gap',
};

const NEGATED_OBJECT_REGEX = /\bno\s+(?:a |an |the )?([a-z-]+)/gi;
const TEXT_NEGATION_REGEX = /\bno\s+(?:text|words)\b/i;
const TEXT_BEARING_OBJECT_REGEX =
  /\b(sign|label|poster|book|menu|newspaper|packaging|card|ticket|magazine|screen)s?\b/i;

/** Negations models handle well enough that they are not worth a warning. */
const ALLOWED_NEGATIONS = new Set([
  "faces",
  "lettering",
  "logo",
  "logos",
  "people",
  "person",
  "text",
  "watermark",
  "watermarks",
  "words",
]);

/**
 * Check a user prompt for phrasings that tend to backfire.
 *
 * - `negated-object`: "no <object>" for anything other than text, logos,
 *   people, faces, watermarks, words or lettering. Naming an object tends to
 *   draw it into the picture.
 * - `text-bearing-object`: the prompt asks for no text or no words but also
 *   names something that usually carries text, such as a sign or a poster.
 * - `edit-has-verb`: an edit (`context.editing`) whose prompt starts with
 *   remove, erase, extend or outpaint, jobs the CLI has a verb for.
 *
 * Pass the caller's own prompt, not an enriched one, and `editing: true` when
 * the request carries reference images to edit.
 */
export function promptWarnings(
  prompt: string,
  context: { editing?: boolean } = {}
): PromptWarning[] {
  const warnings: PromptWarning[] = [];

  const editVerb =
    context.editing === true ? EDIT_VERB_REGEX.exec(prompt) : null;
  if (editVerb !== null) {
    const word = editVerb[1]?.toLowerCase() ?? "";
    warnings.push({
      match: editVerb[0].trim(),
      message: `An edit regenerates the whole image from the reference. ${EDIT_VERBS[word]}, leaving the rest of the image as it was.`,
      rule: "edit-has-verb",
    });
  }

  for (const match of prompt.matchAll(NEGATED_OBJECT_REGEX)) {
    const word = match[1]?.toLowerCase();
    if (word !== undefined && !ALLOWED_NEGATIONS.has(word)) {
      warnings.push({
        match: match[0],
        message: `"${match[0]}" names the thing you don't want, and negating an object tends to draw it into the picture. Describe what is present instead.`,
        rule: "negated-object",
      });
    }
  }

  const textBearing = TEXT_BEARING_OBJECT_REGEX.exec(prompt);
  if (textBearing && TEXT_NEGATION_REGEX.test(prompt)) {
    warnings.push({
      match: textBearing[0],
      message: `The prompt asks for no text but includes "${textBearing[0]}", and the model is likely to render text on it anyway.`,
      rule: "text-bearing-object",
    });
  }

  return warnings;
}
