/**
 * Reading files out of a fal response: which URLs sit under a Model's output
 * keys, and what each file is called. Pure: no I/O.
 *
 * Ported from the CLI (`utils/image.ts`, `commands/output-labels.ts`), which
 * keeps its own copy until MOT-53 moves it onto this module.
 */

import type { FalToolConfig } from "./tool-types";

/** One URL and the output key it came from. */
export interface OutputUrl {
  key: string;
  url: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDownloadableUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

function urlOf(value: unknown): string | undefined {
  return isPlainRecord(value) && typeof value.url === "string"
    ? value.url
    : undefined;
}

/**
 * A URL on an object: its own `url`, then one level into its values. Seedream's
 * layerize wraps each file as `{ image: { url }, name, z_index }`. One level
 * only: deeper searching finds thumbnails that were never the artefact.
 */
function extractUrl(value: unknown): string | undefined {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  return urlOf(value) ?? Object.values(value).map(urlOf).find(Boolean);
}

/** Every URL reachable from one value: a string, an object, or an array of either. */
export function urlsFrom(value: unknown): string[] {
  if (isDownloadableUrl(value)) {
    return [value];
  }
  const direct = extractUrl(value);
  if (direct !== undefined) {
    return [direct];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item: unknown) => {
    if (isDownloadableUrl(item)) {
      return [item];
    }
    const itemUrl = extractUrl(item);
    return itemUrl === undefined ? [] : [itemUrl];
  });
}

/** Every URL under `keys`, in key order, arrays flattened. */
export function collectUrls(
  result: Record<string, unknown>,
  keys: readonly string[]
): OutputUrl[] {
  return keys.flatMap((key) =>
    urlsFrom(result[key]).map((url) => ({ key, url }))
  );
}

// ─── Labels ────────────────────────────────────────────────────────────

/** Names for the positions of an array-valued output key. */
export type OutputLabels = Record<string, readonly string[]>;

type LabelRule = NonNullable<FalToolConfig["outputLabels"]>[string];
type ItemRule = Extract<LabelRule, { fromItem: unknown }>["fromItem"];

const SLUG_SEPARATOR_REGEX = /[^a-z0-9]+/g;
const SLUG_EDGE_REGEX = /^-+|-+$/g;
const SLUG_MAX_LENGTH = 48;

/**
 * A name built from untrusted text, made inert: lowercase, runs outside
 * [a-z0-9] collapsed to one hyphen, trimmed and capped. Undefined when nothing
 * survives.
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

/** Ordering prefixes for every item, or undefined to prefix none of them. */
function orderPrefixes(
  items: readonly unknown[],
  field: string | undefined
): string[] | undefined {
  if (field === undefined) {
    return undefined;
  }
  const prefixes: string[] = [];
  for (const item of items) {
    const value = isPlainRecord(item) ? item[field] : undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return undefined;
    }
    prefixes.push(String(value));
  }
  return prefixes;
}

/** Make each name unique, so two layers named "Bottle" stay distinct. */
function deduplicate(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    let attempt = 2;
    while (used.has(candidate)) {
      candidate = `${name}-${attempt}`;
      attempt += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

/** Names read off the output array's own elements; undefined if any lacks one. */
function itemLabels(value: unknown, rule: ItemRule): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const names: string[] = [];
  for (const item of value) {
    const slug = slugify(
      isPlainRecord(item) ? item[rule.nameField] : undefined
    );
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

function stringArrayOption(
  body: Record<string, unknown>,
  key: string
): string[] | undefined {
  const value = body[key];
  return Array.isArray(value) &&
    value.every((item: unknown) => typeof item === "string")
    ? value
    : undefined;
}

function labelsForKey(
  key: string,
  rule: LabelRule,
  body: Record<string, unknown>,
  result: Record<string, unknown>
): readonly string[] | undefined {
  if ("fromItem" in rule) {
    return itemLabels(result[key], rule.fromItem);
  }
  const requested =
    rule.fromOption === undefined
      ? undefined
      : stringArrayOption(body, rule.fromOption);
  return requested ?? rule.fallback;
}

/**
 * Resolve each output key's position names against the request body and the
 * response. The request wins over the schema default, because a caller who
 * reorders the driving option would otherwise get the default's names.
 */
export function resolveOutputLabels(
  declared: FalToolConfig["outputLabels"],
  body: Record<string, unknown>,
  result: Record<string, unknown>
): OutputLabels {
  if (declared === undefined) {
    return {};
  }
  const labels: OutputLabels = {};
  for (const [key, rule] of Object.entries(declared)) {
    const names = labelsForKey(key, rule, body, result);
    if (names !== undefined) {
      labels[key] = names;
    }
  }
  return labels;
}

/**
 * The label for each URL, in order. A key's labels apply only when there is
 * exactly one per URL it produced: a mislabelled file reads as authoritative.
 */
export function labelUrls(
  urls: readonly OutputUrl[],
  labels: OutputLabels
): (string | undefined)[] {
  const totals = new Map<string, number>();
  for (const { key } of urls) {
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return urls.map(({ key }) => {
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    const names = labels[key];
    return names !== undefined && names.length === totals.get(key)
      ? names[occurrence]
      : undefined;
  });
}
