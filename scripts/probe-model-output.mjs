#!/usr/bin/env node
/**
 * Measure what each generation model actually returns, not what it accepts.
 *
 * The registry records `supportsOutputFormat: false` for the Seedream family.
 * True, and useless: it says the argument is rejected, not that the result is
 * 4:2:0 chroma subsampled JPEG - chroma averaged over 2x2 blocks, which is
 * ruinous for anything that divides by alpha at a soft edge. A caller learns
 * they cannot ask; they do not learn what arrives.
 *
 * That fact cannot be read from a schema. It is in the bytes, so this generates
 * one small image per model and looks at them.
 *
 * SPENDS REAL CREDITS - one generation per model. Prices first and runs nothing
 * without --confirm. Results are committed, so this is a one-off per model added.
 *
 *   node scripts/probe-model-output.mjs                  # price it
 *   node scripts/probe-model-output.mjs --confirm        # run
 *   node scripts/probe-model-output.mjs --confirm --only flux2-pro,seedream5
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const CLI = join(ROOT, "apps/cli/dist/index.js");
const WORK = join(ROOT, ".probe");
const TARGET = join(ROOT, "packages/motif-sdk/src/model-output.generated.ts");

const { GENERATION_MODELS, MODELS } = await import(
  join(ROOT, "packages/motif-sdk/dist/index.cjs")
).then((m) => m.default ?? m);

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const onlyArg = args[args.indexOf("--only") + 1];
const only = args.includes("--only") && onlyArg ? new Set(onlyArg.split(",")) : null;

/** Cheapest prompt and smallest sensible request: we are measuring bytes, not pictures. */
const PROMPT = "a plain mid-grey square, flat, no detail";

/**
 * JPEG chroma subsampling, read from the SOF marker's component sampling factors.
 *
 * `4:4:4` keeps full chroma resolution. `4:2:0` averages it over 2x2 blocks,
 * which is invisible in a photograph and destructive at a matte edge. Nothing
 * in a content-type header carries this.
 */
function jpegSubsampling(buf) {
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    const length = (buf[i + 2] << 8) | buf[i + 3];
    // SOF0/1/2/9/10 carry the frame header; skip DHT, DQT and the rest.
    if ([0xc0, 0xc1, 0xc2, 0xc9, 0xca].includes(marker)) {
      const components = buf[i + 9];
      const factors = [];
      for (let c = 0; c < components; c += 1) {
        const at = i + 10 + c * 3 + 1;
        factors.push([buf[at] >> 4, buf[at] & 0x0f]);
      }
      const [y] = factors;
      if (!y) {
        return "unknown";
      }
      if (y[0] === 1 && y[1] === 1) {
        return "4:4:4";
      }
      if (y[0] === 2 && y[1] === 2) {
        return "4:2:0";
      }
      if (y[0] === 2 && y[1] === 1) {
        return "4:2:2";
      }
      return `${y[0]}x${y[1]}`;
    }
    i += 2 + length;
  }
  return "unknown";
}

function inspect(path) {
  const buf = readFileSync(path);
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    // PNG IHDR: width(4) height(4) depth(1) colourType(1)
    const depth = buf[24];
    const colour = buf[25];
    return {
      bitDepth: depth,
      container: "png",
      hasAlpha: colour === 4 || colour === 6,
      lossless: true,
      subsampling: null,
    };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    return {
      bitDepth: 8,
      container: "jpeg",
      hasAlpha: false,
      lossless: false,
      subsampling: jpegSubsampling(buf),
    };
  }
  if (buf.slice(8, 12).toString() === "WEBP") {
    // The chunk after the RIFF header says which encoder was used: VP8L is
    // lossless, VP8 (with the trailing space) is lossy, VP8X is the extended
    // form and carries its own flags. Saying "webp" alone answers nothing.
    const chunk = buf.slice(12, 16).toString();
    const alphaFlag = chunk === "VP8X" ? (buf[20] & 0x10) !== 0 : chunk === "VP8L";
    return {
      bitDepth: 8,
      container: chunk === "VP8L" ? "webp (lossless)" : "webp (lossy)",
      hasAlpha: alphaFlag,
      lossless: chunk === "VP8L",
      subsampling: chunk === "VP8 " ? "4:2:0" : null,
    };
  }
  return { container: "unknown" };
}

