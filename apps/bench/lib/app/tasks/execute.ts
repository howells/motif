/**
 * The worker that takes a reserved Generation to its end.
 *
 * Every step is driven by the row in the database, never by memory: a worker
 * takes a lease on the row, does the next step its status calls for and
 * writes the result back. If a worker stops, the lease runs out and the next
 * poll of that Generation starts another, which carries on from the row.
 *
 * Spending rules, in order of importance:
 *
 * - The provider is called only from `reserved`, after moving the row to
 *   `submitting` in a statement only one worker can win. A run is never sent
 *   twice, and a retry is a new run with a new hold.
 * - The provider is called only if planning with the real images reaches the
 *   Model, endpoint and ceiling that were held.
 * - A hold is released, at zero, only when the provider refused the request
 *   before accepting it. Any other failure keeps the whole bound counted:
 *   a timeout, a dropped connection, an error after acceptance, or a worker
 *   that stopped between sending and recording the request id.
 * - Once fal has the run (a request id is recorded) the worker only ever
 *   reads it back with `resume`; waiting longer than one route allows leaves
 *   the row `submitted` for the next worker.
 */
import { createMotif } from "@howells/motif-sdk";
import type { MotifClient, TaskOutput } from "@howells/motif-sdk";
import type { AppSql } from "@motif/bench-db/app-sql";

import { boundFor } from "../budget/bounds";
import { assetDataUrl, getOwnedAssets, storeAsset } from "../media/assets";
import type { Asset } from "../media/assets";
import {
  ProviderDownloadError,
  downloadProviderFile,
} from "../media/provider-download";
import { inspectOutput } from "../media/validate";
import { boundContextOf } from "./plan";
import { TaskRequestSchema, assetIdsOf, toTaskInput } from "./request";
import type { AppTaskRequest, ResolvedImages } from "./request";
import {
  claimLease,
  endGeneration,
  recordSubmitted,
  releaseLease,
  getOwnedGeneration,
  markSubmitting,
} from "./store";
import type { Generation } from "./store";

export interface WorkerDeps {
  readonly client: Pick<MotifClient, "plan" | "resume" | "run">;
  readonly dataUrl: (asset: Asset) => Promise<string>;
  readonly download: (url: string) => Promise<Uint8Array>;
  readonly store: typeof storeAsset;
  readonly now: () => number;
}

/** What the worker tells a caller who is watching, as it happens. The worker
 * behaves the same with or without one. */
export type WorkerEvent =
  | { readonly kind: "sending" }
  | { readonly kind: "accepted"; readonly requestId: string }
  | {
      readonly kind: "queue";
      readonly status: string;
      readonly queuePosition: number | undefined;
    }
  /** fal was asked again and nothing had changed. */
  | {
      readonly kind: "polled";
      readonly status: string;
      readonly queuePosition: number | undefined;
    }
  /** Lines fal wrote since the last poll. */
  | { readonly kind: "logs"; readonly lines: readonly string[] }
  | { readonly kind: "downloading"; readonly count: number }
  | {
      readonly kind: "stored";
      readonly count: number;
      readonly width: number;
      readonly height: number;
      readonly bytes: number;
    };

export type WorkerObserver = (event: WorkerEvent) => void | Promise<void>;

type Notify = (event: WorkerEvent) => void;

const ignore: Notify = () => {
  // Nobody is watching.
};

/** Hands events to an observer one after another, off the worker's path.
 * The observer only narrates: its failure is logged and never fails the
 * Generation, which may already have been paid for. */
const notifier = (observe: WorkerObserver | undefined) => {
  let chain: Promise<void> = Promise.resolve();
  let logged = false;
  const deliver = async (
    before: Promise<void>,
    watcher: WorkerObserver,
    event: WorkerEvent
  ): Promise<void> => {
    // `before` never rejects: every delivery handles its own failure.
    await before;
    try {
      await watcher(event);
    } catch (error) {
      if (!logged) {
        logged = true;
        console.error("[generation] a progress observer failed", error);
      }
    }
  };
  const notify: Notify =
    observe === undefined
      ? ignore
      : (event) => {
          chain = deliver(chain, observe, event);
        };
  /** Wait for what has been handed over; never raises. */
  const drain = async () => {
    await chain;
  };
  return { drain, notify };
};

/** Report fal's queue when its status or place in line changes, say so when
 * it was asked and nothing had, and pass on new log lines. */
