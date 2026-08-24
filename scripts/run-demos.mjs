#!/usr/bin/env node
/**
 * Run every demonstration in scripts/demo-manifest.json through the real CLI.
 *
 * SPENDS REAL CREDITS. Roughly $3 for the full set. Dry-runs and prints a total
 * unless you pass --confirm.
 *
 *   node scripts/run-demos.mjs                 # price it, run nothing
 *   node scripts/run-demos.mjs --confirm       # run everything missing
 *   node scripts/run-demos.mjs --confirm --only segment,depth
 *   node scripts/run-demos.mjs --confirm --sources   # (re)generate source images
 *
 * Output lands in docs/tools/examples/. Anything already present is skipped, so
 * a failed run is resumable and a single plate can be redone by deleting its file.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "apps/cli/dist/index.js");
const OUT = join(ROOT, "docs/tools/examples");
const manifest = JSON.parse(
  readFileSync(join(ROOT, "scripts/demo-manifest.json"), "utf8")
);

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const doSources = args.includes("--sources");
const onlyArg = args[args.indexOf("--only") + 1];
const only =
  args.includes("--only") && onlyArg ? new Set(onlyArg.split(",")) : null;

function cli(argv, { quiet = false } = {}) {
  try {
    return execFileSync("node", [CLI, ...argv], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    if (!quiet) {
      console.error(`  ! ${error.stderr?.trim() || error.message}`);
    }
    return null;
  }
}

/** Last JSON object on stdout, which is where the CLI puts its result. */
function lastJson(stdout) {
  if (!stdout) {
    return null;
  }
  const line = stdout.trim().split("\n").filter(Boolean).at(-1);
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function sourcePath(id) {
  const source = manifest.sources.find((s) => s.id === id);
  if (!source) {
    throw new Error(`unknown source: ${id}`);
  }
  if (source.have) {
    return source.have;
  }
  // The downloader names the file from the bytes it received, not from the
  // extension asked for, so a generated source can land as .jpg or .png.
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const candidate = join("docs/tools/examples", `source-${id}.${ext}`);
    if (existsSync(join(ROOT, candidate))) {
      return candidate;
    }
  }
  throw new Error(`source ${id} has not been generated`);
}

/** sips is macOS-only and already a dependency of the CLI's image helpers. */
function sips(argv) {
  execFileSync("sips", argv, { stdio: "ignore" });
}

function generateSources() {
  for (const source of manifest.sources) {
    if (source.have) {
      continue;
    }
    const target = join(OUT, `source-${source.id}.png`);
    const landed = target.replace(/\.png$/, ".jpg");
    if (existsSync(landed) || existsSync(target)) {
      console.log(`  = source ${source.id} (exists)`);
      continue;
    }
    console.log(`  + source ${source.id}`);
    cli([
      "--format", "json", "--no-open",
      "-m", source.model,
      source.prompt,
      "-o", target,
      source.aspect,
      "--fields", "cost",
    ]);
  }
}

/** Shrink a source so an upscaler has something to actually recover. */
function derive(kind, from, id) {
  const target = join(OUT, `derived-${id}.jpg`);
  if (existsSync(target)) {
    return target;
  }
  const size = Number(kind.split("-")[1]);
  sips(["-Z", String(size), "-s", "format", "jpeg", "-s", "formatOptions", "35", from, "--out", target]);
  return target;
}

function outputFor(demo) {
  if (demo.dir) {
    return join(OUT, `${demo.plate}/`);
  }
  if (demo.svg) {
    return join(OUT, `out-${demo.plate}.svg`);
  }
  return join(OUT, `out-${demo.plate}.${demo.png ? "png" : "jpg"}`);
}

function alreadyDone(demo) {
  const target = outputFor(demo);
  if (demo.json) {
    return existsSync(join(OUT, `out-${demo.plate}.json`));
  }
  if (demo.dir) {
    return existsSync(target);
  }
  return existsSync(target) || existsSync(target.replace(/\.\w+$/, ".jpg")) ||
    existsSync(target.replace(/\.\w+$/, ".png"));
}

function run(demo) {
  const raw = sourcePath(demo.source);
  const input = demo.derive ? derive(demo.derive, raw, demo.plate) : raw;
  const target = outputFor(demo);
  mkdirSync(dirname(target.endsWith("/") ? `${target}x` : target), { recursive: true });

  const argv = ["tool", "run", demo.tool, demo.inputs ? "--inputs" : "-i", input, "--format", "json"];
  if (!demo.json) {
    argv.push("-o", target);
  }
  if (demo.opts) {
    argv.push("--json", JSON.stringify(demo.opts));
  }

  const result = lastJson(cli(argv));
  if (!result || result.error) {
    console.log(`  ! ${demo.plate}: ${result?.message ?? "failed"}`);
    return { ok: false, plate: demo.plate };
  }
  if (demo.json) {
    execFileSync("node", ["-e",
      `require("node:fs").writeFileSync(process.argv[1], JSON.stringify(${JSON.stringify(result.result ?? result)}, null, 2))`,
      join(OUT, `out-${demo.plate}.json`)]);
  }
  const cost = result.estimatedCost ?? result.cost;
  console.log(`  + ${demo.plate.padEnd(16)} ${demo.tool.padEnd(22)} ${cost === null || cost === undefined ? "metered" : `$${cost}`}`);
  return { ok: true, plate: demo.plate };
}

const selected = manifest.demos.filter((d) => (only ? only.has(d.plate) : true));
const pending = selected.filter((d) => !alreadyDone(d));

if (!confirmed) {
  console.log(`\n${pending.length} of ${selected.length} demonstrations pending.\n`);
  for (const demo of pending) {
    console.log(`  ${demo.plate.padEnd(16)} ${demo.tool}`);
  }
  console.log(
    "\nThis spends real credits, roughly $3 for the full set." +
      "\nRe-run with --confirm to execute, --sources to generate missing source images.\n"
  );
  process.exit(0);
}

if (!existsSync(CLI)) {
  console.error("Build the CLI first: pnpm --filter @howells/motif-cli build");
  process.exit(1);
}

if (doSources) {
  console.log("\nSources:");
  generateSources();
}

console.log(`\nRunning ${pending.length} demonstrations:`);
const failed = pending.map(run).filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? "\nAll demonstrations produced output.\n"
    : `\n${failed.length} failed: ${failed.map((f) => f.plate).join(", ")}\n`
);
