import type { AppRow, AppSql } from "@motif/bench-db/app-sql";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { liveWorkerDeps } from "../tasks/execute";
import { buildRunWorkflow, stepKey } from "./run";
import {
  claimRun,
  createRun,
  endRun,
  getOwnedRun,
  latestRuns,
  listRunResults,
  runStatus,
} from "./run-store";
import {
  addNode,
  addWire,
  completeNode,
  createBoard,
  ensureInbox,
  getGraph,
  getOwnedBoard,
  getOwnedNode,
  listBoards,
  listResults,
  markStale,
  moveNodes,
  recordResult,
  removeNode,
  removeWire,
  renameBoard,
  setPick,
  updateSettings,
} from "./store";

const OWNER = "mem_0123456789abcdef0123456789abcdef";

interface Call {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** A database that records every statement and answers with one plausible
 * row, enough for each function to finish. */
const recorder = () => {
  const calls: Call[] = [];
  const row: AppRow = {
    approved_micros: 1,
    board_id: "brd_x",
    created_at: new Date(0),
    ended: 1,
    from_node_id: "nod_a",
    generation_id: "gen_x",
    id: "brd_x",
    images: 0,
    kind: "board",
    lease_token: "2026-11-01 00:00:00.000001+00",
    name: "Board",
    node_id: "nod_a",
    position_x: 0,
    position_y: 0,
    removed: 1,
    run_id: null,
    scope: "node",
    settings: {},
    stale: false,
    status: "running",
    steps: [],
    to_node_id: "nod_b",
    updated: 1,
    updated_at: new Date(0),
  };
  const sql: AppSql = async (text, values) => {
    calls.push({ text, values });
    const nodeRows = /(?:FROM|INTO) app_nodes/u.test(text);
    return [nodeRows ? { ...row, kind: "prompt" } : row];
  };
  return { calls, sql };
};

describe("Board storage is scoped to its owner", () => {
  it("names the owner in SQL on every statement", async () => {
    const { calls, sql } = recorder();
    await ensureInbox(sql, OWNER);
    await listBoards(sql, OWNER);
    await getOwnedBoard(sql, OWNER, "brd_x");
    await createBoard(sql, OWNER, "Book covers");
    await renameBoard(sql, OWNER, "brd_x", "Kitchen shoot");
    await getGraph(sql, OWNER, "brd_x");
    await getOwnedNode(sql, OWNER, "nod_a");
    await addNode(sql, OWNER, "brd_x", {
      kind: "prompt",
      settings: {},
      x: 0,
      y: 0,
    });
    await addNode(sql, OWNER, "brd_x", {
      kind: "source",
      pickAssetId: "ast_x",
      settings: {},
      x: 0,
      y: 0,
    });
    await moveNodes(sql, OWNER, [{ id: "nod_a", x: 1, y: 2 }]);
    await updateSettings(sql, OWNER, "nod_a", {}, ["nod_b"]);
    await setPick(sql, OWNER, "nod_a", "ast_x", ["nod_b"]);
    await removeNode(sql, OWNER, "nod_a");
    await addWire(sql, OWNER, "brd_x", "nod_a", "nod_b", ["nod_b"]);
    await removeWire(sql, OWNER, "wir_x");
    await markStale(sql, OWNER, ["nod_b"]);
    await recordResult(sql, OWNER, "nod_a", "gen_x", null);
    await completeNode(sql, OWNER, "nod_a", "ast_x");
    await listResults(sql, OWNER, "brd_x");
    await listRunResults(sql, OWNER, "brun_x");
    await createRun(sql, OWNER, {
      boardId: "brd_x",
      fromNodeId: "nod_a",
      idempotencyKey: "k",
      scope: "node",
      steps: [{ level: 0, micros: 10, nodeId: "nod_a" }],
    });
    await getOwnedRun(sql, OWNER, "brun_x");
    await latestRuns(sql, OWNER, "brd_x");
    await claimRun(sql, OWNER, "brun_x");
    await endRun(sql, OWNER, "brun_x", "stopped");
    await runStatus(sql, OWNER, "brun_x");

    expect(calls.length).toBeGreaterThan(25);
    for (const call of calls) {
      expect(call.text, call.text).toMatch(
        /owner_id\s*=\s*\$\d|owner_id\) IN|\(owner_id\)|, \$\d+, 'inbox'|owner_id, kind, name/u
      );
      expect(call.values, call.text).toContain(OWNER);
    }
  });
});

describe(stepKey, () => {
  it("is a stable UUID per run, node and request", () => {
    const key = stepKey("brun_1", "nod_1", 0);
    expect(z.uuid().safeParse(key).success).toBe(true);
    expect(stepKey("brun_1", "nod_1", 0)).toBe(key);
    expect(stepKey("brun_1", "nod_1", 1)).not.toBe(key);
    expect(stepKey("brun_2", "nod_1", 0)).not.toBe(key);
  });
});

describe(buildRunWorkflow, () => {
  it("is one .parallel block per level, run in order, a step per node", () => {
    const { sql } = recorder();
    const workflow = buildRunWorkflow(
      {
        deadline: 0,
        deps: {
          now: () => 0,
          sleep: async () => {
            await Promise.resolve();
          },
          // Built, never run: no step executes in this test.
          worker: liveWorkerDeps("unused-in-this-test"),
        },
        member: { email: "a@b.c", id: OWNER, name: null, role: "member" },
        outcome: { failure: null, outOfTime: false },
        run: {
          approvedMicros: 3,
          boardId: "brd_x",
          createdAt: new Date(0),
          errorMessage: null,
          fromNodeId: "nod_g",
          id: "brun_x",
          leaseUntil: null,
          scope: "downstream",
          status: "running",
          steps: [
            { level: 0, micros: 1, nodeId: "nod_g" },
            { level: 1, micros: 1, nodeId: "nod_e" },
            { level: 1, micros: 1, nodeId: "nod_c" },
            { level: 2, micros: 1, nodeId: "nod_u" },
          ],
        },
        sql,
      },
      new Map([["nod_c", ["grok-image", "muse-image"]]])
    );
    expect(
      workflow.stepGraph.map((entry) =>
        entry.type === "parallel" ? entry.steps.length : entry.type
      )
    ).toStrictEqual([1, 2, 1]);
    expect(Object.keys(workflow.steps)).toStrictEqual([
      "node-nod_g",
      "node-nod_e",
      "compare-nod_c",
      "node-nod_u",
    ]);
  });
});
