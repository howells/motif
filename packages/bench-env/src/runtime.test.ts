import { describe, expect, it } from "vitest";

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
