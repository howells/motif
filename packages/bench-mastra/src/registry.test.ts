/**
 * Pin the Studio/MCP-visible registry surface: the `mastra` singleton must
 * expose exactly the `benchmark-run` workflow and no agents. `@motif/bench-
 * env/server`'s eager env parse is stubbed so importing the real singleton
 * doesn't require a populated server env (`DATABASE_URL` etc.), and
 * `./observability` is stubbed so constructing it doesn't need real Langfuse
 * credentials — same shape as materialdesk's `packages/mastra/src/
 * registry.test.ts` (`docs/arc/bench/BRIEF.md` precedent table).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@motif/bench-env/server", () => ({
  // A syntactically valid Postgres URL — `createMastraPool` (`@howells/neon/
  // mastra`) constructs a real (but unconnected) `pg.Pool` from this at
  // import time, so it must parse as a URL even though nothing ever
  // connects it (`BRIEF.md`, this phase: no provisioned DB).
  requireServerEnv: () => "postgresql://mock:mock@localhost:5432/mock",
}));

vi.mock("./observability", () => ({ logger: null, observability: null }));

describe("mastra registry", () => {
  it("registers exactly the benchmark-run workflow", async () => {
    const { mastra } = await import("./index");

    expect(Object.keys(mastra.listWorkflows()).toSorted()).toEqual([
      "benchmark-run",
    ]);

    const benchmarkRun = mastra.getWorkflow("benchmark-run");
    expect(benchmarkRun.id).toBe("benchmark-run");
  });

  it("registers no agents — this package is orchestration workflows only", async () => {
    const { mastra } = await import("./index");

    expect(Object.keys(mastra.listAgents())).toEqual([]);
  });
});
