/**
 * A Model is named by its display name wherever a person reads it, never by
 * the alias the run is keyed on. The names come from the same route table the
 * dry run prices from, so a name here is the name the picker shows.
 */
import { BENCH_ROUTES } from "@motif/bench-core";

const NAMES = new Map<string, string>(
  BENCH_ROUTES.map((route) => [route.alias, route.modelName])
);

const PRICES = new Map<string, number>(
  BENCH_ROUTES.map((route) => [route.alias, route.pricing.estimatedCostUsd])
);

/** The display name for an alias. A sample records the name it ran under, so
 * that is preferred; the route table covers everything that has not run yet. */
export const modelNameOf = (alias: string, recorded?: string | null): string =>
  recorded ?? NAMES.get(alias) ?? alias;

/** What one image from this Model costs, before a run says otherwise. */
export const modelPriceUsd = (alias: string): number => PRICES.get(alias) ?? 0;
