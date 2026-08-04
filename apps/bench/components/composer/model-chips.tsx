"use client";

import { formatUsd } from "@/lib/format";
import { modelTierGroups } from "@/lib/model-tiers";

interface ModelChipsProps {
  readonly onToggle: (alias: string) => void;
  readonly selected: ReadonlySet<string>;
}

/** All 23 models, grouped by price tier (`docs/arc/bench/BRIEF.md`, UI
 * section). Each chip shows its worst-case per-image cost so the total at
 * the bottom of the composer is never a surprise. */
export const ModelChips = ({ onToggle, selected }: ModelChipsProps) => {
  const groups = modelTierGroups();

  return (
    <div>
      {groups.map((group) =>
        group.routes.length === 0 ? null : (
          <div key={group.label}>
            <div className="tier-label">{group.label}</div>
            <div className="chip-group">
              {group.routes.map((route) => {
                const isSelected = selected.has(route.alias);
                return (
                  <button
                    aria-pressed={isSelected}
                    className="chip"
                    key={route.alias}
                    onClick={() => {
                      onToggle(route.alias);
                    }}
                    type="button"
                  >
                    <span>{route.alias}</span>
                    <span className="chip-cost">
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
