import type { AppRow, AppSql } from "@motif/bench-db/app-sql";
import { describe, expect, it } from "vitest";

import { appendRunEvent, listRunEventsAfter } from "./run-event-store";
import { EVENTS_PER_RUN, TERMINAL_EXTRA } from "./run-events";

const OWNER = "mem_0123456789abcdef0123456789abcdef";
const RUN = "brun_0123456789abcdef0123456789abcdef";

interface Call {
  readonly text: string;
  readonly values: readonly unknown[];
}

/** A database that answers each statement from a script, in order, and keeps
 * what it was asked. */
const scripted = (answers: readonly (readonly AppRow[])[]) => {
  const calls: Call[] = [];
  const sql: AppSql = async (text, values) => {
    await Promise.resolve();
    calls.push({ text, values });
    return answers[calls.length - 1] ?? [];
  };
  return { calls, sql };
};

const event = {
  kind: "read",
  nodeId: "nod_x",
  text: "Reading the Prompt",
} as const;

describe("appendRunEvent", () => {
  it("takes the next place in one statement scoped to the owner", async () => {
    const { calls, sql } = scripted([[{ seq: 1 }]]);
    await expect(appendRunEvent(sql, OWNER, RUN, event)).resolves.toBe(
      "written"
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("r.owner_id = $2");
    expect(calls[0]?.text).toContain("ON CONFLICT (run_id, seq) DO NOTHING");
    expect(calls[0]?.values).toEqual([
      RUN,
      OWNER,
      "nod_x",
      "read",
      "Reading the Prompt",
      null,
      EVENTS_PER_RUN,
    ]);
  });

  it("sends data as JSON", async () => {
    const { calls, sql } = scripted([[{ seq: 1 }]]);
    await appendRunEvent(sql, OWNER, RUN, { ...event, data: { micros: 7 } });
    expect(calls[0]?.values[5]).toBe('{"micros":7}');
  });

  it("tries again when another writer took the place, then writes", async () => {
    const { calls, sql } = scripted([[], [{ n: "10" }], [{ seq: 11 }]]);
    await expect(appendRunEvent(sql, OWNER, RUN, event)).resolves.toBe(
      "written"
    );
    expect(calls).toHaveLength(3);
  });

  it("says full, and stops asking, when the run has used its places", async () => {
    const { calls, sql } = scripted([[], [{ n: String(EVENTS_PER_RUN) }]]);
    await expect(appendRunEvent(sql, OWNER, RUN, event)).resolves.toBe("full");
    expect(calls).toHaveLength(2);
  });

  it("keeps a few places back for how the run ended", async () => {
    const { calls, sql } = scripted([[{ seq: 401 }]]);
    await appendRunEvent(sql, OWNER, RUN, {
      kind: "end",
      nodeId: null,
      text: "Done",
    });
    expect(calls[0]?.values[6]).toBe(EVENTS_PER_RUN + TERMINAL_EXTRA);
  });

  it("gives up on a beat that is only a repeat", async () => {
    const { calls, sql } = scripted([
      [],
      [{ n: "5" }],
      [],
      [{ n: "5" }],
      [],
      [{ n: "5" }],
    ]);
    await expect(appendRunEvent(sql, OWNER, RUN, event)).resolves.toBe(
      "skipped"
    );
    expect(calls).toHaveLength(6);
  });
});

describe("listRunEventsAfter", () => {
  it("reads the owner's beats after a place, as beats", async () => {
    const { calls, sql } = scripted([
      [
        {
          created_at: new Date("2026-11-01T10:00:00.000Z"),
          data: { micros: 7 },
          kind: "price",
          node_id: "nod_x",
          seq: 4,
          text: "Pricing again",
        },
        {
          created_at: "2026-11-01T10:00:01.000Z",
          data: null,
          kind: "end",
          node_id: null,
          seq: "5",
          text: "The run is complete",
        },
      ],
    ]);
    const beats = await listRunEventsAfter(sql, OWNER, RUN, 3, 50);
    expect(calls[0]?.values).toEqual([RUN, OWNER, 3, 50]);
    expect(beats).toEqual([
      {
        at: "2026-11-01T10:00:00.000Z",
        data: { micros: 7 },
        kind: "price",
        nodeId: "nod_x",
        seq: 4,
        text: "Pricing again",
      },
      {
        at: "2026-11-01T10:00:01.000Z",
        data: null,
        kind: "end",
        nodeId: null,
        seq: 5,
        text: "The run is complete",
      },
    ]);
  });

  it("refuses a row of a kind it doesn't know", async () => {
    const { sql } = scripted([
      [
        {
          created_at: new Date(0),
          data: null,
          kind: "mystery",
          node_id: null,
          seq: 1,
          text: "x",
        },
      ],
    ]);
    await expect(listRunEventsAfter(sql, OWNER, RUN, 0, 10)).rejects.toThrow(
      "Unknown run event kind"
    );
  });
});
