#!/usr/bin/env node
/**
 * Diff what a fal endpoint accepts against what Motif surfaces for it.
 *
 * The registry is a description of the route; the response and the schema are
 * the truth. Two gaps follow from that and this prints both:
 *
 *   1. Arguments the endpoint accepts that nothing in Motif advertises. They
 *      are all still reachable - `motif tool run <id> --json '{...}'` passes
 *      anything through - so this is a discoverability gap, not a capability
 *      one. It matters because `--describe` is what an agent reads to decide
 *      what is possible, and undiscovered behaves like unavailable.
 *   2. Outputs the endpoint returns that the registry's `outputKeys` omits, so
 *      `-o dir/` never downloads them and no consumer knows they exist. That is
 *      how half of seedream-layerize went missing for a day.
 *
 * A defaulted argument with a surprising default is worse than a missing one:
 * `sam3-image` defaults `prompt` to "wheel", so an unprompted call quietly
 * segments wheels. Those are flagged.
 *
 * Reads fal's public OpenAPI. Runs no model, spends nothing.
 *
 *   node scripts/audit-arguments.mjs                    # every image tool
 *   node scripts/audit-arguments.mjs sam3-image patina  # named tools
 *   node scripts/audit-arguments.mjs --json
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const { FAL_TOOLS, FAL_TOOL_IDS } = await import(
  join(ROOT, "packages/motif-sdk/dist/index.cjs")
).then((m) => m.default ?? m);

/** Flags the CLI maps to request options, read from the source rather than guessed. */
function surfacedByCli() {
  const src = readFileSync(join(ROOT, "apps/cli/src/commands/tool-run.ts"), "utf8");
  // buildOptions writes `{ some_snake_case_key: ... }` for each supported flag.
  return new Set([...src.matchAll(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\s*:/g)].map((m) => m[1]));
}

/** Arguments every endpoint takes that say nothing about capability. */
const PLUMBING = new Set(["sync_mode", "enable_safety_checker", "output_format", "seed"]);

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const named = args.filter((a) => !a.startsWith("--"));
const ids = (named.length > 0 ? named : FAL_TOOL_IDS).filter(
  (id) => FAL_TOOLS[id] && FAL_TOOLS[id].inputKind !== "video"
);

const endpoints = ids.map((id) => FAL_TOOLS[id].endpoint);
const schemas = JSON.parse(
  execFileSync("node", [join(ROOT, "scripts/fal-schema.mjs"), "--json", "--no-price", ...endpoints], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
);

const cliFlags = surfacedByCli();
const byEndpoint = Object.fromEntries(ids.map((id) => [FAL_TOOLS[id].endpoint, id]));
const report = [];

for (const schema of schemas) {
  const id = byEndpoint[schema.endpointId];
  if (!id || schema.error) {
    continue;
  }
  const tool = FAL_TOOLS[id];
  const declared = new Set(Object.keys(tool.defaultOptions ?? {}));
  const media = new Set(schema.mediaFields);

  const hidden = schema.inputs
    .filter(
      (input) =>
        !declared.has(input.key) &&
        !media.has(input.key) &&
        !cliFlags.has(input.key) &&
        !PLUMBING.has(input.key)
    )
    .map((input) => (input.default === undefined ? input.key : `${input.key}=${JSON.stringify(input.default)}`));

  // A non-empty default nobody chose is an opinion the caller inherits silently.
  const surprising = schema.inputs
    .filter(
      (input) =>
        !declared.has(input.key) &&
        typeof input.default === "string" &&
        input.default !== "" &&
        /prompt|model|mode/.test(input.key)
    )
    .map((input) => `${input.key}=${JSON.stringify(input.default)}`);

  const missedOutputs = schema.outputs.filter((key) => !tool.outputKeys.includes(key));

  report.push({ hidden, id, missedOutputs, surprising, tool: schema.endpointId });
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const noisy = report.filter((r) => r.hidden.length || r.missedOutputs.length || r.surprising.length);
  for (const row of noisy) {
    console.log(`\n${row.id}  ${row.tool}`);
    if (row.surprising.length) {
      console.log(`  ! inherited default : ${row.surprising.join(", ")}`);
    }
    if (row.hidden.length) {
      console.log(`  not advertised      : ${row.hidden.join(", ")}`);
    }
    if (row.missedOutputs.length) {
      console.log(`  ! returns, unclaimed: ${row.missedOutputs.join(", ")}`);
    }
  }
  const hiddenTotal = report.reduce((n, r) => n + r.hidden.length, 0);
  const outputTotal = report.reduce((n, r) => n + r.missedOutputs.length, 0);
  console.log(
    `\n${report.length} tools audited. ${hiddenTotal} arguments not advertised, ` +
      `${outputTotal} returned keys the registry does not claim.\n` +
      "All arguments remain reachable through `--json`; this is what --describe does not tell you.\n"
  );
}
