/**
 * Routing eval runner. Gives a model only what Motif ships, asks for the first
 * motif command it would run for each request, and grades that command. It
 * never runs the command and never calls fal.
 *
 *   node apps/cli/evals/routing/run.ts --dry-run
 *   node apps/cli/evals/routing/run.ts [--model claude-sonnet-5] [--runs 3] [--case erase-car]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import type { Answer, Backend, Usage } from "./backends.ts";
import {
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  modelInfo,
  withBackend,
} from "./backends.ts";
import { anthropicApiKey } from "./env.ts";
import type { CaseResult, Grade, RoutingCase, Tally } from "./grade.ts";
import {
  expectedCommandLabel,
  grade,
  passedEveryRun,
  summarise,
} from "./grade.ts";
import type { Surface } from "./prompt.ts";
import {
  EVAL_DIR,
  buildSystemPrompt,
  buildUserPrompt,
  estimateTokens,
  isRecord,
  loadCases,
  loadSurfaces,
} from "./prompt.ts";

/** Assumed output per call: adaptive thinking plus a one-line answer. */
const ASSUMED_OUTPUT_TOKENS = 1500;
const BASELINE_PATH = join(EVAL_DIR, "baseline.json");

interface Options {
  readonly dryRun: boolean;
  readonly model: string;
  readonly runs: number;
  readonly concurrency: number;
  readonly caseIds: readonly string[];
  readonly effort: string | undefined;
  readonly writeBaseline: boolean;
}

interface Job {
  readonly testCase: RoutingCase;
  readonly run: number;
}

interface Outcome extends Job {
  readonly answer: Answer;
  readonly grade: Grade;
}

interface Baseline {
  readonly model: string;
  readonly runs: number;
  readonly recordedAt: string;
  readonly passAll: number;
  /** Case id to whether every run passed. */
  readonly cases: Readonly<Record<string, boolean>>;
}