const ids = GENERATION_MODELS.filter((id) => (only ? only.has(id) : true));

function priceOf(id) {
  const cost = MODELS[id]?.falPricing?.estimatedCostPerImageUsd;
  return typeof cost === "number" ? cost : null;
}

if (!confirmed) {
  const known = ids.map(priceOf).filter((c) => c !== null);
  const total = known.reduce((a, b) => a + b, 0);
  console.log(`\n${ids.length} models to probe, one generation each.`);
  console.log(
    `Known prices sum to $${total.toFixed(2)}; ${ids.length - known.length} are per-megapixel or metered ` +
      "and will be small at this size.\n\nRe-run with --confirm.\n"
  );
  process.exit(0);
}

mkdirSync(WORK, { recursive: true });
const rows = [];

for (const id of ids) {
  const out = join(WORK, `${id}.png`);
  const landed = [out, out.replace(/\.png$/, ".jpg"), out.replace(/\.png$/, ".webp")].find(existsSync);
  let file = landed;
  if (!file) {
    try {
      execFileSync(
        "node",
        [CLI, PROMPT, "-m", id, "-o", out, "--square", "--no-open", "--format", "json", "--fields", "cost"],
        { cwd: ROOT, encoding: "utf8", stdio: "pipe", maxBuffer: 32 * 1024 * 1024 }
      );
    } catch {
      console.log(`  ! ${id.padEnd(16)} generation failed`);
      continue;
    }
    file = [out, out.replace(/\.png$/, ".jpg"), out.replace(/\.png$/, ".webp")].find(existsSync);
  }
  if (!file) {
    console.log(`  ! ${id.padEnd(16)} no file landed`);
    continue;
  }
  const shape = inspect(file);
  rows.push({ id, ...shape });
  console.log(
    `  ${id.padEnd(16)} ${shape.container}${shape.subsampling ? ` ${shape.subsampling}` : ""}` +
      `${shape.lossless ? " lossless" : ""}${shape.hasAlpha ? " alpha" : ""}`
  );
}

const entries = rows
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((r) => {
    const parts = [`container: ${JSON.stringify(r.container)}`];
    if (r.subsampling) {
      parts.push(`subsampling: ${JSON.stringify(r.subsampling)}`);
    }
    parts.push(`lossless: ${r.lossless}`);
    if (r.hasAlpha) {
      parts.push("hasAlpha: true");
    }
    if (r.bitDepth) {
      parts.push(`bitDepth: ${r.bitDepth}`);
    }
    return `  ${JSON.stringify(r.id)}: { ${parts.join(", ")} },`;
  });

writeFileSync(
  TARGET,
  `// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/probe-model-output.mjs --confirm  (spends credits)
//
// What each model actually returns, measured from the bytes of a real
// generation. This is not derivable from a schema and not implied by
// \`supportsOutputFormat\`: that flag says whether the argument is accepted,
// which tells a caller they cannot ask for PNG but not that what arrives is
// 4:2:0 chroma subsampled JPEG — chroma averaged over 2x2 blocks, invisible in
// a photograph and destructive at a matte edge.
//
// The container is a label. The subsampling is the fact that changes a decision.

export interface ModelOutputShape {
  /** File container the endpoint returns. */
  container: string;
  /** Whether the encoding preserves every pixel exactly. */
  lossless: boolean;
  /** Bits per channel. */
  bitDepth?: number;
  /** Whether the returned file carries an alpha channel. */
  hasAlpha?: boolean;
  /** JPEG chroma subsampling, e.g. "4:4:4" or "4:2:0". Absent for lossless containers. */
  subsampling?: string;
}

export const MODEL_OUTPUT: Record<string, ModelOutputShape> = {
${entries.join("\n")}
};

/** What a model returns, or undefined if it has not been probed. */
export function modelOutput(model: string): ModelOutputShape | undefined {
  return MODEL_OUTPUT[model];
}
`
);
execFileSync(join(ROOT, "node_modules/.bin/howells-fix"), ["."], {
  cwd: join(ROOT, "packages/motif-sdk"),
  stdio: "ignore",
});
console.log(`\nwrote ${TARGET} — ${rows.length} models measured\n`);
