import type { SampleRecord } from "@/lib/runs/types";

/** Samples grouped by Model, in the order each Model first appears, and by
 * sample number within it. This is the order the sheet shows them in and the
 * order the inspector steps through. */
export const groupByModel = (
  samples: readonly SampleRecord[]
): [string, SampleRecord[]][] => {
  const groups = new Map<string, SampleRecord[]>();
  for (const sample of samples) {
    groups.set(sample.modelAlias, [
      ...(groups.get(sample.modelAlias) ?? []),
      sample,
    ]);
  }
  return [...groups.entries()].map(([alias, group]) => [
    alias,
    group.toSorted((left, right) => left.sampleIndex - right.sampleIndex),
  ]);
};
