// This spends no credits: it only fetches fal's public OpenAPI schema documents
// and never runs a model. Do not gate it behind RUN_FAL_CANARY.
//
// Checks every entry in FAL_TOOLS against fal's live OpenAPI document for that
// endpoint: the endpoint must still exist, and every key the registry claims
// in `outputKeys` must still appear in the endpoint's real Output schema.
// A stale entry (deprecated endpoint, renamed field) only fails at runtime
// today, after fal has billed the call — this catches it ahead of time.
//
// Mirrors the fetch-and-parse approach in scripts/fal-schema.mjs.

import { describe, expect, it } from "vitest";

import { isRecord } from "../src/fal-parse";
import { FAL_TOOL_IDS, FAL_TOOLS } from "../src/tools";

const OPENAPI_URL =
  "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_CONCURRENCY = 6;

const describeDrift =
  process.env.RUN_REGISTRY_DRIFT === "1" ? describe : describe.skip;

interface EndpointCheck {
  endpoint: string;
  liveOutputKeys: string[];
  missingKeys: string[];
  toolId: string;
}

/** `doc.components.schemas`, or `{}` if the document doesn't have that shape. */
function extractSchemas(doc: unknown): Record<string, unknown> {
  if (!isRecord(doc) || !isRecord(doc.components)) {
    return {};
  }
  return isRecord(doc.components.schemas) ? doc.components.schemas : {};
}

/** `schema.properties`, or `undefined` if the schema doesn't have that shape. */
function extractProperties(
  schema: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return undefined;
  }
  return schema.properties;
}

async function fetchOutputKeys(endpoint: string): Promise<string[]> {
  const url = `${OPENAPI_URL}${encodeURIComponent(endpoint)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (error) {
    throw new Error(
      `fal OpenAPI document unreachable for endpoint "${endpoint}" (${url}). ` +
        `This may be a network outage rather than registry drift: ${
          error instanceof Error ? error.message : String(error)
        }`,
      { cause: error }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `fal OpenAPI document returned HTTP ${response.status} for endpoint "${endpoint}" (${url}). ` +
        `The endpoint may have been renamed or removed.`
    );
  }

  const doc: unknown = await response.json();
  const schemas = extractSchemas(doc);
  const outputSchemaName = Object.keys(schemas).find((name) =>
    name.endsWith("Output")
  );
  const outputProperties =
    outputSchemaName === undefined
      ? undefined
      : extractProperties(schemas[outputSchemaName]);

  if (outputProperties === undefined) {
    throw new Error(
      `fal OpenAPI document for endpoint "${endpoint}" has no schema ending in "Output" ` +
        `(${url}). Cannot verify registry output keys.`
    );
  }

  return Object.keys(outputProperties);
}

/** Run `fn` over `items` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const queue = items.map((item, index) => ({ index, item }));

  async function worker(): Promise<void> {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) {
        return;
      }
      results[next.index] = await fn(next.item);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}

describeDrift("fal registry drift", () => {
  // Generous overall timeout: up to ~55 endpoints in batches of MAX_CONCURRENCY,
  // each individual request additionally capped at REQUEST_TIMEOUT_MS.
  it("keeps every FAL_TOOLS entry's outputKeys in sync with fal's live OpenAPI schema", async () => {
    const checks = await mapWithConcurrency(
      FAL_TOOL_IDS,
      MAX_CONCURRENCY,
      async (toolId): Promise<EndpointCheck> => {
        const tool = FAL_TOOLS[toolId];
        const liveOutputKeys = await fetchOutputKeys(tool.endpoint);
        const liveSet = new Set(liveOutputKeys);
        const missingKeys = tool.outputKeys.filter((key) => !liveSet.has(key));

        return { endpoint: tool.endpoint, liveOutputKeys, missingKeys, toolId };
      }
    );

    const drifted = checks.filter((check) => check.missingKeys.length > 0);

    expect(
      drifted,
      drifted
        .map(
          (check) =>
            `tool "${check.toolId}" (endpoint "${check.endpoint}") claims output keys ` +
            `[${check.missingKeys.join(", ")}] that fal no longer returns. ` +
            `fal currently returns: [${check.liveOutputKeys.join(", ")}].`
        )
        .join("\n")
    ).toEqual([]);
  }, 300_000);
});
