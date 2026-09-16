#!/usr/bin/env node
/**
 * Run every demonstration in scripts/demo-manifest.json through the real CLI,
 * as the verb command the page shows.
 *
 * SPENDS REAL CREDITS with --confirm. Without it, every pending demonstration
 * and missing source is dry-run through the CLI with the API keys removed from
 * its environment, so pricing can never make a call.
 *
 *   node scripts/run-demos.mjs                 # price what is pending, run nothing
 *   node scripts/run-demos.mjs --only restyle,try-on
 *   node scripts/run-demos.mjs --all           # price every plate, made or not
 *   node scripts/run-demos.mjs --confirm       # run everything missing
 *   node scripts/run-demos.mjs --confirm --sources   # (re)generate source images first
 *
 * Output lands in docs/tools/examples/. Anything already present is skipped, so
 * a failed run is resumable and a single plate can be redone by deleting its file.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

/** A dry run gets no keys and an empty home, so no config file can supply one. */
function dryEnv() {
  const env = { ...process.env, HOME: mkdtempSync(join(tmpdir(), "motif-dry-")) };
  delete env.FAL_KEY;
  delete env.OPENAI_API_KEY;
  return env;
}

function cli(argv, { dry = false } = {}) {
  try {
    return execFileSync("node", [CLI, ...argv], {
      cwd: ROOT,
      encoding: "utf8",
      env: dry ? dryEnv() : process.env,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // Errors are printed as JSON on stdout with a non-zero exit.
    return error.stdout || null;
  }
}

/** Last JSON object on stdout, which is where the CLI puts its result. */
function lastJson(stdout) {
  if (!stdout) {
    return null;
  }
  const text = stdout.trim();
  try {
    return JSON.parse(text);
  } catch {
    const line = text.split("\n").filter(Boolean).at(-1);
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }
}

function sourceEntry(id) {
  const source = manifest.sources.find((s) => s.id === id);
  if (!source) {
    throw new Error(`unknown source: ${id}`);
  }
  return source;
}

/** The source's path, or null when it has not been generated yet. */
function sourcePath(id) {
  const source = sourceEntry(id);
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
  return null;
}

function sourceArgv(source) {
  return [source.prompt, "-m", source.model, source.aspect];
}

/** sips is macOS-only and already a dependency of the CLI's image helpers. */
function sips(argv) {
  execFileSync("sips", argv, { stdio: "ignore" });
}

/** Shrink a source so an upscaler has something to actually recover. */
function derive(kind, from, id, { dry }) {
  const target = join("docs/tools/examples", `derived-${id}.jpg`);
  if (existsSync(join(ROOT, target)) || dry) {
    return existsSync(join(ROOT, target)) ? target : from;
  }
  const size = Number(kind.split("-")[1]);
  sips(["-Z", String(size), "-s", "format", "jpeg", "-s", "formatOptions", "35",
    join(ROOT, from), "--out", join(ROOT, target)]);
  return target;
}

function outputFor(demo) {
  if (demo.dir) {
    return join("docs/tools/examples", `${demo.plate}/`);
  }
  if (demo.svg) {
    return join("docs/tools/examples", `out-${demo.plate}.svg`);
  }
  return join("docs/tools/examples", `out-${demo.plate}.${demo.png ? "png" : "jpg"}`);
}

function alreadyDone(demo) {
  if (demo.json) {
    return existsSync(join(OUT, `out-${demo.plate}.json`));
  }
  const target = join(ROOT, outputFor(demo));
  if (demo.dir) {
    return existsSync(target);
  }
  return existsSync(target) || existsSync(target.replace(/\.\w+$/, ".jpg")) ||
    existsSync(target.replace(/\.\w+$/, ".png"));
}

/** Source ids a demo reads: its own, and any `$source:<id>` in its argv. */
function sourcesOf(demo) {
  const refs = demo.argv
    .filter((a) => a.startsWith("$source:"))
    .map((a) => a.slice("$source:".length));
  return [demo.source, ...refs];
}

/**
 * The verb command, with source placeholders resolved and the output added.
 * The same argv the page prints, so what is shown is what runs.
 */
function argvFor(demo, { dry }) {
  const raw = sourcePath(demo.source);
  // A derived input already on disk is what the plate was made from, and what
  // build-page.py and verify-demos.py treat as its before.
  const made = join("docs/tools/examples", `derived-${demo.plate}.jpg`);
  const input = demo.derive
    ? derive(demo.derive, raw, demo.plate, { dry })
    : existsSync(join(ROOT, made)) ? made : raw;
  const argv = demo.argv.map((a) => {
    if (a === "$source") {
      return input;
    }
    if (a.startsWith("$source:")) {
      return sourcePath(a.slice("$source:".length));
    }
    return a;
  });
  if (!demo.json) {
    argv.push("-o", outputFor(demo));
  }
  return [...argv, "--format", "json", "--no-open"];
}

function money(cost) {
  return typeof cost === "number" ? `$${Number(cost.toFixed(6))}` : "metered";
}

function missingSources(demos) {
  const ids = new Set(demos.flatMap(sourcesOf));
  return [...ids].filter((id) => sourcePath(id) === null).map(sourceEntry);
}

function price(demos) {
  let total = 0;
  let metered = 0;
  const missing = missingSources(demos);
  if (missing.length > 0) {
    console.log("Sources to generate first:");
    for (const source of missing) {
      const result = lastJson(cli([...sourceArgv(source), "--dry-run", "--format", "json", "--no-open"], { dry: true }));
      if (!result || result.error) {
        console.log(`  ! source ${source.id}: ${result?.message ?? "dry run failed"}`);
        continue;
      }
      console.log(`  source ${source.id.padEnd(14)} ${result.model.padEnd(22)} ${money(result.cost)}`);
      typeof result.cost === "number" ? (total += result.cost) : (metered += 1);
    }
    console.log("");
  }
  const unpriceable = new Set(missing.map((s) => s.id));
  for (const demo of demos) {
    const blocked = sourcesOf(demo).find((id) => unpriceable.has(id));
    if (blocked) {
      console.log(`  ${demo.plate.padEnd(16)} needs source ${blocked} before it can be priced`);
      continue;
    }
    const result = lastJson(cli([...argvFor(demo, { dry: true }), "--dry-run"], { dry: true }));
    if (!result || result.error) {
      console.log(`  ! ${demo.plate}: ${result?.message ?? "dry run failed"}`);
      continue;
    }
    console.log(`  ${demo.plate.padEnd(16)} ${`motif ${demo.argv[0]}`.padEnd(16)} ${result.model.padEnd(22)} ${money(result.cost)}`);
    typeof result.cost === "number" ? (total += result.cost) : (metered += 1);
  }
  console.log(`\nProjected: $${total.toFixed(4)}${metered ? ` plus ${metered} metered` : ""}.`);
}

function generateSources(demos) {
  for (const source of missingSources(demos)) {
    console.log(`  + source ${source.id}`);
    const result = lastJson(cli([
      ...sourceArgv(source),
      "-o", join("docs/tools/examples", `source-${source.id}.png`),
      "--format", "json", "--no-open", "--fields", "cost",
    ]));
    if (!result || result.error) {
      console.log(`  ! source ${source.id}: ${result?.message ?? "failed"}`);
    }
  }
}

function run(demo) {
  const argv = argvFor(demo, { dry: false });
  const target = join(ROOT, outputFor(demo));
  mkdirSync(dirname(target.endsWith("/") ? `${target}x` : target), { recursive: true });

  const result = lastJson(cli(argv));
  if (!result || result.error) {
    console.log(`  ! ${demo.plate}: ${result?.message ?? "failed"}`);
    return { ok: false, plate: demo.plate };
  }
  if (demo.json) {
    writeFileSync(join(OUT, `out-${demo.plate}.json`), `${JSON.stringify(result.result ?? result, null, 2)}\n`);
  }
  console.log(`  + ${demo.plate.padEnd(16)} ${String(result.model ?? "").padEnd(22)} ${money(result.cost)}`);
  return { ok: true, plate: demo.plate };
}

if (!existsSync(CLI)) {
  console.error("Build the CLI first: pnpm --filter @howells/motif-cli build");
  process.exit(1);
}

const selected = manifest.demos.filter((d) => (only ? only.has(d.plate) : true));
const pending = selected.filter((d) => !alreadyDone(d));

if (!confirmed) {
  console.log(`\n${pending.length} of ${selected.length} demonstrations pending. Dry-run prices, no keys:\n`);
  price(args.includes("--all") ? selected : pending);
  console.log("\nRe-run with --confirm to execute, --sources to generate missing source images.\n");
  process.exit(0);
}

if (doSources) {
  console.log("\nSources:");
  generateSources(pending);
}

console.log(`\nRunning ${pending.length} demonstrations:`);
const failed = pending.map(run).filter((r) => !r.ok);
console.log(
  failed.length === 0
    ? "\nAll demonstrations produced output.\n"
    : `\n${failed.length} failed: ${failed.map((f) => f.plate).join(", ")}\n`
);
