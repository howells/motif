import { describe, expect, it } from "vitest";

import { isVercelRuntime } from "./runtime";

describe("Vercel runtime detection", () => {
  it("recognises the platform marker without live credentials", () => {
    expect(isVercelRuntime({ VERCEL: "1" })).toBe(true);
  });

  it.each([{}, { NODE_ENV: "production" }, { VERCEL: "0" }])(
    "keeps local servers unbounded for %j",
    (environment) => {
      expect(isVercelRuntime(environment)).toBe(false);
    }
  );
});
