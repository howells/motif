/**
 * Blind **comparative** vision judge — pairwise A/B comparisons plus
 * Bradley-Terry aggregation, the discriminating counterpart to `judge.ts`'s
 * absolute scoring.
 *
 * ## Why this exists
 *
 * Absolute scoring saturates. Measured on a real 20-judgment sweep
 * (`google/gemini-2.5-flash-lite` on fal `any-llm/vision`): **5 distinct
 * verdicts, 14 models byte-identical** — same `overall` of 3.78, same
 * six-criterion level map. "Best quality" was a coin toss inside a 14-way
 * tie, and "Best value" inherited the noise because it divides by quality. A
 * judge shown one image is answering "is this good?", and for modern
 * image models the honest answer is almost always yes. Asking "which of
 * these two is better?" discriminates exactly where absolute scoring cannot.
 *
 * `judge.ts` stays and is still the right tool for a run with fewer than two
 * completed samples — there is nothing to compare against, so a comparative
 * pass is undefined there.
 *
 * ## Purity
 *
 * No `fetch`, no file reads, no fal calls, no clock, no `Math.random`. The
 * pairing plan is a pure function of the sample list plus a caller-supplied
 * numeric seed, so the same run always produces the same comparisons and a
 * re-judge is reproducible. The one seam a real vision model is injected
 * through (`PairJudgeModelClient`) is structurally narrow, same as
 * `judge.ts`'s `JudgeModelClient` and `execute.ts`'s `GenerationClient`.
 *
 * This module is reached through its own subpath (`@motif/bench-core
 * /rank-judge`) rather than the `index.ts` barrel purely because it shares
 * `judge.ts`'s rubric vocabulary and loose-parse helpers, and `judge.ts`
 * pulls in `node:fs` for its own image read — keeping both off the barrel
 * means a dry-run preview never drags Node's `fs` surface in.
 *
 * ## Blindness and the base64 rule
 *
 * Nothing here accepts a model alias, a model name, or a price: a pair is
 * two neutral labels, "A" and "B", and `buildPairJudgePrompt` has no field to
 * smuggle an identity through. Images cross this seam as **remote https
 * URLs** — `assertJudgeableImageUrl` refuses a `data:` URI or inline base64
 * outright (`docs/arc/bench/BRIEF.md` rule 1, the documented 26-second
 * Langfuse regression).
 */

import type { JudgeErrorCode, RoomRubricCriterion } from "./judge";
import {
  extractFirstJsonObject,
  normalizeToken,
  ROOM_RUBRIC_CRITERIA,
  scalarToString,
} from "./judge";

// ---------------------------------------------------------------------------
// Rubric vocabulary
// ---------------------------------------------------------------------------

/**
 * Rubric id + version for the comparative pass. Deliberately a *different*
 * id from `ROOM_RUBRIC_ID`: `bench_judgments` is unique on
 * `(sample, judge, rubric, version)`, so an absolute row and a rank row for
 * the same sample coexist instead of overwriting each other, and a reader can
 * always tell which kind of number `overall` holds. Bump `RANK_RUBRIC_VERSION`
 * alongside any change to the criteria list, the prompt wording, or the
 * aggregation maths, so a mixed-version comparison can never happen silently.
 */
export const RANK_RUBRIC_ID = "bench-room-rank-v1";
export const RANK_RUBRIC_VERSION = 1;

/** Comparisons each sample takes part in. 6 is the point where the pairing
 * graph is dense enough for Bradley-Terry to separate a 24-model field
 * (24 × 6 / 2 = 72 comparisons) while staying an order of magnitude cheaper
 * than the 276 comparisons an all-pairs sweep of the same field would cost. */
export const DEFAULT_COMPARISONS_PER_SAMPLE = 6;

export const PAIR_WINNERS = ["a", "b", "tie"] as const;
export type PairWinner = (typeof PAIR_WINNERS)[number];