const queueReporter = (notify: Notify) => {
  let status: string | undefined;
  let position: number | undefined;
  return (
    next: string,
    queuePosition?: number,
    logs?: readonly { readonly message: string }[]
  ) => {
    if (next === status && queuePosition === position) {
      notify({ kind: "polled", queuePosition, status: next });
    } else {
      status = next;
      position = queuePosition;
      notify({ kind: "queue", queuePosition, status: next });
    }
    const lines = (logs ?? []).flatMap((line) => {
      const message = line.message.trim();
      return message === "" ? [] : [message];
    });
    if (lines.length > 0) {
      notify({ kind: "logs", lines });
    }
  };
};

export const liveWorkerDeps = (falKey: string): WorkerDeps => ({
  client: createMotif({ falKey }),
  dataUrl: assetDataUrl,
  download: async (url) => await downloadProviderFile(url),
  now: () => Date.now(),
  store: storeAsset,
});

/** HTTP statuses that mean fal refused the request outright, before
 * accepting it, so nothing ran and nothing is billed. */
const REFUSED_BEFORE_ACCEPTANCE = new Set([
  400, 401, 403, 404, 409, 413, 415, 422, 429,
]);

const QUEUE_TIMEOUT = "Queued run timed out";

/** Largest non-file result the App keeps, as JSON characters. */
const DATA_LIMIT = 20_000;

const NOTE = "worked out by the SDK from fal's listed rate, not a fal invoice";

interface ErrorFacts {
  readonly code: string | undefined;
  readonly message: string;
  readonly status: number;
}

const factsOf = (error: unknown): ErrorFacts => {
  if (error instanceof Error) {
    const status =
      "status" in error && typeof error.status === "number" ? error.status : 0;
    const code =
      "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    return { code, message: error.message, status };
  }
  return { code: undefined, message: String(error), status: 0 };
};

const requestOf = (generation: Generation): AppTaskRequest =>
  TaskRequestSchema.parse(generation.input);

/** The real images for a run, as data URLs, owned by its owner. */
const realImages = async (
  sql: AppSql,
  generation: Generation,
  request: AppTaskRequest,
  deps: WorkerDeps
): Promise<{
  images: ResolvedImages;
  assets: { source: Asset | null; references: Asset[] };
} | null> => {
  const named = assetIdsOf(request);
  const ids = [
    ...(named.source === undefined ? [] : [named.source]),
    ...(named.mask === undefined ? [] : [named.mask]),
    ...named.references,
  ];
  const assets = await getOwnedAssets(sql, generation.ownerId, ids);
  if (assets === null) {
    return null;
  }
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const source =
    named.source === undefined ? null : (byId.get(named.source) ?? null);
  const mask = named.mask === undefined ? null : (byId.get(named.mask) ?? null);
  const references = named.references.flatMap((id) => {
    const asset = byId.get(id);
    return asset === undefined ? [] : [asset];
  });
  return {
    assets: { references, source },
    images: {
      ...(mask !== null && { mask: await deps.dataUrl(mask) }),
      references: await Promise.all(
        references.map(async (asset) => await deps.dataUrl(asset))
      ),
      ...(source !== null && {
        source: {
          height: source.height,
          url: await deps.dataUrl(source),
          width: source.width,
        },
      }),
    },
  };
};

const IMAGE_KEYS = new Set(["image", "images"]);

/** Download failures a later attempt can't fix. */
const PERMANENT_DOWNLOAD_FAILURES = new Set([
  "BAD_REDIRECT",
  "OUTPUT_TOO_LARGE",
  "TOO_MANY_REDIRECTS",
  "UNTRUSTED_OUTPUT_URL",
]);

class UnusableOutputError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "UnusableOutputError";
  }
}

