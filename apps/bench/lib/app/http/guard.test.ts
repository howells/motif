import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Viewer } from "../auth/viewer";
import { authorise, isSameOrigin, readJson } from "./guard";

const state = vi.hoisted((): { viewer: Viewer } => ({
  viewer: { state: "signed-out" },
}));
vi.mock("../auth/viewer", () => ({ getViewer: async () => state.viewer }));
vi.mock("../db", () => ({ getAppSql: () => async () => [] }));

const ORIGIN = "https://motif.test";
const request = (headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}/api/app/tasks`, { headers, method: "POST" });
const member = (role: "member" | "owner"): Viewer => ({
  email: "a@example.test",
  member: {
    email: "a@example.test",
    id: `mem_${"a".repeat(32)}`,
    name: null,
    role,
  },
  state: "member",
});

describe("isSameOrigin", () => {
  it("accepts the App's own origin and refuses others or none", () => {
    expect(isSameOrigin(request({ origin: ORIGIN }))).toBe(true);
    expect(isSameOrigin(request({ "sec-fetch-site": "same-origin" }))).toBe(
      true
    );
    expect(isSameOrigin(request({ origin: "https://evil.example" }))).toBe(
      false
    );
    expect(
      isSameOrigin(
        request({
          origin: "https://evil.example",
          "sec-fetch-site": "same-origin",
        })
      )
    ).toBe(false);
    expect(isSameOrigin(request({ "sec-fetch-site": "cross-site" }))).toBe(
      false
    );
    expect(isSameOrigin(request())).toBe(false);
  });
});

describe("authorise", () => {
  beforeEach(() => {
    state.viewer = member("member");
  });

  it("refuses a cross-site write before looking at the session", async () => {
    const result = await authorise(
      request({ origin: "https://evil.example" }),
      { write: true }
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.response.status).toBe(403);
  });

  it.each([
    [{ state: "sign-in-unavailable" }, 503],
    [{ state: "signed-out" }, 401],
    [{ email: "a@example.test", state: "app-unavailable" }, 503],
    [{ email: "a@example.test", revoked: true, state: "no-access" }, 403],
  ])("refuses %j", async (viewer, status) => {
    state.viewer = viewer;
    const result = await authorise(request({ origin: ORIGIN }), {
      write: true,
    });
    expect(!result.ok && result.response.status).toBe(status);
  });

  it("keeps owner-only actions from members", async () => {
    const result = await authorise(request({ origin: ORIGIN }), {
      owner: true,
      write: true,
    });
    expect(!result.ok && result.response.status).toBe(403);
    state.viewer = member("owner");
    const asOwner = await authorise(request({ origin: ORIGIN }), {
      owner: true,
      write: true,
    });
    expect(asOwner.ok).toBe(true);
  });
});

describe("readJson", () => {
  it("refuses a body not declared as JSON, so a plain form post can't reach a handler", async () => {
    const form = new Request(ORIGIN, {
      body: "{}",
      headers: { "content-type": "text/plain" },
      method: "POST",
    });
    await expect(readJson(form)).rejects.toThrow(TypeError);
  });
});
