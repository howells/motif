/**
 * Offline proof of the routing eval's grading: canned model answers go
 * through the parser and the scores are asserted. Spends nothing.
 *
 *   pnpm vitest run tests/routing-grade.test.ts
 */

import { describe, expect, it } from "vitest";

import type { CaseResult, RoutingCase } from "../evals/routing/grade";
import {
  commandOf,
  extractInvocation,
  grade,
  shellWords,
  summarise,
} from "../evals/routing/grade";
import {
  linkedPages,
  loadCases,
  shippedCommands,
} from "../evals/routing/prompt";

const cases = loadCases();

function caseById(id: string): RoutingCase {
  const testCase = cases.find((candidate) => candidate.id === id);
  if (testCase === undefined) {
    throw new Error(`no case ${id}`);
  }
  return testCase;
}

function sh(command: string): string {
  return `\`\`\`sh\n${command}\n\`\`\``;
}

function route(line: string): string | null {
  return commandOf(shellWords(line));
}

describe(extractInvocation, () => {
  it("takes the first motif line from a fenced block", () => {
    const answer = `Use erase.\n\n${sh('motif erase "the car" street.png --dry-run\nmotif sheet a.png')}`;
    expect(extractInvocation(answer)).toBe(
      'motif erase "the car" street.png --dry-run'
    );
  });

  it("strips a prompt mark and joins continuations", () => {
    const answer = sh("$ motif sheet a.png b.png \\\n  c.png d.png --no-open");
    expect(shellWords(extractInvocation(answer) ?? "")).toStrictEqual([
      "motif",
      "sheet",
      "a.png",
      "b.png",
      "c.png",
      "d.png",
      "--no-open",
    ]);
  });

  it("falls back to inline code, then a bare line", () => {
    expect(extractInvocation("Run `motif --describe errors` to see.")).toBe(
      "motif --describe errors"
    );
    expect(extractInvocation("motif --last\n")).toBe("motif --last");
  });

  it("returns null when there is no motif command", () => {
    expect(
      extractInvocation(sh("magick montage a.png b.png out.png"))
    ).toBeNull();
  });
});

describe(commandOf, () => {
  it("routes subcommands, series run and flag commands", () => {
    expect(route('motif erase "the car" x.png')).toBe("erase");
    expect(route('motif series run "cabins" --count 8')).toBe("series run");
    expect(route('motif series create "Luna"')).toBe("series");
    expect(route("motif --up --scale 2")).toBe("upscale");
    expect(route("motif --describe errors")).toBe("errors");
    expect(route("motif --describe --format json | jq .models")).toBe(
      "describe"
    );
    expect(route('motif "a series of six photos" -m gpt')).toBe("generate");
    expect(route("magick montage a.png")).toBeNull();
  });

  it("names every command in the shipped task table from its usage", () => {
    for (const [command, usage] of shippedCommands()) {
      expect(route(usage), usage).toBe(command);
    }
  });
});

describe(linkedPages, () => {
  it("resolves relative .md links against the guide's directory", () => {
    const guide =
      "See [flags](docs/generate.md#flags), [again](docs/generate.md), [root](../../README.md), [web](https://example.com/x.md) and [abs](/abs.md).";
    expect(linkedPages("apps/cli/AGENTS.md", guide)).toStrictEqual([
      "apps/cli/docs/generate.md",
      "README.md",
    ]);
  });
});

describe("cases", () => {
  it("cover every command in the shipped task table, and only those", () => {
    const shipped = [...shippedCommands().keys()];
    const covered = new Set(
      cases.flatMap((testCase) =>
        typeof testCase.command === "string"
          ? [testCase.command]
          : testCase.command
      )
    );
    expect(shipped.filter((command) => !covered.has(command))).toStrictEqual(
      []
    );
    expect(
      [...covered].filter((command) => !shipped.includes(command))
    ).toStrictEqual([]);
  });
});

