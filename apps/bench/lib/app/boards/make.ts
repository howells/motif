/**
 * Make, from a phone: a Prompt and a Generate node added to the Inbox and
 * run at once at the price shown. Pressing Make is the approval.
 */
import type { AppSql } from "@motif/bench-db/app-sql";

import type { Member } from "../auth/members";
import { monthSummary } from "../budget/ledger";
import { getOwnedAssets } from "../media/assets";
import type { BoardAspect } from "./model";
import { modelName } from "./names";
import { quoteRun } from "./plan";
import { getRunByKey } from "./run-store";
import type { BoardRun } from "./run-store";
import { addBoardNode, checkSettings, refuse, startBoardRun } from "./service";
import type { Outcome } from "./service";
import { ensureInbox, getGraph } from "./store";
import type { BoardNode } from "./store";

export interface MakeInput {
  readonly aspect?: BoardAspect;
  readonly look?: string;
  readonly mood?: string;
  readonly prompt: string;
  readonly references: readonly string[];
}

/** Space between rows of Makes on the Inbox canvas. */
const INBOX_ROW = 400;

/** The two nodes a Make adds to the Inbox, before they exist. */
const makeGraph = (input: MakeInput) => {
  const prompt: BoardNode & { readonly kind: "prompt" } = {
    boardId: "",
    id: "nod_make_prompt",
    kind: "prompt",
    pickAssetId: null,
    settings: {
      text: input.prompt,
      ...(input.look !== undefined && { look: input.look }),
      ...(input.mood !== undefined && { mood: input.mood }),
    },
    stale: false,
    x: 0,
    y: 0,
  };
  const generate: BoardNode & { readonly kind: "generate" } = {
    boardId: "",
    id: "nod_make_generate",
    kind: "generate",
    pickAssetId: null,
    settings: {
      count: 1,
      references: [...input.references],
      ...(input.aspect !== undefined && { aspect: input.aspect }),
    },
    stale: false,
    x: 0,
    y: 0,
  };
  return {
    generate,
    graph: {
      nodes: [prompt, generate],
      wires: [{ from: prompt.id, id: "wir_make", to: generate.id }],
    },
    prompt,
  };
};

export interface MakeQuote {
  readonly availableMicros: number;
  readonly capMicros: number;
  readonly listMicros: number;
  readonly micros: number;
  readonly model: string | null;
  readonly modelName: string | null;
  readonly reason: string | null;
}

/** Price a Make. Spends nothing and adds nothing to the Inbox. */
export const quoteMake = async (
  sql: AppSql,
  ownerId: string,
  input: MakeInput
): Promise<Outcome<MakeQuote>> => {
  const checked = checkSettings("prompt", {
    look: input.look,
    mood: input.mood,
    text: input.prompt,
  });
  if (!checked.ok) {
    return checked;
  }
  const { generate, graph } = makeGraph(input);
  const owned =
    input.references.length === 0
      ? []
      : await getOwnedAssets(sql, ownerId, input.references);
  if (owned === null) {
    return refuse(404, "IMAGE_NOT_FOUND", "That photo isn't in your Library.");
  }
  const sizes = new Map(
    owned.map((asset) => [
      asset.id,
      { height: asset.height, width: asset.width },
    ])
  );
  const budget = await monthSummary(sql);
  const quoted = quoteRun(graph, generate.id, "node", sizes, ownerId);
  const step = quoted.steps[0];
  const model = step?.ok === true ? (step.models[0] ?? null) : null;
  return {
    ok: true,
    value: {
      availableMicros: Math.max(
        0,
        budget.capMicros - budget.spentMicros - budget.heldMicros
      ),
      capMicros: budget.capMicros,
      listMicros: quoted.listMicros,
      micros: quoted.micros,
      model,
      modelName: model === null ? null : modelName(model),
      reason:
        step === undefined ? "Write a prompt." : step.ok ? null : step.reason,
    },
  };
};

/**
 * Make on the phone: a Prompt and a Generate node on the Inbox, run at once
 * at the price shown. Pressing Make again with the same key returns the run
 * it already started.
 */
export const make = async (
  sql: AppSql,
  member: Member,
  input: MakeInput & {
    readonly idempotencyKey: string;
    readonly approvedMicros: number;
  }
): Promise<
  Outcome<{ readonly run: BoardRun; readonly duplicate: boolean }>
> => {
  const existing = await getRunByKey(sql, member.id, input.idempotencyKey);
  if (existing !== null) {
    return { ok: true, value: { duplicate: true, run: existing } };
  }
  const priced = await quoteMake(sql, member.id, input);
  if (!priced.ok) {
    return priced;
  }
  if (priced.value.reason !== null) {
    return refuse(409, "NOT_READY", priced.value.reason);
  }
  if (priced.value.micros > input.approvedMicros) {
    return refuse(
      409,
      "PRICE_CHANGED",
      "The price changed. Look again before making."
    );
  }
  const inbox = await ensureInbox(sql, member.id);
  const current = await getGraph(sql, member.id, inbox.id);
  let y = 0;
  for (const node of current.nodes) {
    y = Math.max(y, node.y + INBOX_ROW);
  }
  const { generate, prompt } = makeGraph(input);
  const added = await addBoardNode(sql, member.id, inbox.id, {
    kind: "prompt",
    settings: prompt.settings,
    x: 40,
    y,
  });
  if (!added.ok) {
    return added;
  }
  const promptNode = added.value.nodes.find(
    (node) => node.kind === "prompt" && node.y === y && node.x === 40
  );
  if (promptNode === undefined) {
    return refuse(500, "MAKE_FAILED", "The Prompt wasn't added to your Inbox.");
  }
  const withGenerate = await addBoardNode(sql, member.id, inbox.id, {
    from: promptNode.id,
    kind: "generate",
    settings: generate.settings,
    x: 336,
    y,
  });
  if (!withGenerate.ok) {
    return withGenerate;
  }
  const generateNode = withGenerate.value.nodes.find(
    (node) => node.kind === "generate" && node.y === y && node.x === 336
  );
  if (generateNode === undefined) {
    return refuse(
      500,
      "MAKE_FAILED",
      "The Generate node wasn't added to your Inbox."
    );
  }
  return await startBoardRun(sql, member, {
    approvedMicros: input.approvedMicros,
    boardId: inbox.id,
    fromNodeId: generateNode.id,
    idempotencyKey: input.idempotencyKey,
    scope: "node",
  });
};
