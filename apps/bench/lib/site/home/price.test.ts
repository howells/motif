import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { formatCost } from "@howells/motif-sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { HOME } from "./content";

/** A row the page prices: the figure it shows and the request behind it. */
const PRICED = z.object({
  price: z.string(),
  request: z.array(z.string()),
});

type Priced = z.infer<typeof PRICED>;

/** Every priced row in the content module, wherever it sits, so a price
 * added anywhere on the page is checked without touching this file. */
function pricedRows(value: unknown): Priced[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => pricedRows(item));
  }
  const record = z.record(z.string(), z.unknown()).safeParse(value);
  if (!record.success) {
    return [];
  }
  const row = PRICED.safeParse(value);
  return [
    ...(row.success ? [row.data] : []),
    ...Object.values(record.data).flatMap((item) => pricedRows(item)),
  ];
}

/** The part of a dry run's JSON plan the price comes from. A null cost
 * (unknown) fails the parse: the page never prints a price it cannot
 * compute. */
const PLAN = z.object({ cost: z.number() });

const PUBLIC = path.resolve(import.meta.dirname, "../../../public");

/** The CLI as built in this checkout. Pricing runs through it, as the docs
 * site's dry-run script does, so the page quotes what a reader would see. */
const CLI = path.resolve(import.meta.dirname, "../../../../cli/bin/motif");
const CLI_BUILD = path.resolve(
  import.meta.dirname,
  "../../../../cli/dist/index.js"
);

/** What `motif <request> --dry-run` quotes, formatted as the CLI prints a
 * cost. It runs in a throwaway git repo with an empty home and no key, so no
 * config, pin or credential can change the figure, and nothing is spent: a
 * dry run only plans the call. Pictures the request names by their address
 * under `public/` are copied in and passed by file name. Throws when the
 * dry run fails or quotes no figure. */
function dryRunPrice(request: readonly string[]): string {
  if (!existsSync(CLI_BUILD)) {
    throw new Error(
      "The CLI is not built; run `pnpm --filter @howells/motif-cli build`"
    );
  }
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "motif-price-")));
  const home = path.join(root, "home");
  const work = path.join(root, "work");
  mkdirSync(home);
  mkdirSync(work);
  try {
    spawnSync("git", ["init", "--quiet"], { cwd: work });
    const args = request.map((arg) => {
      if (!arg.startsWith("/demo/")) {
        return arg;
      }
      const name = path.basename(arg);
      cpSync(path.join(PUBLIC, arg), path.join(work, name));
      return name;
    });
    const result = spawnSync(
      process.execPath,
      [CLI, ...args, "--dry-run", "--format", "json"],
      {
        cwd: work,
        encoding: "utf-8",
        env: { HOME: home, NO_COLOR: "1", PATH: "/usr/bin:/bin" },
      }
    );
    if (result.status !== 0) {
      throw new Error(
        `motif ${request.join(" ")} --dry-run failed (exit ${String(result.status)}): ${result.stderr}${result.stdout}`
      );
    }
    const { cost } = PLAN.parse(JSON.parse(result.stdout));
    return formatCost(cost);
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

describe("the homepage prices", () => {
  const rows = pricedRows(HOME);

  it("prices the four jobs in the table", () => {
    expect(rows).toHaveLength(4);
  });

  it("quotes what a dry run of the same request quotes", () => {
    const wrong = rows.flatMap((row) => {
      const quoted = dryRunPrice(row.request);
      return quoted === row.price
        ? []
        : [
            `${row.request.join(" ")}: page says ${row.price}, dry run quotes ${quoted}`,
          ];
    });
    expect(wrong).toStrictEqual([]);
  }, 60_000);
});
