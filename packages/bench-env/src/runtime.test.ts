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

describe("App credentials", () => {
  it("reports each credential independently", async () => {
    const { getAppCredentials } = await import("./runtime");
    const credentials = getAppCredentials({ FAL_KEY: "fal_test" });
    expect(credentials.falKey).toBe("fal_test");
    expect(credentials.databaseUrl).toBeNull();
    expect(credentials.blobToken).toBeNull();
    expect(credentials.workos).toBeNull();
  });

  it("requires all three WorkOS values and a 32-character cookie password", async () => {
    const { getAppCredentials } = await import("./runtime");
    const partial = getAppCredentials({
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "too-short",
    });
    expect(partial.workos).toBeNull();
    const complete = getAppCredentials({
      WORKOS_API_KEY: "sk_test",
      WORKOS_CLIENT_ID: "client_test",
      WORKOS_COOKIE_PASSWORD: "x".repeat(32),
    });
    expect(complete.workos?.clientId).toBe("client_test");
  });
});