/** How decisive the overall call was. `tie` is structurally coupled to
 * `overall === "tie"` by `parsePairVerdictText` — the two can never disagree
 * downstream. */
export const PAIR_STRENGTHS = ["clear", "slight", "tie"] as const;
export type PairStrength = (typeof PAIR_STRENGTHS)[number];

export type PairCriterionWinners = Record<RoomRubricCriterion, PairWinner>;

export interface PairVerdict {
  readonly criteria: PairCriterionWinners;
  readonly critique: string;
  readonly overall: PairWinner;
  readonly strength: PairStrength;
}

// ---------------------------------------------------------------------------
// Deterministic pairing plan
// ---------------------------------------------------------------------------

export interface JudgePair {
  readonly aSampleId: string;
  readonly bSampleId: string;
}

export interface PairingPlanOptions {
  /** Target comparisons per sample. Clamped to `n - 1` (an all-pairs sweep),
   * and reduced by one when `k × n` is odd, because no k-regular graph exists
   * on an odd number of vertices with odd k — one sample would otherwise have
   * to take a comparison nobody else takes. */
  readonly comparisonsPerSample?: number;
  /** Caller-supplied determinism. Same samples + same seed → same plan,
   * always. Never `Math.random`. */
  readonly seed: number;
}

/** 2^31 − 1, the Mersenne prime MINSTD is defined over. Every value derived
 * from it below stays under 2^53, so all of this is exact in a `number` —
 * and expressible without a single bitwise operator, which this repo's lint
 * rules forbid outright. */
const LEHMER_MODULUS = 2_147_483_647;
const LEHMER_MULTIPLIER = 48_271;

/** Polynomial rolling hash over the sample list, so two runs with the same
 * seed but different samples still get different pairings. Hand-rolled rather
 * than `node:crypto` — this module takes no Node dependency. */
const hashSampleList = (text: string): number => {
  let hash = 7;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + (text.codePointAt(index) ?? 0)) % LEHMER_MODULUS;
  }
  return hash;
};

/** MINSTD (Lehmer) — a tiny, fully deterministic PRNG whose entire state is
 * one integer. Statistically unremarkable, and deliberately so: its only job
 * is to shuffle a list of at most a few dozen samples reproducibly. It is the
 * only source of "randomness" in this module; `Math.random` is never called.
 * The state is forced into `[1, m - 1]`, the range Lehmer is defined on — a
 * state of 0 would be a fixed point. */
const createRng = (seed: number): (() => number) => {
  let state = (Math.abs(Math.trunc(seed)) % (LEHMER_MODULUS - 1)) + 1;
  return () => {
    state = (state * LEHMER_MULTIPLIER) % LEHMER_MODULUS;
    return (state - 1) / (LEHMER_MODULUS - 1);
  };
};

const shuffled = <T>(items: readonly T[], rng: () => number): T[] => {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const a = output[index];
    const b = output[swapIndex];
    if (a !== undefined && b !== undefined) {
      output[index] = b;
      output[swapIndex] = a;
    }
  }
  return output;
};

/** Every unordered pair exactly once, A/B alternated by index parity so
 * neither position systematically favours the earlier sample. */
const allPairs = (order: readonly string[]): JudgePair[] => {
  const pairs: JudgePair[] = [];
  for (let i = 0; i < order.length; i += 1) {
    for (let j = i + 1; j < order.length; j += 1) {
      const first = order[i];
      const second = order[j];
      if (first === undefined || second === undefined) {
        continue;
      }
      pairs.push(
        (i + j) % 2 === 0
          ? { aSampleId: first, bSampleId: second }
          : { aSampleId: second, bSampleId: first }
      );
    }
  }
  return pairs;
};

