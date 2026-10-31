/**
 * From a validated request to a priced, bounded plan: the owned images it
 * names, the Model the SDK chooses, the ceiling to hold and, when there is no
 * ceiling, the Models that have one.
 *
 * Planning never reads image bytes. The SDK chooses the Model from what the
 * request asks for, not from pixels, so the quote plans with placeholder
 * URLs and the images' recorded sizes. The worker plans again with the real
 * images and refuses to call the provider unless it reaches the same Model,
 * endpoint and a ceiling no higher than the one held.
 */
import { createMotif, TASKS } from "@howells/motif-sdk";
import type { TaskPlan } from "@howells/motif-sdk";
import type { AppSql } from "@motif/bench-db/app-sql";

import type { Member } from "../auth/members";
import { boundFor } from "../budget/bounds";
import type { Bound, Size } from "../budget/bounds";
import { getOwnedAssets } from "../media/assets";
import type { Asset } from "../media/assets";
import { assetIdsOf, toTaskInput } from "./request";
import type { AppTaskRequest, ResolvedImages } from "./request";
import { findProducer } from "./store";
import type { Generation } from "./store";

export interface OwnedInputs {
  readonly mask: Asset | null;
  readonly parent: Generation | null;
  readonly references: readonly Asset[];
  readonly source: Asset | null;
}