/** Store every image the run returned and settle its hold. */
const complete = async (
  sql: AppSql,
  generation: Generation,
  output: TaskOutput,
  deps: WorkerDeps,
  leaseToken: string,
  notify: Notify
): Promise<void> => {
  const files = output.files.filter((file) => IMAGE_KEYS.has(file.key));
  if (files.length === 0) {
    await endGeneration(
      sql,
      generation.id,
      ["submitting", "submitted", "failed"],
      {
        cost: {
          basis: "No image came back, so the cost can't be known",
          kind: "retained",
        },
        errorCode: "NO_IMAGE",
        errorMessage: "fal finished the run but returned no image.",
        status: "failed",
      },
      leaseToken
    );
    return;
  }
  let stored: string[];
  const seen: { width: number; height: number; bytes: number }[] = [];
  notify({ count: files.length, kind: "downloading" });
  try {
    stored = await Promise.all(
      files.map(async (file) => {
        const bytes = await deps.download(file.url);
        const facts = await inspectOutput(bytes);
        if (facts === null) {
          throw new UnusableOutputError(
            "NOT_AN_IMAGE",
            "The result wasn't an image the App can keep."
          );
        }
        const asset = await deps.store(sql, {
          bytes,
          contentType: facts.contentType,
          height: facts.height,
          kind: "output",
          ownerId: generation.ownerId,
          width: facts.width,
        });
        seen.push({
          bytes: bytes.byteLength,
          height: facts.height,
          width: facts.width,
        });
        return asset.id;
      })
    );
    const [first] = seen;
    if (first !== undefined) {
      notify({ count: stored.length, kind: "stored", ...first });
    }
  } catch (error) {
    // A result that can never be kept ends the run; anything else (a dropped
    // download, storage briefly away) leaves it for the next worker to resume.
    const unusable =
      error instanceof UnusableOutputError ||
      (error instanceof ProviderDownloadError &&
        PERMANENT_DOWNLOAD_FAILURES.has(error.code));
    if (!unusable) {
      throw error;
    }
    await endGeneration(
      sql,
      generation.id,
      ["submitting", "submitted", "failed"],
      {
        cost: {
          basis:
            "fal finished the run, so the whole hold is counted until a cost is recorded",
          kind: "retained",
        },
        errorCode: error.code,
        errorMessage: error.message,
        status: "failed",
      },
      leaseToken
    );
    return;
  }
  const data = JSON.stringify(output.data);
  const usd = output.cost.usd;
  const cost =
    usd !== null &&
    output.cost.basis !== "unknown" &&
    Number.isFinite(usd) &&
    usd >= 0
      ? {
          basis: `${output.cost.basis}, ${NOTE}`,
          kind: "settled" as const,
          micros: Math.ceil(usd * 1_000_000),
        }
      : {
          basis:
            "fal reports no price for this run, so the hold is counted as an estimate",
          kind: "retained" as const,
        };
  await endGeneration(
    sql,
    generation.id,
    ["submitting", "submitted", "failed"],
    {
      cost,
      data: data.length <= DATA_LIMIT ? output.data : {},
      outputAssetIds: stored,
      providerMs:
        generation.submittedAt === null
          ? undefined
          : Math.max(0, deps.now() - generation.submittedAt.getTime()),
      status: "completed",
    },
    leaseToken
  );
};

/** A failure after fal accepted the run: kept resumable for a timeout,
 * otherwise failed with the whole bound counted, since fal may bill it. */
const afterAcceptance = async (
  sql: AppSql,
  generation: Generation,
  error: unknown,
  leaseToken: string
): Promise<void> => {
  const facts = factsOf(error);
  if (facts.message === QUEUE_TIMEOUT) {
    return;
  }
  await endGeneration(
    sql,
    generation.id,
    ["submitting", "submitted"],
    {
      cost: {
        basis:
          "fal accepted the run, so the whole hold is counted until a cost is recorded",
        kind: "retained",
      },
      errorCode: facts.code ?? "PROVIDER_FAILED",
      errorMessage: facts.message.slice(0, 500),
      status: "failed",
    },
    leaseToken
  );
};