/** Edges `{order[i], order[(i + offset) % n]}` for every `i`. For any
 * `offset` in `[1, floor((n - 1) / 2)]` this yields exactly `n` distinct
 * edges and gives every sample degree 2 — and two different offsets in that
 * range can never produce the same edge, which is what makes "no repeated
 * pairs" structural rather than a de-duplication pass. Each sample appears
 * once as A and once as B per offset, so position bias cancels exactly. */
const circulantPairs = (
  order: readonly string[],
  offset: number
): JudgePair[] =>
  order.flatMap((sampleId, index) => {
    const partner = order[(index + offset) % order.length];
    return partner === undefined
      ? []
      : [{ aSampleId: sampleId, bSampleId: partner }];
  });

/** The `offset = n / 2` perfect matching — only valid for even `n`, and the
 * only way to add a single (odd) comparison to every sample. A/B alternates
 * by index so the first half is not always in position A. */
const matchingPairs = (order: readonly string[]): JudgePair[] => {
  const half = order.length / 2;
  const pairs: JudgePair[] = [];
  for (let index = 0; index < half; index += 1) {
    const first = order[index];
    const second = order[index + half];
    if (first === undefined || second === undefined) {
      continue;
    }
    pairs.push(
      index % 2 === 0
        ? { aSampleId: first, bSampleId: second }
        : { aSampleId: second, bSampleId: first }
    );
  }
  return pairs;
};

/**
 * Deterministic Swiss-style pairing plan: every sample takes part in `k`
 * comparisons, no pair is repeated, and coverage is even by construction
 * (a circulant graph over a seeded permutation of the samples).
 *
 * For n = 24, k = 6: three offsets × 24 edges = **72 comparisons**, each
 * sample in exactly 6, each sample in position A exactly 3 times.
 *
 * Falls back to every possible pair when `k >= n - 1` (i.e. when a full
 * round-robin is no more expensive than the requested coverage), and returns
 * `[]` for fewer than two distinct samples — there is nothing to compare.
 */
export const planPairings = (
  sampleIds: readonly string[],
  options: PairingPlanOptions
): readonly JudgePair[] => {
  const unique = [...new Set(sampleIds)];
  const n = unique.length;
  if (n < 2) {
    return [];
  }

  const rng = createRng(
    hashSampleList(unique.join("|")) + Math.abs(Math.trunc(options.seed))
  );
  const order = shuffled(unique, rng);

  const requested =
    options.comparisonsPerSample ?? DEFAULT_COMPARISONS_PER_SAMPLE;
  let k = Math.min(Math.max(Math.floor(requested), 0), n - 1);
  if ((k * n) % 2 === 1) {
    k -= 1;
  }
  if (k <= 0) {
    return [];
  }
  if (k >= n - 1) {
    return allPairs(order);
  }

  const candidateOffsets = Array.from(
    { length: Math.floor((n - 1) / 2) },
    (_, index) => index + 1
  );
  const chosenOffsets = shuffled(candidateOffsets, rng).slice(
    0,
    Math.floor(k / 2)
  );

  const pairs = chosenOffsets.flatMap((offset) =>
    circulantPairs(order, offset)
  );
  // `k` odd here implies `n` even (the `(k * n) % 2` guard above), so the
  // perfect matching is always well-defined at this point.
  return k % 2 === 1 ? [...pairs, ...matchingPairs(order)] : pairs;
};

// ---------------------------------------------------------------------------
// Loose-parse-then-normalise — same philosophy as judge.ts
// ---------------------------------------------------------------------------

/** Conservative default for a winner field the model omitted or answered
 * unrecognizably: `tie`. Never invents a winner out of sloppy output — a
 * fabricated win would move a Bradley-Terry strength, an extra tie barely
 * does. */
const FALLBACK_WINNER: PairWinner = "tie";

const A_TOKEN = /(?:^|-)(?:a|first|left|one)(?:-|$)/u;
const B_TOKEN = /(?:^|-)(?:b|second|right|two)(?:-|$)/u;

