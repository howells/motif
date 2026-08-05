import { describe, expect, it } from "vitest";

import { assertSchemaPushTarget } from "./schema-push-target";

const LOOPBACK_DATABASE_URL = "postgresql://bench:local@127.0.0.1:55432/bench";
const LOOPBACK_DIRECT_DATABASE_URL =
  "postgresql://bench:local@localhost:55432/bench";
const REMOTE_DATABASE_URL =
  "postgresql://bench:remote@ep-motif-bench-dev-pooler.us-east-1.aws.neon.tech/bench?sslmode=require";
const REMOTE_DIRECT_DATABASE_URL =
  "postgresql://bench:remote@ep-motif-bench-dev.us-east-1.aws.neon.tech/bench?sslmode=require";

type PushTarget = Parameters<typeof assertSchemaPushTarget>[0];

const remoteDevelopmentTarget = (): PushTarget => ({
  acknowledgedTarget: "motif-bench-dev",
  databaseUrl: REMOTE_DATABASE_URL,
  directDatabaseUrl: REMOTE_DIRECT_DATABASE_URL,
  nodeEnv: "development",
});

describe("assertSchemaPushTarget", () => {
  it("accepts a loopback pair even in CI", () => {
    expect(() => {
      assertSchemaPushTarget({
        ci: true,
        databaseUrl: LOOPBACK_DATABASE_URL,
        directDatabaseUrl: LOOPBACK_DIRECT_DATABASE_URL,
      });
    }).not.toThrow();
  });

  it("accepts an acknowledged matching remote development pair", () => {
    expect(() => {
      assertSchemaPushTarget(remoteDevelopmentTarget());
    }).not.toThrow();
  });

  it("rejects a remote target without the motif-bench-dev acknowledgement", () => {
    expect(() => {
      assertSchemaPushTarget({
        databaseUrl: REMOTE_DATABASE_URL,
        directDatabaseUrl: REMOTE_DIRECT_DATABASE_URL,
        nodeEnv: "development",
      });
    }).toThrow(/development acknowledgement/u);
  });

  it("rejects the materialdesk-dev acknowledgement literal (a different app's target)", () => {
    expect(() => {
      assertSchemaPushTarget({
        ...remoteDevelopmentTarget(),
        acknowledgedTarget: "materialdesk-dev",
      });
    }).toThrow(/development acknowledgement/u);
  });

  it("rejects mismatched pooled and direct remote endpoints", () => {
    expect(() => {
      assertSchemaPushTarget({
        ...remoteDevelopmentTarget(),
        directDatabaseUrl:
          "postgresql://bench:remote@ep-other-project.us-east-1.aws.neon.tech/bench",
      });
    }).toThrow(/do not match/u);
  });

  it("rejects a remote target in CI regardless of acknowledgement", () => {
    expect(() => {
      assertSchemaPushTarget({ ...remoteDevelopmentTarget(), ci: true });
    }).toThrow(/forbidden in CI/u);
  });

  it("rejects production", () => {
    expect(() => {
      assertSchemaPushTarget({
        ...remoteDevelopmentTarget(),
        nodeEnv: "production",
      });
    }).toThrow(/forbidden/u);
  });

  it("rejects any Vercel-flagged target", () => {
    expect(() => {
      assertSchemaPushTarget({ ...remoteDevelopmentTarget(), vercel: "1" });
    }).toThrow(/forbidden/u);
  });

  it("rejects a connection-target override query parameter", () => {
    expect(() => {
      assertSchemaPushTarget({
        ...remoteDevelopmentTarget(),
        databaseUrl: `${REMOTE_DATABASE_URL}&host=evil.example.com`,
      });
    }).toThrow(/overrides are forbidden/u);
  });

  it("rejects a non-PostgreSQL URL without leaking it in the error", () => {
    let thrown: unknown;
    try {
      assertSchemaPushTarget({
        databaseUrl: "https://example.com/not-postgres",
        directDatabaseUrl: LOOPBACK_DIRECT_DATABASE_URL,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Error);
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    expect(message).not.toContain("example.com");
  });
});
