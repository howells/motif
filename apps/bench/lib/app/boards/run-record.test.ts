import type { AppRow, AppSql } from "@motif/bench-db/app-sql";
import { describe, expect, it } from "vitest";

import { EVENTS_PER_RUN } from "./run-events";
import type { RunEventKind } from "./run-events";
import { recordStream } from "./run-record";

const OWNER = "mem_0123456789abcdef0123456789abcdef";
const RUN = "brun_0123456789abcdef0123456789abcdef";
const NODE = `nod_${"a".repeat(32)}`;

interface Stored {
  readonly kind: string;
  readonly text: string;
}

/** A table that takes what it is given, in order, and says how full it is. */
const table = (options: { full?: boolean; failOn?: string } = {}) => {
  const kept: Stored[] = [];
  const sql: AppSql = async (text, values) => {
    await Promise.resolve();
    if (text.includes("INSERT INTO app_run_events")) {
      const kind = String(values[3]);
      const body = String(values[4]);
      if (options.failOn === body) {
        throw new Error("the database blinked");
      }
      if (options.full === true) {
        return [];
      }
      kept.push({ kind, text: body });
      return [{ seq: kept.length }] satisfies AppRow[];
    }
    return [{ n: String(EVENTS_PER_RUN) }] satisfies AppRow[];
  };
  return { kept, sql };
};

/** What Mastra's stream carries for a step's `writer.write`, as the real
 * workflow was seen to send it. */
const beat = (kind: RunEventKind, text: string) => ({
  payload: {
    output: { kind, nodeId: NODE, text },
    runId: "r",
    stepName: `node-${NODE}`,
  },
  type: "workflow-step-output",
});

const record = async (
  sql: AppSql,
  chunks: readonly unknown[]
): Promise<void> => {
  await recordStream(
    {
      now: () => 0,
      outcome: { failure: null, outOfTime: false },
      ownerId: OWNER,
      runId: RUN,
      sql,
    },
    (async function* chunked() {
      await Promise.resolve();
      yield* chunks;
    })()
  );
};

describe("recordStream", () => {
  it("keeps the whole of a wait and the burst after it, in order", async () => {
    const { kept, sql } = table();
    await record(sql, [
      beat("make", "fal is making it"),
      beat("make", "Grok Imagine Image 2.0 usually takes about 50 s"),
      beat("wait", "Still making it, 18 s in"),
      beat("wait", "Still making it, 33 s in"),
      beat("make", "fal has finished"),
      beat("image", "The image is back, bringing it in"),
      beat("store", "Stored, 2048 × 2048"),
      beat("settle", "Settled at $0.080"),
      beat("pick", "Kept as the Pick"),
    ]);
    expect(kept.map((item) => item.kind)).toStrictEqual([
      "make",
      "make",
      "wait",
      "wait",
      "make",
      "image",
      "store",
      "settle",
      "pick",
    ]);
  });

  it("drops an exact repeat of a node's last beat", async () => {
    const { kept, sql } = table();
    await record(sql, [
      beat("send", "fal has it"),
      beat("send", "fal has it"),
      beat("make", "fal is making it"),
    ]);
    expect(kept.map((item) => item.text)).toStrictEqual([
      "fal has it",
      "fal is making it",
    ]);
  });

  it("goes on after a beat that couldn't be kept", async () => {
    const { kept, sql } = table({ failOn: "fal has it" });
    await record(sql, [
      beat("send", "fal has it"),
      beat("make", "fal is making it"),
    ]);
    expect(kept.map((item) => item.text)).toStrictEqual(["fal is making it"]);
  });

  it("stops trying for ordinary beats once the run is full, but still tries to say how it ended", async () => {
    const asked: string[] = [];
    const sql: AppSql = async (text, values) => {
      await Promise.resolve();
      if (text.includes("INSERT INTO app_run_events")) {
        asked.push(String(values[3]));
        return [];
      }
      return [{ n: "420" }] satisfies AppRow[];
    };
    await record(sql, [
      beat("wait", "Still making it, 15 s in"),
      beat("wait", "Still making it, 30 s in"),
      beat("done", "Finished"),
    ]);
    // The first ordinary beat finds the run full; the second isn't tried; the
    // ending is.
    expect(asked).toStrictEqual(["wait", "done"]);
  });
});
