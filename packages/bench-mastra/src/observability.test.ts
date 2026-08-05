import type { Mastra } from "@mastra/core";
import { describe, expect, it, vi } from "vitest";

import { guardedFlush } from "./observability";

/** A `Mastra` instance has many members `guardedFlush` never touches — this
 * builds only the two it calls (`observability.flush`, `getLogger().debug`)
 * and casts through `unknown`, matching this repo's convention for a
 * deliberately narrow test double (see `bench-env/src/server.ts`). */
const fakeMastra = (
  flush: () => Promise<void>,
  debug: (message: string, fields: Record<string, unknown>) => void
): Mastra => {
  const stub = { getLogger: () => ({ debug }), observability: { flush } };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- deliberately narrow test double; only the two members above are exercised
  return stub as unknown as Mastra;
};

describe("guardedFlush", () => {
  it("never throws, even when the underlying flush rejects", async () => {
    const debug =
      vi.fn<(message: string, fields: Record<string, unknown>) => void>();
    // oxlint-disable-next-line require-await -- Mastra's flush() type requires a Promise; this stub's failure is synchronous
    const mastra = fakeMastra(async () => {
      throw new Error("boom");
    }, debug);

    await expect(guardedFlush(mastra, "test")).resolves.toBeUndefined();
    expect(debug).toHaveBeenCalledWith(
      "test trace flush failed",
      // oxlint-disable-next-line no-unsafe-assignment -- vitest's `expect.any()` asymmetric matcher is typed `any` by the library itself
      expect.objectContaining({ flushError: expect.any(Error) })
    );
  });

  it("resolves quietly when the flush succeeds", async () => {
    // oxlint-disable-next-line require-await -- Mastra's flush() type requires a Promise; this stub's success is synchronous
    const mastra = fakeMastra(async () => {
      // Resolves with no value — a successful flush.
    }, vi.fn<(message: string, fields: Record<string, unknown>) => void>());

    await expect(guardedFlush(mastra, "test")).resolves.toBeUndefined();
  });
});
