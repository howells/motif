/**
 * The image layer's network seam. `MotifImageConfig.fetch` takes the SDK's
 * `(url, init)` shape; the `@ai-sdk/*` providers take a full `fetch`.
 */

import type { FalFetch } from "../types";

/** The `fetch` shape the `@ai-sdk/*` provider factories accept. */
export type ProviderFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

function urlOf(input: string | URL | Request): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

/** Adapt a configured fetch for a provider factory; undefined keeps global fetch. */
export function toProviderFetch(
  fetch: FalFetch | undefined
): { fetch: ProviderFetch } | Record<never, never> {
  if (fetch === undefined) {
    return {};
  }
  return {
    fetch: async (input, init) => await fetch(urlOf(input), init ?? {}),
  };
}