export interface Refusal {
  readonly ok: false;
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

const refusal = (status: number, code: string, message: string): Refusal => ({
  code,
  message,
  ok: false,
  status,
});

const sizeOf = (asset: Asset): Size => ({
  height: asset.height,
  width: asset.width,
});

/** Load every image a request names, all owned by the member, and check they
 * fit together. Another person's asset reads as missing. */
export const resolveOwnedInputs = async (
  sql: AppSql,
  member: Member,
  request: AppTaskRequest
): Promise<({ readonly ok: true } & OwnedInputs) | Refusal> => {
  const named = assetIdsOf(request);
  const wanted = [
    ...(named.source === undefined ? [] : [named.source]),
    ...(named.mask === undefined ? [] : [named.mask]),
    ...named.references,
  ];
  const assets = await getOwnedAssets(sql, member.id, wanted);
  if (assets === null) {
    return refusal(
      404,
      "IMAGE_NOT_FOUND",
      "One of those images isn't in your Library."
    );
  }
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const source =
    named.source === undefined ? null : (byId.get(named.source) ?? null);
  const mask = named.mask === undefined ? null : (byId.get(named.mask) ?? null);
  const references = named.references.flatMap((id) => {
    const asset = byId.get(id);
    return asset === undefined ? [] : [asset];
  });
  if (source !== null && source.kind === "mask") {
    return refusal(400, "MASK_AS_SOURCE", "A mask can't be a Source.");
  }
  if (references.some((asset) => asset.kind === "mask")) {
    return refusal(400, "MASK_AS_REFERENCE", "A mask can't be a Reference.");
  }
  if (mask !== null) {
    if (mask.kind !== "mask") {
      return refusal(400, "NOT_A_MASK", "That image isn't a mask.");
    }
    if (
      source === null ||
      mask.width !== source.width ||
      mask.height !== source.height
    ) {
      return refusal(
        400,
        "MASK_SIZE",
        "The mask must be the same size as the Source."
      );
    }
  }
  if (request.task === "erase" && request.mode === "boxes" && source !== null) {
    const outside = request.boxes.some(
      (box) =>
        box.x + box.width > source.width || box.y + box.height > source.height
    );
    if (outside) {
      return refusal(400, "BOX_OUTSIDE", "A box reaches outside the Source.");
    }
  }
  const parent =
    source !== null && source.kind === "output"
      ? await findProducer(sql, member.id, source.id)
      : null;
  return { mask, ok: true, parent, references, source };
};

/** Placeholder images for planning: the SDK reads sizes from `sourceSize`,
 * never from these URLs, and nothing is fetched. */
export const placeholderImages = (inputs: OwnedInputs): ResolvedImages => ({
  ...(inputs.mask !== null && { mask: "https://motif.invalid/mask.png" }),
  references: inputs.references.map(
    (_, index) => `https://motif.invalid/reference-${index}.png`
  ),
  ...(inputs.source !== null && {
    source: {
      height: inputs.source.height,
      url: "https://motif.invalid/source.png",
      width: inputs.source.width,
    },
  }),
});

export const boundContextOf = (inputs: OwnedInputs) => ({
  references: inputs.references.map((asset) => sizeOf(asset)),
  ...(inputs.source !== null && { source: sizeOf(inputs.source) }),
});

/** A planning-only client: `dryRun` resolves as if a key were set and the
 * client makes no call. */
const planner = createMotif({ falKey: "plan-only" });

const planWith = (
  request: AppTaskRequest,
  images: ResolvedImages,
  model: string | undefined
) =>
  planner.plan(request.task, toTaskInput(request, images, model), {
    dryRun: true,
  });

export interface Alternative {
  readonly listMicros: number;
  readonly micros: number;
  readonly model: string;
  readonly tier: string;
}

export type Quote =
  | {
      readonly kind: "ready";
      readonly bound: Extract<Bound, { kind: "bounded" }>;
      readonly plan: TaskPlan;
    }
  | {
      readonly kind: "blocked";
      readonly alternatives: readonly Alternative[];
      readonly plan: TaskPlan;
      readonly reason: string;
    }
  | { readonly kind: "invalid"; readonly message: string };

/** The Model a vary should keep: the one that made its Source, when the
 * person names none and that Model can still be held. */
const inheritedModel = (
  request: AppTaskRequest,
  inputs: OwnedInputs
): string | undefined => {
  if (
    request.task !== "vary" ||
    request.model !== undefined ||
    inputs.parent === null
  ) {
    return undefined;
  }
  const parent = inputs.parent;
  const ranked = TASKS.vary.models.some(
    (entry) => entry.model === parent.model
  );
  return ranked ? parent.model : undefined;
};

/** Other Models for the same job that can be held, best ranked first, the
 * same Tier before others. */
const alternativesFor = (
  request: AppTaskRequest,
  inputs: OwnedInputs,
  blocked: TaskPlan
): Alternative[] => {
  const images = placeholderImages(inputs);
  const context = boundContextOf(inputs);
  const seen = new Set([blocked.model]);
  const found: Alternative[] = [];
  const entries = [...TASKS[request.task].models].filter(
    (entry) => ("mode" in entry ? entry.mode : undefined) === blocked.mode
  );
  entries.sort(
    (a, b) => Number(b.tier === blocked.tier) - Number(a.tier === blocked.tier)
  );
  for (const entry of entries) {
    if (seen.has(entry.model) || found.length >= 2) {
      continue;
    }
    seen.add(entry.model);
    const plan = planWith(request, images, entry.model);
    if (plan.isErr()) {
      continue;
    }
    const bound = boundFor({ ...plan.value, task: request.task }, context);
    if (bound.kind === "bounded") {
      found.push({
        listMicros: bound.listMicros,
        micros: bound.micros,
        model: plan.value.model,
        tier: entry.tier,
      });
    }
  }
  return found;
};

export const quote = (request: AppTaskRequest, inputs: OwnedInputs): Quote => {
  const images = placeholderImages(inputs);
  const model = request.model ?? inheritedModel(request, inputs);
  const planned = planWith(request, images, model);
  if (planned.isErr()) {
    return { kind: "invalid", message: planned.error.message };
  }
  const plan = planned.value;
  const bound = boundFor(
    { ...plan, task: request.task },
    boundContextOf(inputs)
  );
  if (bound.kind === "unbounded") {
    return {
      alternatives: alternativesFor(request, inputs, plan),
      kind: "blocked",
      plan,
      reason: bound.reason,
    };
  }
  return { bound, kind: "ready", plan };
};
