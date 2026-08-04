/**
 * Purity guard: "bench-mastra is orchestration only" (`docs/arc/bench/
 * BRIEF.md` rule 4). `src/tools/*.ts`, `src/workflows/**\/*.ts`, and
 * `src/agents/*.ts` must never contain a `fetch(`, a `node:fs` import, a
 * `readFileSync`/`writeFileSync`, or a raw `process.env.` read — every
 * provider call, file write, and env read belongs in `@motif/bench-core`
 * (which owns them) or `@motif/bench-env` (env), reached only through the
 * `GenerationExecutor`/`PersistExecutor` seam (`src/executors.ts`).
 *
 * Ported from materialdesk's `packages/mastra/src/wrapper-purity.test.ts`
 * (`docs/arc/bench/BRIEF.md` precedent table), adapted to tolerate `tools/`
 * and `agents/` not existing yet — this package has no agents or tools this
 * phase, only `workflows/`.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const WRAPPER_GLOBS = ["tools", "workflows", "agents"];

/** Recursively collect every non-test `.ts` file under `dir`. */
const collectSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }
    const isSourceFile =
      entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts");
    return isSourceFile ? [fullPath] : [];
  });
};

const wrapperFiles = WRAPPER_GLOBS.flatMap((dirName) => {
  const dir = path.join(import.meta.dirname, dirName);
  return existsSync(dir) ? collectSourceFiles(dir) : [];
});

interface PurityCheck {
  label: string;
  pattern: RegExp;
}

const PURITY_CHECKS: PurityCheck[] = [
  { label: "fetch(", pattern: /\bfetch\(/u },
  { label: "node:fs import", pattern: /from\s+["']node:fs["']/u },
  { label: "readFileSync", pattern: /\breadFileSync\b/u },
  { label: "writeFileSync", pattern: /\bwriteFileSync\b/u },
  {
    label: "process.env. (env access must go through @motif/bench-env)",
    pattern: /\bprocess\.env\./u,
  },
];

describe("Mastra wrapper purity (orchestration only)", () => {
  it("scans at least one wrapper file", () => {
    expect(wrapperFiles.length).toBeGreaterThan(0);
  });

  it.each(wrapperFiles)("%s stays free of provider/fs/env access", (file) => {
    const source = readFileSync(file, "utf-8");
    const hits = PURITY_CHECKS.filter((check) => check.pattern.test(source));

    expect(
      hits,
      `${file} contains disallowed direct access: ${hits.map((hit) => hit.label).join(", ")}. Provider calls, filesystem access, and raw env reads belong in @motif/bench-core or @motif/bench-env, not in a Mastra wrapper.`
    ).toEqual([]);
  });
});