const normalizePairWinner = (value: unknown): PairWinner => {
  const token = normalizeToken(scalarToString(value) ?? "");
  if (token === "") {
    return FALLBACK_WINNER;
  }
  if (A_TOKEN.test(token)) {
    return "a";
  }
  if (B_TOKEN.test(token)) {
    return "b";
  }
  return FALLBACK_WINNER;
};

/** `slight` is the fallback, not `clear` — an unparseable strength should
 * make the weaker claim, never the stronger one. `tie` is forced whenever the
 * overall winner is a tie, so the two fields can never disagree. */
const CLEAR_STRENGTH_TOKENS = ["clear", "decisive", "strong", "obvious"];

const normalizePairStrength = (
  value: unknown,
  winner: PairWinner
): PairStrength => {
  if (winner === "tie") {
    return "tie";
  }
  const token = normalizeToken(scalarToString(value) ?? "");
  return CLEAR_STRENGTH_TOKENS.some((candidate) => token.includes(candidate))
    ? "clear"
    : "slight";
};

/**
 * Accepts sloppy model output (wrong case, synonyms, markdown fences, a
 * preamble before the JSON, missing fields) and always returns a fully
 * populated, strict `PairVerdict` — never throws on formatting. Returns
 * `null` only when no JSON object could be found at all, which the caller
 * maps to `INVALID_VERDICT`.
 */