function positiveInteger(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer, got ${raw}`);
  }
  return value;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function usd(value: number): string {
  return `$${value.toFixed(2)}`;
}

function parseOptions(): Options {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      model: { type: "string", default: "claude-sonnet-5" },
      runs: { type: "string", default: "3" },
      concurrency: { type: "string", default: "4" },
      case: { type: "string", multiple: true },
      effort: { type: "string" },
      "write-baseline": { type: "boolean", default: false },
    },
  });
  modelInfo(values.model);
  return {
    dryRun: values["dry-run"],
    model: values.model,
    runs: positiveInteger("runs", values.runs),
    concurrency: positiveInteger("concurrency", values.concurrency),
    caseIds: values.case ?? [],
    effort: values.effort,
    writeBaseline: values["write-baseline"],
  };
}

function selectCases(ids: readonly string[]): RoutingCase[] {
  const all = loadCases();
  const unknown = ids.filter((id) => !all.some((c) => c.id === id));
  if (unknown.length > 0) {
    throw new Error(`Unknown case id: ${unknown.join(", ")}`);
  }
  return ids.length === 0
    ? all
    : all.filter((testCase) => ids.includes(testCase.id));
}

async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const queue = items.entries();
  async function worker(): Promise<void> {
    for (const [index, item] of queue) {
      results[index] = await work(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

function printEstimate(
  options: Options,
  cases: readonly RoutingCase[],
  surfaces: readonly Surface[],
  system: string
): void {
  const info = modelInfo(options.model);
  const systemTokens = estimateTokens(system);
  let userTokens = 0;
  for (const testCase of cases) {
    userTokens += estimateTokens(buildUserPrompt(testCase.request));
  }
  const calls = cases.length * options.runs;
  const perInput = info.input / 1_000_000;
  const outputCost = calls * ASSUMED_OUTPUT_TOKENS * (info.output / 1_000_000);
  const userCost = userTokens * options.runs * perInput;
  const uncached = calls * systemTokens * perInput + userCost + outputCost;
  const cached =
    systemTokens * perInput * CACHE_WRITE_MULTIPLIER +
    (calls - 1) * systemTokens * perInput * CACHE_READ_MULTIPLIER +
    userCost +
    outputCost;

  console.log("Surfaces given to the model (rough tokens):");
  for (const surface of surfaces) {
    console.log(
      `  ${String(estimateTokens(surface.text)).padStart(7)}  ${surface.label}`
    );
  }
  console.log(`  ${String(systemTokens).padStart(7)}  system prompt in total`);
  console.log(
    `Per call: ~${systemTokens} system + ~${Math.round(userTokens / cases.length)} request tokens in, ~${ASSUMED_OUTPUT_TOKENS} out (assumed)`
  );
  console.log(
    `${cases.length} cases x ${options.runs} runs = ${calls} calls to ${options.model}`
  );
  console.log(
    `Estimated cost at API prices: ${usd(cached)} with the system prompt cached, ${usd(uncached)} if nothing caches`
  );
}

async function runCases(
  options: Options,
  cases: readonly RoutingCase[],
  backend: Backend
): Promise<Outcome[]> {
  const jobs: Job[] = Array.from({ length: options.runs }, (_, run) =>
    cases.map((testCase) => ({ testCase, run: run + 1 }))
  ).flat();
  let done = 0;
  const work = async (job: Job): Promise<Outcome> => {
    const answer = await backend({
      model: options.model,
      effort: options.effort,
      user: buildUserPrompt(job.testCase.request),
    });
    const result = grade(job.testCase, answer.text);
    done++;
    console.log(
      `[${done}/${jobs.length}] ${job.testCase.id} run ${job.run}: ${result.pass ? "pass" : "fail"} (${result.command ?? "none"})`
    );
    return { ...job, answer, grade: result };
  };
  // The first call writes the prompt cache; the rest read it.
  const [first, ...rest] = jobs;
  if (first === undefined) {
    return [];
  }
  return [
    await work(first),
    ...(await runPool(rest, options.concurrency, work)),
  ];
}

function totalUsage(outcomes: readonly Outcome[]): Usage & { costUsd: number } {
  let input = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  let output = 0;
  let costUsd = 0;
  for (const { answer } of outcomes) {
    input += answer.usage.input;
    cacheWrite += answer.usage.cacheWrite;
    cacheRead += answer.usage.cacheRead;
    output += answer.usage.output;
    costUsd += answer.costUsd;
  }
  return { input, cacheWrite, cacheRead, output, costUsd };
}

function caseProblems(
  result: CaseResult,
  shown: Grade,
  answers: readonly Answer[]
): string[] {
  return [
    ...(shown.commandOk
      ? []
      : [`want ${expectedCommandLabel(result.testCase)}`]),
    ...shown.missingFlags.map((flag) => `missing ${flag}`),
    ...shown.missingArgs.map((arg) => `missing ${arg}`),
    ...answers
      .filter((answer) => answer.stopReason !== "end_turn")
      .map((answer) => `stop ${answer.stopReason}`),
  ];
}

function printSummary(
  results: readonly CaseResult[],
  answers: readonly (readonly Answer[])[],
  runs: number
): void {
  const width = Math.max(...results.map((result) => result.testCase.id.length));
  for (const [index, result] of results.entries()) {
    const shown = result.grades.find((g) => !g.pass) ?? result.grades[0];
    if (shown === undefined) {
      continue;
    }
    const problems = caseProblems(result, shown, answers[index] ?? []);
    console.log(
      [
        passedEveryRun(result) ? "PASS" : "FAIL",
        result.testCase.id.padEnd(width),
        `${result.grades.filter((g) => g.pass).length}/${runs}`,
        (shown.command ?? "none").padEnd(10),
        shown.invocation ?? "(no motif command)",
        problems.length > 0 ? ` [${problems.join("; ")}]` : "",
      ].join("  ")
    );
  }
  const { overall, byCommand } = summarise(results);
  console.log(
    `\nOverall: ${percent(overall.accuracy)} of ${overall.runs} calls pass; ${percent(overall.passAll)} of ${overall.cases} cases pass every run (pass^${runs})`
  );
  console.log("By command (calls passing, pass^k):");
  const labelWidth = Math.max(...Object.keys(byCommand).map((l) => l.length));
  for (const [label, commandTally] of Object.entries(byCommand)) {
    console.log(
      `  ${label.padEnd(labelWidth)}  ${String(commandTally.cases).padStart(2)} cases  ${percent(commandTally.accuracy).padStart(6)}  ${percent(commandTally.passAll).padStart(6)}`
    );
  }
}

function readBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) {
    return null;
  }
  const malformed = new Error(
    `${BASELINE_PATH} is malformed. Rewrite it with --write-baseline.`
  );
  const value: unknown = JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
  if (!isRecord(value)) {
    throw malformed;
  }
  const { model, runs, recordedAt, passAll, cases } = value;
  if (
    typeof model !== "string" ||
    typeof runs !== "number" ||
    typeof recordedAt !== "string" ||
    typeof passAll !== "number" ||
    !isRecord(cases)
  ) {
    throw malformed;
  }
  const passes: Record<string, boolean> = {};
  for (const [id, pass] of Object.entries(cases)) {
    if (typeof pass !== "boolean") {
      throw malformed;
    }
    passes[id] = pass;
  }
  return { model, runs, recordedAt, passAll, cases: passes };
}

function printBaselineDelta(
  results: readonly CaseResult[],
  passAll: number
): void {
  const baseline = readBaseline();
  if (baseline === null) {
    console.log("\nNo baseline.json yet. Record one with --write-baseline.");
    return;
  }
  console.log(
    `\nBaseline (${baseline.model}, ${baseline.runs} runs, ${baseline.recordedAt}): pass^k ${percent(baseline.passAll)} -> ${percent(passAll)}`
  );
  for (const result of results) {
    const before = baseline.cases[result.testCase.id];
    const now = passedEveryRun(result);
    if (before === undefined) {
      console.log(`  new     ${result.testCase.id}`);
    } else if (before !== now) {
      console.log(`  ${now ? "fixed  " : "broken "} ${result.testCase.id}`);
    }
  }
}

function writeReport(
  options: Options,
  backend: string,
  recordedAt: string,
  outcomes: readonly Outcome[],
  results: readonly CaseResult[]
): string {
  const report = {
    model: options.model,
    backend,
    effort: options.effort ?? null,
    runs: options.runs,
    recordedAt,
    ...summarise(results),
    usage: totalUsage(outcomes),
    cases: results.map((result) => ({
      id: result.testCase.id,
      request: result.testCase.request,
      expected: result.testCase.command,
      flags: result.testCase.flags ?? [],
      args: result.testCase.args ?? [],
      passAll: passedEveryRun(result),
      runs: outcomes
        .filter((outcome) => outcome.testCase === result.testCase)
        .map((outcome) => ({
          ...outcome.grade,
          stopReason: outcome.answer.stopReason,
          answer: outcome.answer.text,
        })),
    })),
  };
  const resultsDir = join(EVAL_DIR, "results");
  mkdirSync(resultsDir, { recursive: true });
  const reportPath = join(
    resultsDir,
    `${recordedAt.replaceAll(":", "-")}-${options.model}.json`
  );
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
}

function writeBaseline(
  options: Options,
  recordedAt: string,
  overall: Tally,
  results: readonly CaseResult[]
): void {
  const baseline: Baseline & { overall: Tally } = {
    model: options.model,
    runs: options.runs,
    recordedAt,
    passAll: overall.passAll,
    overall,
    cases: Object.fromEntries(
      results.map((result) => [result.testCase.id, passedEveryRun(result)])
    ),
  };
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Baseline written to ${BASELINE_PATH}`);
}

