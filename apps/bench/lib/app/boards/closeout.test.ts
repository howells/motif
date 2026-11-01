import type { AppRow, AppSql } from "@motif/bench-db/app-sql";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { Member } from "../auth/members";
import { liveWorkerDeps } from "../tasks/execute";
import { make } from "./make";
import type { RunContext } from "./run";
import { approvedGraph, resultPick } from "./run-inputs";
import { disconnect, startBoardRun } from "./service";
import {
  configurationKey,
  GraphSnapshotSchema,
  sameConfiguration,
} from "./snapshot";
import type { Graph } from "./store";

const owner: Member = {
  email: "owner@example.test",
  id: "mem_owner",
  name: null,
  role: "owner",
};
const board: AppRow = {
  id: "brd_inbox",
  kind: "inbox",
  name: "Inbox",
  updated_at: new Date(0),
};
const graph: Graph = {
  nodes: [
    {
      boardId: "brd_inbox",
      id: "nod_prompt",
      kind: "prompt",
      pickAssetId: null,
      settings: { text: "Original" },
      stale: false,
      x: 40,
      y: 0,
    },
    {
      boardId: "brd_inbox",
      id: "nod_generate",
      kind: "generate",
      pickAssetId: null,
      settings: { count: 1, references: [] },
      stale: false,
      x: 336,
      y: 0,
    },
  ],
  wires: [{ from: "nod_prompt", id: "wir_input", to: "nod_generate" }],
};

/** Executes the actual Make/service/store functions with two interleaved
 * requests. Rows are copied on read, like independent database responses. */
const inbox = () => {
  const nodes: AppRow[] = [];
  const wires: AppRow[] = [];
  const runs: AppRow[] = [];
  const sql: AppSql = async (query, values) => {
    await Promise.resolve();
    if (query.includes("INSERT INTO app_nodes")) {
      const row = {
        board_id: values[1],
        id: values[0],
        kind: values[3],
        pick_asset_id: null,
        position_x: values[4],
        position_y: values[5],
        settings: z.json().parse(JSON.parse(z.string().parse(values[6]))),
        stale: false,
      };
      nodes.push(row);
      return [{ ...row }];
    }
    if (query.includes("INSERT INTO app_wires")) {
      const row = {
        id: values[0],
        from_node_id: values[2],
        to_node_id: values[3],
      };
      wires.push(row);
      return [{ ...row }];
    }
    if (query.includes("INSERT INTO app_board_runs")) {
      const row = {
        approved_micros: values[6],
        board_id: values[2],
        created_at: new Date(0),
        error_message: null,
        from_node_id: values[3],
        id: values[0],
        lease_until: null,
        scope: values[4],
        status: "running",
        steps: z.json().parse(JSON.parse(z.string().parse(values[5]))),
      };
      runs.push(row);
      return [row];
    }
    if (query.includes("FROM app_nodes n")) {
      return nodes.map((row) => ({ ...row }));
    }
    if (query.includes("FROM app_wires w")) {
      return wires.map((row) => ({ ...row }));
    }
    if (query.includes("SELECT id, kind, name, updated_at FROM app_boards")) {
      return [board];
    }
    return [];
  };
  return { nodes, runs, sql, wires };
};

const snapshotSql: AppSql = async (query) => {
  if (query.includes("FROM app_nodes")) {
    throw new Error("Must not read the edited live Board");
  }
  return [];
};

