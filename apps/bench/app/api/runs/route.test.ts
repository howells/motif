import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Viewer } from "../../../lib/app/auth/viewer";
import { PUT as rateSample } from "../samples/[id]/rating/route";
import { POST as judgeRun } from "./[id]/judge/route";
import { POST as retryRun } from "./[id]/retry/route";
import { GET as pollRun } from "./[id]/route";
import { POST as previewRun } from "./preview/route";
import { GET as listRuns, POST as startRun } from "./route";

const state = vi.hoisted((): { viewer: Viewer } => ({
  viewer: { state: "signed-out" },
}));

vi.mock("../../../lib/app/auth/viewer", () => ({
  getViewer: async () => state.viewer,
}));
vi.mock("../../../lib/app/db", () => ({ getAppSql: () => async () => [] }));
vi.mock("../../../lib/runs/handlers", () => ({
  listRunsResponse: async () => Response.json({ runs: [] }),
  runDetailResponse: async () => Response.json({ run: {} }),
}));
vi.mock("../../../lib/runs/repository", () => ({
  previewRun: () => ({ preview: true }),
  setManualRating: async () => ({ stars: 4 }),
}));

const member = (role: "member" | "owner"): Viewer => ({
  email: `${role}@example.test`,
  member: {
    email: `${role}@example.test`,
    id: `mem_${"a".repeat(32)}`,
    name: null,
    role,
  },
  state: "member",
});

const ORIGIN = "http://bench.test";
const context = { params: Promise.resolve({ id: "run-1" }) };
const sameOrigin = (path: string, body: unknown) =>
  new Request(`${ORIGIN}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: ORIGIN },
    method: "POST",
  });

describe("the retired Bench API", () => {
  beforeEach(() => {
    state.viewer = member("owner");
  });

  it("refuses to start, retry or judge a run, even for the owner", async () => {
    const responses = [await startRun(), await retryRun(), await judgeRun()];
    for (const response of responses) {
      expect(response.status).toBe(410);
      await expect(response.json()).resolves.toMatchObject({
        code: "BENCH_RETIRED",
      });
    }
  });

  it.each([
    [{ state: "signed-out" }, 401],
    [{ email: "x@example.test", revoked: true, state: "no-access" }, 403],
    [member("member"), 403],
  ])(
    "keeps past runs from anyone but the owner (%j)",
    async (viewer, status) => {
      state.viewer = viewer;
      const list = await listRuns(new Request(`${ORIGIN}/api/runs`));
      const detail = await pollRun(
        new Request(`${ORIGIN}/api/runs/run-1`),
        context
      );
      expect(list.status).toBe(status);
      expect(detail.status).toBe(status);
    }
  );

  it("serves past runs to the owner", async () => {
    const response = await listRuns(new Request(`${ORIGIN}/api/runs`));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toStrictEqual({ runs: [] });
  });

  it("lets only the owner rate a sample, and only from the App's own pages", async () => {
    state.viewer = member("member");
    const asMember = await rateSample(
      new Request(`${ORIGIN}/api/samples/s1/rating`, {
        body: JSON.stringify({ stars: 4 }),
        headers: { "content-type": "application/json", origin: ORIGIN },
        method: "PUT",
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(asMember.status).toBe(403);

    state.viewer = member("owner");
    const crossSite = await rateSample(
      new Request(`${ORIGIN}/api/samples/s1/rating`, {
        body: JSON.stringify({ stars: 4 }),
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        method: "PUT",
      }),
      { params: Promise.resolve({ id: "s1" }) }
    );
    expect(crossSite.status).toBe(403);
    await expect(crossSite.json()).resolves.toMatchObject({
      code: "CROSS_ORIGIN",
    });
  });

  it("keeps the free preview behind the owner too", async () => {
    state.viewer = member("member");
    const preview = await previewRun(sameOrigin("/api/runs/preview", {}));
    expect(preview.status).toBe(403);
  });
});