async function main(): Promise<void> {
  const options = parseOptions();
  const cases = selectCases(options.caseIds);
  const surfaces = loadSurfaces();
  const system = buildSystemPrompt(surfaces);
  printEstimate(options, cases, surfaces, system);

  const apiKey = anthropicApiKey();
  const backend = apiKey === undefined ? "claude -p" : "Messages API";
  console.log(
    `Backend: ${backend} (ANTHROPIC_API_KEY is ${apiKey === undefined ? "not set" : "set"})`
  );
  if (options.dryRun) {
    console.log(`Dry run: built ${cases.length} prompts, made no model call.`);
    return;
  }

  const outcomes = await withBackend(
    apiKey,
    system,
    async (call) => await runCases(options, cases, call)
  );
  const results: CaseResult[] = cases.map((testCase) => ({
    testCase,
    grades: outcomes
      .filter((outcome) => outcome.testCase === testCase)
      .map((outcome) => outcome.grade),
  }));
  const answers = cases.map((testCase) =>
    outcomes
      .filter((outcome) => outcome.testCase === testCase)
      .map((outcome) => outcome.answer)
  );

  console.log("");
  printSummary(results, answers, options.runs);
  const recordedAt = new Date().toISOString();
  const reportPath = writeReport(
    options,
    backend,
    recordedAt,
    outcomes,
    results
  );
  const { overall } = summarise(results);
  printBaselineDelta(results, overall.passAll);
  console.log(
    `\nCost: ${usd(totalUsage(outcomes).costUsd)}. Report: ${reportPath}`
  );
  if (options.writeBaseline) {
    writeBaseline(options, recordedAt, overall, results);
  }
}

await main();
