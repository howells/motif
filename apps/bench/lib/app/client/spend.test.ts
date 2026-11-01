import { describe, expect, it } from "vitest";

import { spendFor } from "../budget/ledger";
import type { MonthSummary } from "../budget/ledger";
import { SpendSchema } from "./schemas";
import { spendLines } from "./spend";

/** November: Daniel spent $0.08; a member spent $1.20 and holds $0.50. */
const MONTH: MonthSummary = {
  capMicros: 50_000_000,
  heldMicros: 500_000,
  members: [
    {
      heldMicros: 0,
      memberId: "mem_owner",
      retained: 0,
      runs: 1,
      spentMicros: 80_000,
    },
    {
      heldMicros: 500_000,
      memberId: "mem_friend",
      retained: 1,
      runs: 3,
      spentMicros: 1_200_000,
    },
  ],
  month: "2026-11",
  spentMicros: 1_280_000,
};

describe(spendFor, () => {
  it("shows a member their own spend and what is left, never the pot", () => {
    const spend = spendFor(MONTH, { id: "mem_owner", role: "member" });
    expect(spend.pot).toBeNull();
    expect(spend.mine).toStrictEqual({
      estimated: 0,
      heldMicros: 0,
      runs: 1,
      spentMicros: 80_000,
    });
    expect(spend.leftMicros).toBe(48_220_000);
    expect(JSON.stringify(spend)).not.toContain("1200000");
  });

  it("shows the owner the pot's total and everyone's line", () => {
    const spend = spendFor(MONTH, { id: "mem_owner", role: "owner" });
    expect(spend.pot?.spentMicros).toBe(1_280_000);
    expect(spend.pot?.members).toHaveLength(2);
  });

  it("starts someone who hasn't run anything at nothing", () => {
    const spend = spendFor(MONTH, { id: "mem_new", role: "member" });
    expect(spend.mine.spentMicros).toBe(0);
  });
});

describe(spendLines, () => {
  it("says your own spend, then what is left this month", () => {
    const lines = spendLines(
      SpendSchema.parse(spendFor(MONTH, { id: "mem_owner", role: "member" }))
    );
    expect(lines).toStrictEqual({
      left: "Up to $48.22 left this month",
      spent: "$0.08 spent",
    });
  });

  it("marks estimated spend and counts holds still going", () => {
    const lines = spendLines(
      SpendSchema.parse(spendFor(MONTH, { id: "mem_friend", role: "member" }))
    );
    expect(lines.spent).toBe("About $1.20 spent, $0.50 held");
  });
});
