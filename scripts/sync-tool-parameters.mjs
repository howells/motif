#!/usr/bin/env node
/**
 * Regenerate the registry's parameter surface from fal's own OpenAPI documents.
 *
 * Why generated rather than written: an audit of six tools found 36 arguments
 * the registry never mentioned, including `topaz-precision`'s `upscale_factor`
 * and `iclight-v2`'s `mask_image_url`. Every one was reachable through
 * `--json` and none was discoverable through `--describe`, which for an agent
 * is the same as not existing. Hand-maintaining 71 of those lists is the exact
 * drift this repo has spent a day removing from prices and output keys.
 *
 * So the parameter surface is derived, never authored. Re-run it when fal moves
 * and commit the diff.
 *
 *   node scripts/sync-tool-parameters.mjs           # rewrite the generated file
 *   node scripts/sync-tool-parameters.mjs --check   # fail if it would change
 *
 * Reads public schemas. Runs no model, spends nothing.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const TARGET = join(ROOT, "packages/motif-sdk/src/tool-parameters.generated.ts");

const { FAL_TOOLS, FAL_TOOL_IDS } = await import(
  join(ROOT, "packages/motif-sdk/dist/index.cjs")
).then((m) => m.default ?? m);

/** Present on nearly every endpoint and says nothing about what a tool can do. */
const PLUMBING = new Set(["sync_mode"]);

const ids = [...FAL_TOOL_IDS].sort();
const endpoints = ids.map((id) => FAL_TOOLS[id].endpoint);

const schemas = JSON.parse(
  execFileSync(
    "node",
    [join(ROOT, "scripts/fal-schema.mjs"), "--json", "--no-price", ...endpoints],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
);
const byEndpoint = Object.fromEntries(schemas.map((s) => [s.endpointId, s]));

function literal(value) {
  return JSON.stringify(value);
}

const blocks = [];
let total = 0;

for (const id of ids) {
  const tool = FAL_TOOLS[id];
  const schema = byEndpoint[tool.endpoint];
  if (!schema || schema.error) {
    console.warn(`  ! ${id}: ${schema?.error ?? "no schema"}`);
    continue;
  }
  const media = new Set(schema.mediaFields);
  const params = schema.inputs
    .filter((input) => !media.has(input.key) && !PLUMBING.has(input.key))
    .sort((a, b) => a.key.localeCompare(b.key));

  total += params.length;
  const rows = params.map((p) => {
    const parts = [`key: ${literal(p.key)}`, `type: ${literal(p.type)}`];
    if (p.required) {
      parts.push("required: true");
    }
    if (p.default !== undefined) {
      parts.push(`fallback: ${literal(p.default)}`);
    }
    return `    { ${parts.join(", ")} },`;
  });
  blocks.push(`  ${JSON.stringify(id)}: [\n${rows.join("\n")}\n  ],`);
}

const file = `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/sync-tool-parameters.mjs
//
// Every argument each registered fal endpoint accepts, read from fal's own
// OpenAPI document. This exists because an audit found 36 arguments across six
// tools that the registry never mentioned: all of them reachable through
// \`--json\`, none of them discoverable through \`--describe\`, which for an
// agent reading the schema to decide what is possible is the same as absent.
//
// \`fallback\` is the endpoint's own default, not Motif's opinion — a caller who
// sends nothing gets that value. Some of them are surprising: \`sam3-image\`
// defaults \`prompt\` to "wheel", so an unprompted call looks for wheels and
// quietly returns nothing when there are none. Motif's deliberate overrides
// live in \`defaultOptions\` on the entry itself and are applied on top.
//
// Media inputs are omitted; those are \`inputField\` on the entry.

/** One argument an endpoint accepts. */
export interface FalToolParameter {
  /** Argument name, exactly as fal expects it in the request body. */
  key: string;
  /** fal's own default when the caller sends nothing. */
  fallback?: boolean | number | string | readonly unknown[];
  /** Whether fal rejects the request without it. */
  required?: true;
  /** Compact rendering of fal's declared type, e.g. \`enum(a|b)\`, \`list[string]\`. */
  type: string;
}

export const FAL_TOOL_PARAMETERS: Record<string, readonly FalToolParameter[]> = {
${blocks.join("\n")}
};

/** Arguments a tool accepts, including ones Motif does not surface as flags. */
export function falToolParameters(tool: string): readonly FalToolParameter[] {
  return FAL_TOOL_PARAMETERS[tool] ?? [];
}
`;

/**
 * Write, then format in place through the repo formatter.
 *
 * The formatter only takes a directory and skips dot-prefixed files, so there
 * is no way to format a string in isolation. Writing and then formatting is
 * therefore the only honest comparison: the committed file is formatted, so a
 * raw generated string would report stale forever regardless of whether fal
 * had moved.
 */
function writeFormatted(source) {
  writeFileSync(TARGET, source);
  execFileSync(join(ROOT, "node_modules/.bin/howells-fix"), ["."], {
    cwd: join(ROOT, "packages/motif-sdk"),
    stdio: "ignore",
  });
  return readFileSync(TARGET, "utf8");
}

if (process.argv.includes("--check")) {
  const before = readFileSync(TARGET, "utf8");
  const after = writeFormatted(file);
  if (before !== after) {
    writeFileSync(TARGET, before);
    console.error(
      "tool-parameters.generated.ts is stale - fal's schemas have moved.\n" +
        "Run: node scripts/sync-tool-parameters.mjs"
    );
    process.exit(1);
  }
  console.log(`up to date - ${ids.length} tools, ${total} arguments`);
} else {
  writeFormatted(file);
  console.log(`wrote ${TARGET}`);
  console.log(`${ids.length} tools, ${total} arguments`);
}