export const parsePairVerdictText = (text: string): PairVerdict | null => {
  const jsonText = extractFirstJsonObject(text);
  if (jsonText === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowed by the object/null check directly above; every read below goes through `normalizePairWinner`/`normalizePairStrength`/`scalarToString`, which treat the value as `unknown` regardless
  const record = parsed as Record<string, unknown>;

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- built from `ROOM_RUBRIC_CRITERIA` itself, so every key is present; `normalizePairWinner` guarantees each value is a `PairWinner`
  const criteria = Object.fromEntries(
    ROOM_RUBRIC_CRITERIA.map((criterion) => [
      criterion,
      normalizePairWinner(record[criterion]),
    ])
  ) as PairCriterionWinners;

  const overall = normalizePairWinner(record.overall);

  return {
    criteria,
    critique:
      scalarToString(record.critique) ??
      "No critique provided by the judge model.",
    overall,
    strength: normalizePairStrength(record.strength, overall),
  };
};

// ---------------------------------------------------------------------------
// Bradley-Terry aggregation
// ---------------------------------------------------------------------------

export interface PairOutcome {
  readonly aSampleId: string;
  readonly bSampleId: string;
  readonly overall: PairWinner;
  readonly strength: PairStrength;
}

export interface RankedSample {
  readonly comparisons: number;
  readonly losses: number;
  /** 1-based, densest-first, over samples that actually got compared. `null`
   * for a sample with zero completed comparisons — never a fabricated last
   * place. */
  readonly rank: number | null;
  /** Bradley-Terry strength, normalised so the mean over ranked samples is
   * 1.0 — so 1.42 reads directly as "42% above the field's average
   * strength". `null` when the sample completed no comparisons. */
  readonly rankScore: number | null;
  readonly sampleId: string;
  readonly ties: number;
  readonly wins: number;
}

export interface RankResult {
  readonly rankedCount: number;
  readonly samples: readonly RankedSample[];
}

/** A `slight` win is worth 0.75 of a win to the winner and 0.25 to the
 * loser; a `clear` win is 1/0; a tie is half a win each. */
const SLIGHT_WIN_SHARE = 0.75;

const winShareFor = (outcome: PairOutcome): { a: number; b: number } => {
  if (outcome.overall === "tie") {
    return { a: 0.5, b: 0.5 };
  }
  const winnerShare = outcome.strength === "slight" ? SLIGHT_WIN_SHARE : 1;
  return outcome.overall === "a"
    ? { a: winnerShare, b: 1 - winnerShare }
    : { a: 1 - winnerShare, b: winnerShare };
};

/** Iteration cap for the MM fixed point. Convergence is typically reached in
 * well under 50 sweeps at this scale; the cap exists so a pathological
 * outcome set can never spin. */
const MAX_BT_ITERATIONS = 200;
const BT_CONVERGENCE_EPSILON = 1e-9;

/** One virtual comparison (half a win, half a loss) against a phantom
 * opponent of strength 1. Without it the MLE is unbounded for a sample that
 * won every one of its comparisons — its strength diverges and the whole
 * normalised field collapses toward zero around it. This is the standard
 * smoothing prior, and at 1 virtual comparison against 6 real ones it barely
 * moves a well-connected sample. */
const PRIOR_COMPARISONS = 1;
const PHANTOM_STRENGTH = 1;

interface Tally {
  comparisons: number;
  losses: number;
  ties: number;
  weightedWins: number;
  wins: number;
}

const emptyTally = (): Tally => ({
  comparisons: 0,
  losses: 0,
  ties: 0,
  weightedWins: 0,
  wins: 0,
});

const buildTallies = (
  sampleIds: readonly string[],
  outcomes: readonly PairOutcome[]
): {
  opponents: Map<string, Map<string, number>>;
  tallies: Map<string, Tally>;
} => {
  const tallies = new Map(sampleIds.map((id) => [id, emptyTally()]));
  const opponents = new Map(
    sampleIds.map((id) => [id, new Map<string, number>()])
  );

  for (const outcome of outcomes) {
    const a = tallies.get(outcome.aSampleId);
    const b = tallies.get(outcome.bSampleId);
    const aOpponents = opponents.get(outcome.aSampleId);
    const bOpponents = opponents.get(outcome.bSampleId);
    if (!a || !b || !aOpponents || !bOpponents) {
      continue; // an outcome naming a sample outside this run — ignore it
    }

    const share = winShareFor(outcome);
    a.comparisons += 1;
    b.comparisons += 1;
    a.weightedWins += share.a;
    b.weightedWins += share.b;
    if (outcome.overall === "tie") {
      a.ties += 1;
      b.ties += 1;
    } else if (outcome.overall === "a") {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }

    aOpponents.set(
      outcome.bSampleId,
      (aOpponents.get(outcome.bSampleId) ?? 0) + 1
    );
    bOpponents.set(
      outcome.aSampleId,
      (bOpponents.get(outcome.aSampleId) ?? 0) + 1
    );
  }

  return { opponents, tallies };
};

/** Minorization-maximization fixed point for Bradley-Terry strengths, run
 * simultaneously (Jacobi-style) over every participant, then normalised so
 * the mean strength is 1. */
/** One MM sweep, computed against the previous iterate for every participant
 * (Jacobi-style) and then normalised so the mean strength is 1. */
const bradleyTerrySweep = (
  participants: readonly string[],
  tallies: ReadonlyMap<string, Tally>,
  opponents: ReadonlyMap<string, ReadonlyMap<string, number>>,
  strengths: ReadonlyMap<string, number>
): Map<string, number> => {
  const next = new Map<string, number>();
  for (const id of participants) {
    const own = strengths.get(id) ?? 1;
    let denominator = PRIOR_COMPARISONS / (own + PHANTOM_STRENGTH);
    for (const [opponentId, count] of opponents.get(id) ?? []) {
      denominator += count / (own + (strengths.get(opponentId) ?? 1));
    }
    const numerator =
      (tallies.get(id)?.weightedWins ?? 0) + PRIOR_COMPARISONS * 0.5;
    next.set(id, denominator === 0 ? own : numerator / denominator);
  }

  const mean =
    [...next.values()].reduce((sum, value) => sum + value, 0) /
    Math.max(next.size, 1);
  if (mean > 0) {
    for (const [id, value] of next) {
      next.set(id, value / mean);
    }
  }
  return next;
};

const maxAbsoluteDelta = (
  participants: readonly string[],
  next: ReadonlyMap<string, number>,
  previous: ReadonlyMap<string, number>
): number => {
  let delta = 0;
  for (const id of participants) {
    delta = Math.max(
      delta,
      Math.abs((next.get(id) ?? 0) - (previous.get(id) ?? 0))
    );
  }
  return delta;
};

const solveBradleyTerry = (
  participants: readonly string[],
  tallies: ReadonlyMap<string, Tally>,
  opponents: ReadonlyMap<string, ReadonlyMap<string, number>>
): Map<string, number> => {
  let strengths = new Map(participants.map((id) => [id, 1]));

  for (let iteration = 0; iteration < MAX_BT_ITERATIONS; iteration += 1) {
    const next = bradleyTerrySweep(participants, tallies, opponents, strengths);
    const delta = maxAbsoluteDelta(participants, next, strengths);
    strengths = next;
    if (delta < BT_CONVERGENCE_EPSILON) {
      break;
    }
  }

  return strengths;
};

/**
 * Aggregates pair outcomes into per-sample Bradley-Terry strengths and ranks.
 *
 * A sample with zero completed comparisons gets `rankScore: null` and
 * `rank: null` — never a fabricated number and never a fabricated last place
 * (`docs/arc/bench/BRIEF.md`'s "`null` ≠ 0" discipline, applied to quality).
 * A failed pair is simply absent from `outcomes`; it is never fatal.
 */
export const rankSamples = (
  sampleIds: readonly string[],
  outcomes: readonly PairOutcome[]
): RankResult => {
  const unique = [...new Set(sampleIds)];
  const { opponents, tallies } = buildTallies(unique, outcomes);
  const participants = unique.filter(
    (id) => (tallies.get(id)?.comparisons ?? 0) > 0
  );

  const strengths =
    participants.length === 0
      ? new Map<string, number>()
      : solveBradleyTerry(participants, tallies, opponents);

  const ordered = [...participants].sort(
    (left, right) => (strengths.get(right) ?? 0) - (strengths.get(left) ?? 0)
  );
  const rankById = new Map(ordered.map((id, index) => [id, index + 1]));

  return {
    rankedCount: participants.length,
    samples: unique.map((sampleId) => {
      const tally = tallies.get(sampleId) ?? emptyTally();
      return {
        comparisons: tally.comparisons,
        losses: tally.losses,
        rank: rankById.get(sampleId) ?? null,
        rankScore: strengths.get(sampleId) ?? null,
        sampleId,
        ties: tally.ties,
        wins: tally.wins,
      };
    }),
  };
};

// ---------------------------------------------------------------------------
// judgePair — the injected-client seam
// ---------------------------------------------------------------------------

export const buildPairJudgePrompt = (prompt: string): string =>
  `You are a blind comparative judge for AI-generated room-interior images. You are shown exactly two images: the FIRST image is "A" and the SECOND image is "B". You do not know which model produced either image and must not try to guess — compare only what you can see.

Both images were generated from this same brief:
"${prompt}"

For EACH of the following six criteria, say which image is better. Answer with exactly one of: A, B, tie.
- promptAdherence: which image matches the brief above more closely?
- photorealism: which reads more like a real photograph and less like an obviously synthetic render?
- artifacts: which is freer of AI artifacts (warped geometry, garbled text, melted objects, impossible joins)?
- lightingCoherence: which has more physically consistent lighting — one coherent light direction, believable shadows and reflections?
- spatialPlausibility: which room geometry and furniture arrangement is more physically plausible?
- materialFidelity: in which do materials (wood, fabric, metal, stone) look more like their real-world counterparts rather than painted-on textures?

Then give the overall winner (A, B, or tie) and how decisive that call is: "clear" if one image is plainly better, "slight" if it is a narrow call, "tie" if they are genuinely equivalent.

Do not favour an image because of its position. Reason briefly to yourself, then output exactly one JSON object and nothing else (no markdown fences, no prose before or after) with exactly these keys:
{"promptAdherence": "...", "photorealism": "...", "artifacts": "...", "lightingCoherence": "...", "spatialPlausibility": "...", "materialFidelity": "...", "overall": "...", "strength": "...", "critique": "one or two sentences"}`;

export interface PairJudgeModelCallInput {
  readonly imageUrlA: string;
  readonly imageUrlB: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
}

/** The seam a real vision-model call is injected through — structurally
 * narrow, the same shape as `judge.ts`'s `JudgeModelClient`, so tests never
 * touch a real vision model. Both images are passed as **URLs**, which is why
 * one comparative judgment is a single provider call carrying both. */
export interface PairJudgeModelClient {
  readonly generatePairJudgeText: (
    input: PairJudgeModelCallInput
  ) => Promise<string>;
}

export interface JudgePairInput {
  readonly imageUrlA: string;
  readonly imageUrlB: string;
  readonly prompt: string;
  readonly signal?: AbortSignal;
}

export interface JudgedPair {
  readonly rubricId: string;
  readonly rubricVersion: number;
  readonly status: "judged";
  readonly verdict: PairVerdict;
}

export interface InconclusivePair {
  readonly errorCode: JudgeErrorCode;
  /** Bounded, newline-flattened sample of unparseable judge output — set
   * only on INVALID_VERDICT, for diagnosing the parser against what the
   * model actually said. Judge output only; never our prompt, never a URL. */
  readonly rawSample?: string;
  readonly status: "inconclusive";
}

export type PairJudgmentResult = InconclusivePair | JudgedPair;

/** `BRIEF.md` rule 1, enforced at the seam rather than trusted: a `data:`
 * URI or a bare base64 blob must never reach a request payload or a span, so
 * only an absolute `http(s)` URL is judgeable. */
export const assertJudgeableImageUrl = (url: string): void => {
  if (!/^https?:\/\//iu.test(url)) {
    throw new Error(
      "Comparative judge image must be an absolute http(s) URL — refusing a data: URI or inline base64."
    );
  }
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error &&
  (error.name === "AbortError" || /\babort/iu.test(error.message));

/**
 * Judges one pair. Never throws: every failure mode (a non-URL image, a
 * client that throws or times out, unparseable model output) resolves to
 * `{ status: "inconclusive", errorCode }`. A failed pair is simply dropped
 * from the aggregation — it is never fatal to the run.
 */
export const judgePair = async (
  client: PairJudgeModelClient,
  input: JudgePairInput
): Promise<PairJudgmentResult> => {
  try {
    assertJudgeableImageUrl(input.imageUrlA);
    assertJudgeableImageUrl(input.imageUrlB);
  } catch {
    return { errorCode: "IMAGE_READ_FAILED", status: "inconclusive" };
  }

  let text: string;
  try {
    text = await client.generatePairJudgeText({
      imageUrlA: input.imageUrlA,
      imageUrlB: input.imageUrlB,
      prompt: buildPairJudgePrompt(input.prompt),
      signal: input.signal,
    });
  } catch (error) {
    return {
      errorCode: isAbortError(error) ? "TIMEOUT" : "JUDGE_UNAVAILABLE",
      status: "inconclusive",
    };
  }

  const verdict = parsePairVerdictText(text);
  if (verdict === null) {
    // Carry a bounded, newline-flattened sample of what the model actually
    // said: 10 of 54 real pairs failed here and the raw text was discarded,
    // leaving nothing to diagnose the parser against. Judge output only —
    // never our prompt, never a URL.
    return {
      errorCode: "INVALID_VERDICT",
      rawSample: text.replaceAll(/\s+/gu, " ").trim().slice(0, 220),
      status: "inconclusive",
    };
  }

  return {
    rubricId: RANK_RUBRIC_ID,
    rubricVersion: RANK_RUBRIC_VERSION,
    status: "judged",
    verdict,
  };
};
