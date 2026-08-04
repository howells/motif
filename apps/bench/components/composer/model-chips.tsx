"use client";

import { formatUsd } from "@/lib/format";
import { modelTierGroups } from "@/lib/model-tiers";
import { cn } from "@/lib/utils";

interface ModelChipsProps {
  readonly onToggle: (alias: string) => void;
  readonly selected: ReadonlySet<string>;
}

/** All 23 models, grouped by price tier (`docs/arc/bench/BRIEF.md`, UI
 * section). Each chip shows its worst-case per-image cost so the total at
 * the bottom of the composer is never a surprise.
 *
 * Selection reads as an accent *edge*, not an accent fill
 * (`docs/design/specs/design-bench.md`): the left border is 2px in both
 * states — transparent when unselected — so toggling a chip never reflows
 * the row. Tier labels are sentence-case muted text, deliberately not
 * uppercase eyebrows. */
export const ModelChips = ({ onToggle, selected }: ModelChipsProps) => {
  const groups = modelTierGroups();

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) =>
        group.routes.length === 0 ? null : (
          <div className="flex flex-col gap-2" key={group.label}>
            <p className="text-[13px] text-muted">{group.label}</p>
            <div className="flex flex-wrap gap-1.5">
              {group.routes.map((route) => {
                const isSelected = selected.has(route.alias);
                return (
                  <button
                    aria-pressed={isSelected}
                    className={cn(
                      "inline-flex cursor-pointer items-center gap-2 rounded-md border border-l-2 px-2.5 py-1.5 transition-colors duration-150",
                      isSelected
                        ? "border-border border-l-accent bg-surface-soft text-ink"
                        : "border-border border-l-transparent bg-surface text-muted hover:border-ink hover:border-l-transparent hover:text-ink"
                    )}
                    key={route.alias}
                    onClick={() => {
                      onToggle(route.alias);
                    }}
                    type="button"
                  >
                    <span className="font-mono text-[13px]">{route.alias}</span>
                    <span className="bench-numeric text-[11px] text-muted">
                      {formatUsd(
                        Math.round(route.pricing.estimatedCostUsd * 1_000_000)
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
};
