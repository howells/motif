/**
 * Resolving a tool's `outputLabels` into the filename stems `downloadAll`
 * uses. Split from `tool-run.ts`, which is close to the 600-line ceiling.
 *
 * Two sources of names, both declared per output key in the SDK registry: the
 * request that produced the output, and the output itself.
 */

import type { FalToolConfig } from "@howells/motif-sdk";

import type { OutputLabels } from "../utils/image";

const SLUG_SEPARATOR_REGEX = /[^a-z0-9]+/g;
const SLUG_EDGE_REGEX = /^-+|-+$/g;
const SLUG_MAX_LENGTH = 48;

type LabelRule = NonNullable<FalToolConfig["outputLabels"]>[string];
type ItemRule = Extract<LabelRule, { fromItem: unknown }>["fromItem"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A filename stem built from untrusted text. These names arrive inside the
 * tool response, written by the model, and land as a file inside an already
 * validated output directory — so the slug itself has to be inert. Lowercase,
 * every run of anything outside [a-z0-9] collapsed to a single hyphen, hyphens
 * trimmed off both ends, then capped. That leaves no way for a name to carry a
 * path separator, `..`, a leading dot, whitespace, or a control character.
 *
 * Returns undefined when the value is not a string or nothing survives, and
 * the caller then keeps positional naming rather than failing.
 */
function slugify(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const slug = value
    .toLowerCase()
    .replace(SLUG_SEPARATOR_REGEX, "-")
    .replace(SLUG_EDGE_REGEX, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(SLUG_EDGE_REGEX, "");
  return slug.length === 0 ? undefined : slug;
}

/**
 * Ordering prefixes for every item, or undefined to prefix none of them. All
 * or nothing: a stack where only some files sort by z-index reads as if the
 * unprefixed ones came first.
 */
function orderPrefixes(
  items: unknown[],
  field: string | undefined
): string[] | undefined {
  if (field === undefined) {
    return undefined;
  }
  const prefixes: string[] = [];
  for (const item of items) {
    const value = isRecord(item) ? item[field] : undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return undefined;
    }
    prefixes.push(String(value));
  }
  return prefixes;
}

/** Make each stem unique, so two layers both named "Bottle" cannot overwrite each other. */
function deduplicate(stems: string[]): string[] {
  const used = new Set<string>();
  return stems.map((stem) => {
    let candidate = stem;
    let attempt = 2;
    while (used.has(candidate)) {
      candidate = `${stem}-${attempt}`;
      attempt += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

/**
 * Stems read off the output array's own elements. Undefined when any element
 * fails to name itself — the whole key then falls back to positional naming,
 * because half a named stack is harder to read than none of it.
 */
function itemLabels(value: unknown, rule: ItemRule): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const names: string[] = [];
  for (const item of value) {
    const slug = slugify(isRecord(item) ? item[rule.nameField] : undefined);
    if (slug === undefined) {
      return undefined;
    }
    names.push(slug);
  }
  const prefixes = orderPrefixes(value, rule.orderField);
  return deduplicate(
    names.map((name, index) =>
      prefixes === undefined ? name : `${prefixes[index]}-${name}`
    )
  );
}

/** The value at `key` in the request body, when it is an array of strings. */
function stringArrayOption(
  body: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = body[key];
  return Array.isArray(value) && value.every((it) => typeof it === "string")
    ? value
    : undefined;
}

function labelsForKey(
  key: string,
  rule: LabelRule,
  body: Record<string, unknown>,
  result: Record<string, unknown> | undefined
): readonly string[] | undefined {
  if ("fromItem" in rule) {
    return itemLabels(result?.[key], rule.fromItem);
  }
  const requested =
    rule.fromOption === undefined
      ? undefined
      : stringArrayOption(body, rule.fromOption);
  return requested ?? rule.fallback;
}

/**
 * Resolve each output key's position names against the request that produced
 * them and the result they came back in. The request wins over the schema
 * default: a caller who reorders or subsets the driving option (patina's
 * `maps`) would otherwise get the default's names applied to a different
 * order, which is silently wrong rather than merely unhelpful. A key whose
 * names cannot be resolved is left out entirely, so `downloadAll` keeps its
 * positional naming for it.
 */
export function resolveOutputLabels(
  tool: FalToolConfig,
  body: Record<string, unknown>,
  result?: Record<string, unknown>
): OutputLabels | undefined {
  const declared = "outputLabels" in tool ? tool.outputLabels : undefined;
  if (declared === undefined) {
    return undefined;
  }
  const entries = Object.entries(declared).flatMap(([key, rule]) => {
    const labels = labelsForKey(key, rule, body, result);
    return labels === undefined ? [] : [[key, labels] as const];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}