describe("MOT-74 closeout regressions", () => {
  it("keeps simultaneous Makes attached to their own prompt even at identical coordinates", async () => {
    const db = inbox();
    const results = await Promise.all(
      ["First prompt", "Second prompt"].map(
        async (prompt, index) =>
          await make(db.sql, owner, {
            approvedMicros: 500_000,
            idempotencyKey: `key-${index}`,
            prompt,
            references: [],
          })
      )
    );
    expect(results.every((result) => result.ok)).toBe(true);
    expect(db.runs).toHaveLength(2);
    expect(new Set(db.runs.map((row) => row.from_node_id)).size).toBe(2);
    for (const [index, run] of db.runs.entries()) {
      const wire = db.wires.find((row) => row.to_node_id === run.from_node_id);
      const prompt = db.nodes.find((row) => row.id === wire?.from_node_id);
      expect(prompt?.settings).toStrictEqual({
        text: index === 0 ? "First prompt" : "Second prompt",
      });
    }
    const promptRows = db.nodes.filter((row) => row.kind === "prompt");
    expect(promptRows[0]?.position_y).toBe(promptRows[1]?.position_y);
  });

  it("refuses an approval from before an equal-price prompt edit", async () => {
    const db = inbox();
    await make(db.sql, owner, {
      approvedMicros: 500_000,
      idempotencyKey: "first",
      prompt: "First",
      references: [],
    });
    const original = GraphSnapshotSchema.parse({
      nodes: db.nodes.map((row) => ({
        boardId: row.board_id,
        id: row.id,
        kind: row.kind,
        pickAssetId: row.pick_asset_id,
        settings: row.settings,
        stale: row.stale,
        x: row.position_x,
        y: row.position_y,
      })),
      wires: db.wires.map((row) => ({
        id: row.id,
        from: row.from_node_id,
        to: row.to_node_id,
      })),
    });
    const edited = db.nodes.findIndex((row) => row.kind === "prompt");
    const prior = db.nodes[edited];
    if (prior === undefined) {
      throw new Error("Missing prompt");
    }
    db.nodes[edited] = {
      ...prior,
      settings: { text: "Unapproved replacement" },
    };
    const fromNodeId = z.string().parse(db.runs[0]?.from_node_id);
    const result = await startBoardRun(db.sql, owner, {
      approvedConfiguration: configurationKey(original),
      approvedMicros: 500_000,
      boardId: "brd_inbox",
      fromNodeId,
      idempotencyKey: "second",
      scope: "node",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PRICE_CHANGED");
    }
    expect(db.runs).toHaveLength(1);
  });

  it("marks a disconnected target and its descendants stale", async () => {
    const calls: { query: string; values: readonly unknown[] }[] = [];
    const target = {
      board_id: "brd_inbox",
      id: "nod_generate",
      kind: "generate",
      settings: { count: 1, references: [] },
      pick_asset_id: "ast_old",
      stale: false,
      position_x: 0,
      position_y: 0,
    };
    const sql: AppSql = async (query, values) => {
      calls.push({ query, values });
      if (query.includes("UPDATE app_wires")) {
        return [
          {
            id: "wir_input",
            from_node_id: "nod_prompt",
            to_node_id: "nod_generate",
          },
        ];
      }
      if (query.includes("FROM app_nodes n")) {
        return [target, { ...target, id: "nod_child" }];
      }
      if (query.includes("FROM app_wires w")) {
        return [
          {
            id: "wir_child",
            from_node_id: "nod_generate",
            to_node_id: "nod_child",
          },
        ];
      }
      if (query.includes("FROM app_boards")) {
        return [board];
      }
      return [];
    };
    await disconnect(sql, owner.id, "wir_input");
    expect(
      calls.find((call) => call.query.includes("SET stale = true"))?.values[0]
    ).toStrictEqual(["nod_generate", "nod_child"]);
  });

  it("resumes from approved inputs rather than the edited live Board", async () => {
    const ctx: RunContext = {
      deadline: 10_000,
      deps: {
        now: () => 0,
        sleep: async () => {},
        worker: liveWorkerDeps("unused"),
      },
      member: owner,
      outcome: { failure: null, outOfTime: false },
      run: {
        approvedMicros: 500_000,
        boardId: "brd_inbox",
        createdAt: new Date(0),
        errorMessage: null,
        fromNodeId: "nod_generate",
        id: "brun_test",
        leaseUntil: null,
        scope: "node",
        status: "running",
        steps: [
          {
            level: 0,
            micros: 500_000,
            nodeId: "nod_generate",
            snapshot: graph,
          },
        ],
      },
      sql: snapshotSql,
    };
    await expect(approvedGraph(ctx)).resolves.toStrictEqual(graph);
    await expect(
      approvedGraph({
        ...ctx,
        run: {
          ...ctx.run,
          steps: [{ level: 0, micros: 500_000, nodeId: "nod_generate" }],
        },
      })
    ).rejects.toThrow("Look again before running");
  });

  it("keeps the same Comparison Pick when result rows arrive in a different order", () => {
    const node = {
      boardId: "brd_inbox",
      id: "nod_compare",
      kind: "compare" as const,
      pickAssetId: null,
      settings: { models: ["first", "second"] },
      stale: false,
      x: 0,
      y: 0,
    };
    const results = [
      {
        model: "second",
        status: "completed" as const,
        outputAssetIds: ["ast_second"],
      },
      {
        model: "first",
        status: "completed" as const,
        outputAssetIds: ["ast_first"],
      },
    ];
    expect(resultPick(node, results)).toBe("ast_first");
    expect(resultPick(node, results.toReversed())).toBe("ast_first");
  });

  it("round-trips the approved graph and recognises edits to its input chain", () => {
    const approved = GraphSnapshotSchema.parse(structuredClone(graph));
    expect(sameConfiguration(approved, graph, "nod_generate")).toBe(true);
    const changed: Graph = {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.kind === "prompt"
          ? { ...node, settings: { text: "Unapproved" } }
          : node
      ),
    };
    expect(sameConfiguration(approved, changed, "nod_generate")).toBe(false);
    expect(
      sameConfiguration(approved, { ...graph, wires: [] }, "nod_generate")
    ).toBe(false);
    const unrelated: Graph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        ...graph.nodes
          .slice(0, 1)
          .map((node) => ({ ...node, id: "nod_other" })),
      ],
    };
    expect(sameConfiguration(approved, unrelated, "nod_generate")).toBe(true);
    expect(approved.nodes[0]?.settings).toStrictEqual({ text: "Original" });
  });
});