const submit = async (
  sql: AppSql,
  generation: Generation,
  deps: WorkerDeps,
  leaseToken: string,
  notify: Notify
): Promise<void> => {
  const request = requestOf(generation);
  const resolved = await realImages(sql, generation, request, deps);
  const refuse = async (code: string, message: string) => {
    await endGeneration(
      sql,
      generation.id,
      ["reserved"],
      {
        cost: { basis: "Nothing was sent to fal", kind: "released" },
        errorCode: code,
        errorMessage: message,
        status: "failed",
      },
      leaseToken
    );
  };
  if (resolved === null) {
    await refuse(
      "IMAGE_NOT_FOUND",
      "One of the images is no longer in the Library."
    );
    return;
  }
  const input = toTaskInput(request, resolved.images, generation.model);
  const plan = deps.client.plan(request.task, input);
  if (plan.isErr()) {
    await refuse("PLAN_FAILED", plan.error.message);
    return;
  }
  if (
    plan.value.model !== generation.model ||
    plan.value.endpoint !== generation.endpoint
  ) {
    await refuse(
      "PLAN_CHANGED",
      "Motif would now choose a different Model, so nothing was sent."
    );
    return;
  }
  const bound = boundFor(
    { ...plan.value, task: request.task },
    boundContextOf({
      mask: null,
      parent: null,
      references: resolved.assets.references,
      source: resolved.assets.source,
    })
  );
  if (bound.kind !== "bounded" || bound.micros > generation.boundMicros) {
    await refuse(
      "BOUND_CHANGED",
      "This run could now cost more than was held, so nothing was sent."
    );
    return;
  }
  if (!(await markSubmitting(sql, generation.id, leaseToken))) {
    return;
  }
  let requestId: string | null = null;
  let recorded: Promise<void> = Promise.resolve();
  notify({ kind: "sending" });
  const reportQueue = queueReporter(notify);
  const result = await deps.client.run(request.task, {
    ...input,
    onProgress: reportQueue,
    onSubmitted: (id) => {
      requestId = id;
      recorded = recordSubmitted(sql, generation.id, id, leaseToken);
      notify({ kind: "accepted", requestId: id });
    },
  });
  await recorded;
  const accepted = requestId !== null;
  const current = {
    ...generation,
    requestId,
    status: accepted ? ("submitted" as const) : ("submitting" as const),
  };
  if (result.isOk()) {
    await complete(sql, current, result.value, deps, leaseToken, notify);
    return;
  }
  if (accepted) {
    await afterAcceptance(sql, current, result.error, leaseToken);
    return;
  }
  const facts = factsOf(result.error);
  if (REFUSED_BEFORE_ACCEPTANCE.has(facts.status)) {
    await endGeneration(
      sql,
      generation.id,
      ["submitting"],
      {
        cost: {
          basis: `fal refused the request (${facts.status}) before accepting it`,
          kind: "released",
        },
        errorCode: facts.code ?? `HTTP_${facts.status}`,
        errorMessage: facts.message.slice(0, 500),
        status: "failed",
      },
      leaseToken
    );
    return;
  }
  await endGeneration(
    sql,
    generation.id,
    ["submitting"],
    {
      cost: {
        basis: "fal may have accepted the run, so the whole hold is counted",
        kind: "retained",
      },
      errorCode: "SUBMISSION_UNCONFIRMED",
      errorMessage: facts.message.slice(0, 500),
      status: "unknown",
    },
    leaseToken
  );
};

const resume = async (
  sql: AppSql,
  generation: Generation,
  deps: WorkerDeps,
  leaseToken: string,
  notify: Notify
): Promise<void> => {
  if (generation.requestId === null) {
    return;
  }
  const request = requestOf(generation);
  const resolved = await realImages(sql, generation, request, deps);
  if (resolved === null) {
    return;
  }
  const input = toTaskInput(request, resolved.images, generation.model);
  const result = await deps.client.resume(
    request.task,
    { ...input, onProgress: queueReporter(notify) },
    generation.requestId
  );
  if (result.isOk()) {
    await complete(sql, generation, result.value, deps, leaseToken, notify);
    return;
  }
  await afterAcceptance(sql, generation, result.error, leaseToken);
};

/**
 * Take one Generation as far as it can go now. Safe to call from any number
 * of requests at once: only the lease holder acts.
 */
export const advanceGeneration = async (
  sql: AppSql,
  ownerId: string,
  id: string,
  deps: WorkerDeps,
  observe?: WorkerObserver
): Promise<void> => {
  const leaseToken = await claimLease(sql, id, ownerId);
  if (leaseToken === null) {
    return;
  }
  const { drain, notify } = notifier(observe);
  try {
    const generation = await getOwnedGeneration(sql, ownerId, id);
    if (generation === null) {
      return;
    }
    switch (generation.status) {
      case "reserved": {
        await submit(sql, generation, deps, leaseToken, notify);
        break;
      }
      case "submitting": {
        // The lease ran out with the run mid-send: fal may have it, and its
        // request id was never recorded. Never send it again.
        await endGeneration(
          sql,
          generation.id,
          ["submitting"],
          {
            cost: {
              basis:
                "fal may have accepted the run, so the whole hold is counted",
              kind: "retained",
            },
            errorCode: "SUBMISSION_UNCONFIRMED",
            errorMessage:
              "The run may have reached fal, but its request id was never recorded.",
            status: "unknown",
          },
          leaseToken
        );
        break;
      }
      case "submitted": {
        await resume(sql, generation, deps, leaseToken, notify);
        break;
      }
      case "completed":
      case "failed":
      case "unknown": {
        break;
      }
    }
  } finally {
    // Nothing is written for this Generation after it has stopped working.
    await drain();
    await releaseLease(sql, id, leaseToken);
  }
};
