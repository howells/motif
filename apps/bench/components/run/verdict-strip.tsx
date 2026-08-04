"use client";

import { formatMs, formatUsd } from "@/lib/format";
import type { VerdictPick, VerdictStripData } from "@/lib/verdicts";

interface TileProps {
  readonly formatValue: (pick: VerdictPick) => string;
  readonly label: string;
  readonly pick: VerdictPick | null;
}

const Tile = ({ label, pick, formatValue }: TileProps) => (
  <div className="verdict-tile">
    <div className="verdict-label">{label}</div>
    {pick ? (
      <>
        <div className="verdict-value">{formatValue(pick)}</div>
        <div className="verdict-sub">
          {pick.modelAlias} · {pick.sublabel}
        </div>
      </>
    ) : (
      <>
        <div className="verdict-value" style={{ color: "var(--text-faint)" }}>
          —
        </div>
        <div className="verdict-sub">not enough data yet</div>
      </>
    )}
  </div>
);

/** Fastest / Best quality / Cheapest / Best value — each with a real
 * pre-judge empty state (`docs/arc/bench/BRIEF.md`, UI section), not a
 * placeholder number. Quality-dependent tiles stay empty until at least one
 * sample has a `scored` judgment. */
export const VerdictStrip = ({ data }: { data: VerdictStripData }) => (
  <div className="verdict-strip">
    <Tile
      formatValue={(pick) => formatMs(Number(pick.value))}
      label="Fastest"
      pick={data.fastest}
    />
    <Tile
      formatValue={(pick) => Number(pick.value).toFixed(2)}
      label="Best quality"
      pick={data.hasAnyJudgments ? data.bestQuality : null}
    />
    <Tile
      formatValue={(pick) => formatUsd(Math.round(Number(pick.value)))}
      label="Cheapest"
      pick={data.cheapest}
    />
    <Tile
      formatValue={(pick) => `${Number(pick.value).toFixed(1)} pts/$`}
      label="Best value"
      pick={data.hasAnyJudgments ? data.bestValue : null}
    />
  </div>
);