describe(grade, () => {
  it("passes the right command with its argument", () => {
    const result = grade(
      caseById("erase-car"),
      `The erase command does this.\n\n${sh('$ motif erase "the parked car" ./street.png --dry-run')}`
    );
    expect(result.command).toBe("erase");
    expect(result.pass).toBeTruthy();
  });

  it("fails a generation edit or tool run where erase was wanted", () => {
    const edit = grade(
      caseById("erase-car"),
      sh('motif "remove the car" -e street.png -m gpt')
    );
    expect(edit.command).toBe("generate");
    expect(edit.commandOk).toBeFalsy();
    expect(edit.pass).toBeFalsy();

    const tool = grade(
      caseById("erase-car"),
      sh("motif tool run object-removal --input image=street.png")
    );
    expect(tool.command).toBe("tool");
    expect(tool.pass).toBeFalsy();
  });

  it("fails an answer with no motif command", () => {
    const result = grade(
      caseById("sheet-side-by-side"),
      sh("magick montage a.png b.png c.png d.png -tile 4x1 out.png")
    );
    expect(result.invocation).toBeNull();
    expect(result.command).toBeNull();
    expect(result.pass).toBeFalsy();
    expect(result.missingArgs).toStrictEqual([
      "a.png",
      "b.png",
      "c.png",
      "d.png",
    ]);
  });

  it("requires every flag, in either spelling", () => {
    const testCase = caseById("look-lived-in-lamplit");
    const missing = grade(
      testCase,
      sh('motif "a family kitchen" --look lived-in')
    );
    expect(missing.commandOk).toBeTruthy();
    expect(missing.missingFlags).toStrictEqual(["--mood lamplit"]);
    expect(missing.pass).toBeFalsy();

    const equals = grade(
      testCase,
      sh('motif "a family kitchen" --look=lived-in --mood=lamplit --dry-run')
    );
    expect(equals.pass).toBeTruthy();
  });

  it("accepts any listed alternative and short aliases", () => {
    const reframe = caseById("reframe-16x9");
    expect(
      grade(reframe, sh("motif reframe --landscape hero.png")).pass
    ).toBeTruthy();
    expect(
      grade(reframe, sh("motif reframe --wide hero.png")).missingFlags
    ).toStrictEqual(["--og | --landscape"]);
    expect(
      grade(
        caseById("generate-hero-16x9"),
        sh('motif "a lighthouse at dusk" -a 16:9 -m flux2-pro')
      ).pass
    ).toBeTruthy();
    expect(
      grade(
        caseById("generate-edit-cabinets"),
        sh('motif "dark green cabinets" -e kitchen.png')
      ).pass
    ).toBeTruthy();
  });

  it("checks flag values", () => {
    const testCase = caseById("series-run-six");
    expect(
      grade(
        testCase,
        sh('motif series run "brutalist architecture" --count 6 --dry-run')
      ).pass
    ).toBeTruthy();
    expect(
      grade(testCase, sh('motif series run "brutalist architecture" --count 4'))
        .missingFlags
    ).toStrictEqual(["--count 6"]);
  });

  it("accepts either command when a case lists two", () => {
    const testCase = caseById("enhance-upscale-print");
    expect(grade(testCase, sh("motif --up product.jpg")).pass).toBeTruthy();
    expect(grade(testCase, sh("motif enhance product.jpg")).pass).toBeTruthy();
    expect(
      grade(testCase, sh('motif "bigger" -e product.jpg')).pass
    ).toBeFalsy();
  });
});

describe(summarise, () => {
  it("computes accuracy and pass^k overall and per command", () => {
    const run = (id: string, answers: readonly string[]): CaseResult => ({
      testCase: caseById(id),
      grades: answers.map((answer) => grade(caseById(id), answer)),
    });
    const erase = sh('motif erase "the car" street.png');
    const wrong = sh('motif "remove it" -e street.png');
    const layers = sh("motif layers poster.png -o layers/");
    const { overall, byCommand } = summarise([
      run("erase-car", [erase, erase, erase]),
      run("erase-person-left", [wrong, wrong, wrong]),
      run("layers-poster", [layers, wrong, wrong]),
    ]);
    expect(overall).toStrictEqual({
      cases: 3,
      runs: 9,
      passed: 4,
      accuracy: 4 / 9,
      passAll: 1 / 3,
    });
    expect(byCommand).toStrictEqual({
      erase: { cases: 2, runs: 6, passed: 3, accuracy: 0.5, passAll: 0.5 },
      layers: { cases: 1, runs: 3, passed: 1, accuracy: 1 / 3, passAll: 0 },
    });
  });
});
