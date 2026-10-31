import { describe, expect, it } from "vitest";

import { APP_TASK_IDS } from "../../site/commands";
import { TaskRequestSchema } from "../tasks/request";
import { buildRequest, emptyDraft } from "./task-draft";
import type { Draft } from "./task-draft";

const SOURCE = {
  assetId: `ast_${"1".repeat(32)}`,
  height: 600,
  url: "/x",
  width: 800,
};
const KEY = "6a4f1b9e-2c3d-4e5f-8a9b-0c1d2e3f4a5b";

const valid = (task: (typeof APP_TASK_IDS)[number], draft: Draft) => {
  const built = buildRequest(task, draft);
  if (!built.ok) {
    throw new Error(built.reason);
  }
  return TaskRequestSchema.safeParse({ ...built.request, idempotencyKey: KEY });
};

describe("buildRequest", () => {
  it("sends every Task in a shape the server accepts", () => {
    const filled: Draft = {
      ...emptyDraft(SOURCE),
      boxes: [{ height: 10, width: 10, x: 1, y: 1 }],
      look: "",
      maskAssetId: `ast_${"2".repeat(32)}`,
      prompt: "a jug",
    };
    for (const task of APP_TASK_IDS) {
      expect(valid(task, filled).success, task).toBe(true);
    }
    for (const eraseMode of ["describe", "paint", "boxes", "text"] as const) {
      expect(valid("erase", { ...filled, eraseMode }).success, eraseMode).toBe(
        true
      );
    }
    expect(
      valid("reframe", {
        ...filled,
        margin: { bottom: 0, left: 64, right: 64, top: 0 },
        reframeMode: "margin",
      }).success
    ).toBe(true);
  });

  it("says what is missing instead of sending a request that can't run", () => {
    expect(buildRequest("generate", emptyDraft())).toStrictEqual({
      ok: false,
      reason: "Write a prompt.",
    });
    expect(buildRequest("cutout", emptyDraft())).toStrictEqual({
      ok: false,
      reason: "Choose a Source.",
    });
    expect(
      buildRequest("erase", { ...emptyDraft(SOURCE), eraseMode: "paint" }).ok
    ).toBe(false);
    expect(
      buildRequest("erase", { ...emptyDraft(SOURCE), eraseMode: "boxes" }).ok
    ).toBe(false);
  });
});
