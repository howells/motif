/**
 * Grading for the routing eval. Pulls the first `motif` invocation out of a
 * model's answer, names the command it routes to, and checks the flags and
 * arguments the case requires. String matching only, no model grading.
 */

/** One request in the user's words, and what a correct first command holds. */
export interface RoutingCase {
  readonly id: string;
  readonly request: string;
  /**
   * The command key from `motif --describe tasks`, or several when more than
   * one is right.
   */
  readonly command: string | readonly string[];
  /**
   * Flags the command must carry, as `--flag` or `--flag value`. An array
   * entry passes when any one of its alternatives does.
   */
  readonly flags?: readonly (string | readonly string[])[];
  /** Arguments the command must name, such as the image path. */
  readonly args?: readonly string[];
  /** The audit finding or plan line the case tests. */
  readonly source: string;
}

export interface Grade {
  /** The first motif invocation in the answer, or null when there is none. */
  readonly invocation: string | null;
  readonly command: string | null;
  readonly commandOk: boolean;
  readonly missingFlags: readonly string[];
  readonly missingArgs: readonly string[];
  readonly pass: boolean;
}

const MOTIF_LINE = /^(?:\$\s+)?motif(?:\s|$)/;
const PROMPT_MARK = /^\$\s+/;
const FENCE = /```[^\n]*\n([\s\S]*?)```/g;
const INLINE_CODE = /`([^`\n]+)`/g;
const LINE_CONTINUATION = /\\\r?\n/g;
const NEWLINE = /\r?\n/;
const WHITESPACE = /\s/;
const DIGIT = /^\d$/;

/** Lines of shell text, with backslash continuations joined. */
function shellLines(text: string): string[] {
  return text
    .replace(LINE_CONTINUATION, " ")
    .split(NEWLINE)
    .map((line) => line.trim());
}

function firstMotifLine(lines: readonly string[]): string | null {
  const line = lines.find((candidate) => MOTIF_LINE.test(candidate));
  return line === undefined ? null : line.replace(PROMPT_MARK, "");
}

/**
 * The first motif invocation in an answer: from a fenced code block if any
 * has one, then inline code, then a bare line.
 */
export function extractInvocation(answer: string): string | null {
  for (const match of answer.matchAll(FENCE)) {
    const line = firstMotifLine(shellLines(match[1] ?? ""));
    if (line !== null) {
      return line;
    }
  }
  const prose = answer.replace(FENCE, "");
  for (const match of prose.matchAll(INLINE_CODE)) {
    const line = firstMotifLine([(match[1] ?? "").trim()]);
    if (line !== null) {
      return line;
    }
  }
  return firstMotifLine(shellLines(prose));
}

/**
 * Shell words of one command line, unquoted. Stops at a pipe, list operator,
 * redirect or comment, since only the first command counts.
 */
export function shellWords(line: string): string[] {
  const words: string[] = [];
  let word = "";
  let started = false;
  let quote: string | null = null;
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      word += char;
      escaped = false;
    } else if (quote === "'") {
      if (char === "'") {
        quote = null;
      } else {
        word += char;
      }
    } else if (char === "\\") {
      escaped = true;
      started = true;
    } else if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else {
        word += char;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (WHITESPACE.test(char)) {
      if (started) {
        words.push(word);
        word = "";
        started = false;
      }
    } else if ((char === "#" && !started) || "|;&<>".includes(char)) {
      if (char === ">" && DIGIT.test(word)) {
        started = false;
      }
      break;
    } else {
      word += char;
      started = true;
    }
  }
  if (started) {
    words.push(word);
  }
  return words;
}

/** Short flags spelled long, so a case can name either. */
const FLAG_ALIASES: Readonly<Record<string, string>> = {
  "-a": "--aspect",
  "-e": "--edit",
  "-m": "--model",
  "-n": "--num",
  "-o": "--output",
  "-r": "--resolution",
};

/** Words with `--flag=value` split in two and short flags spelled long. */
function normaliseWords(words: readonly string[]): string[] {
  return words.flatMap((word) => {
    const equals = word.indexOf("=");
    const parts =
      word.startsWith("--") && equals !== -1
        ? [word.slice(0, equals), word.slice(equals + 1)]
        : [word];
    return parts.map((part) => FLAG_ALIASES[part] ?? part);
  });
}

/** Commands routed on the first argument. */
const SUBCOMMANDS = new Set([
  "ask",
  "enhance",
  "erase",
  "layers",
  "reframe",
  "segment",
  "sheet",
  "studio",
  "tool",
  "vectorize",
]);

/** Commands routed by a flag on the bare `motif` command. */
const FLAG_COMMANDS: readonly (readonly [string, string])[] = [
  ["--vary", "vary"],
  ["--up", "upscale"],
  ["--rmbg", "rmbg"],
  ["--video", "video"],
  ["--last", "last"],
  ["--history", "history"],
];

/**
 * The `--describe tasks` command key a motif invocation routes to, or null
 * when the words aren't a motif invocation.
 */
export function commandOf(words: readonly string[]): string | null {
  if (words[0] !== "motif") {
    return null;
  }
  const [, first, second] = words;
  if (first === "series") {
    return second === "run" ? "series run" : "series";
  }
  if (first !== undefined && SUBCOMMANDS.has(first)) {
    return first;
  }
  const describeAt = words.indexOf("--describe");
  if (describeAt !== -1) {
    return words[describeAt + 1] === "errors" ? "errors" : "describe";
  }
  const flagCommand = FLAG_COMMANDS.find(([flag]) => words.includes(flag));
  return flagCommand === undefined ? "generate" : flagCommand[1];
}

function hasFlag(words: readonly string[], requirement: string): boolean {
  const space = requirement.indexOf(" ");
  const name = space === -1 ? requirement : requirement.slice(0, space);
  const value = space === -1 ? null : requirement.slice(space + 1);
  const flag = FLAG_ALIASES[name] ?? name;
  return words.some(
    (word, index) =>
      word === flag && (value === null || words[index + 1] === value)
  );
}

function hasArg(words: readonly string[], arg: string): boolean {
  return words
    .slice(1)
    .some(
      (word) =>
        word === arg || word.endsWith(`/${arg}`) || word.endsWith(`=${arg}`)
    );
}

/** The expected command or commands, as one label. */
export function expectedCommandLabel(testCase: RoutingCase): string {
  return typeof testCase.command === "string"
    ? testCase.command
    : testCase.command.join(" | ");
}

export function grade(testCase: RoutingCase, answer: string): Grade {
  const invocation = extractInvocation(answer);
  const words =
    invocation === null ? [] : normaliseWords(shellWords(invocation));
  const command = commandOf(words);
  const expected: readonly string[] =
    typeof testCase.command === "string"
      ? [testCase.command]
      : testCase.command;
  const commandOk = command !== null && expected.includes(command);
  const missingFlags = (testCase.flags ?? [])
    .map((requirement) =>
      typeof requirement === "string" ? [requirement] : requirement
    )
    .filter((alternatives) => !alternatives.some((alt) => hasFlag(words, alt)))
    .map((alternatives) => alternatives.join(" | "));
  const missingArgs = (testCase.args ?? []).filter(
    (arg) => !hasArg(words, arg)
  );
  return {
    invocation,
    command,
    commandOk,
    missingFlags,
    missingArgs,
    pass: commandOk && missingFlags.length === 0 && missingArgs.length === 0,
  };
}

/** Every graded run of one case. */
export interface CaseResult {
  readonly testCase: RoutingCase;
  readonly grades: readonly Grade[];
}

export interface Tally {
  readonly cases: number;
  readonly runs: number;
  readonly passed: number;
  /** Passing runs over all runs. */
  readonly accuracy: number;
  /** Cases where every run passed, over all cases: pass^k. */
  readonly passAll: number;
}

export function passedEveryRun(result: CaseResult): boolean {
  return result.grades.length > 0 && result.grades.every((g) => g.pass);
}

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

function tally(results: readonly CaseResult[]): Tally {
  const grades = results.flatMap((result) => result.grades);
  const passed = grades.filter((g) => g.pass).length;
  return {
    cases: results.length,
    runs: grades.length,
    passed,
    accuracy: ratio(passed, grades.length),
    passAll: ratio(results.filter(passedEveryRun).length, results.length),
  };
}

/** Overall accuracy and accuracy per expected command, commands sorted. */
export function summarise(results: readonly CaseResult[]): {
  overall: Tally;
  byCommand: Record<string, Tally>;
} {
  const groups = new Map<string, CaseResult[]>();
  for (const result of results) {
    const label = expectedCommandLabel(result.testCase);
    groups.set(label, [...(groups.get(label) ?? []), result]);
  }
  return {
    overall: tally(results),
    byCommand: Object.fromEntries(
      [...groups.keys()]
        .sort()
        .map((label) => [label, tally(groups.get(label) ?? [])])
    ),
  };
}
