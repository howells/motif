/**
 * The Models a Comparison can hold against the cap, in Motif's generation
 * ranking. Server-only: it reads the App's bound table.
 */
import { TASKS } from "@howells/motif-sdk";

import type { CompareModel } from "@/components/app/compare/compare-setup";
import { BOUNDED_GENERATION_MODELS } from "@/lib/app/budget/bounds";

export const compareModels = (): CompareModel[] => {
  const ranked = TASKS.generate.models.filter(
    (entry) => entry.mode === undefined
  );
  const order = [...new Set(ranked.map((entry) => entry.model))];
  return BOUNDED_GENERATION_MODELS.map((model) => {
    const position = order.indexOf(model);
    return {
      model,
      rank: position === -1 ? null : position + 1,
      tier: ranked.find((entry) => entry.model === model)?.tier ?? null,
    };
  }).toSorted((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
};
