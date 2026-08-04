"use client";

import type { ModelAggregate } from "@motif/bench-core";

import type { ModelQuality } from "@/lib/verdicts";

interface ScatterPoint {
  readonly costUsd: number;
  readonly modelAlias: string;
  readonly quality: number;
}

interface ScatterChartProps {
  readonly quality: readonly ModelQuality[];
  readonly timing: readonly ModelAggregate[];
}

const WIDTH = 640;
const HEIGHT = 360;
const MARGIN = { bottom: 44, left: 52, right: 20, top: 16 };

const buildPoints = (
  timing: readonly ModelAggregate[],
  quality: readonly ModelQuality[]
): ScatterPoint[] => {
  const qualityByAlias = new Map(
    quality.map((entry) => [entry.modelAlias, entry])
  );
  const points: ScatterPoint[] = [];
  for (const model of timing) {
    const modelQuality = qualityByAlias.get(model.modelAlias);
    if (
      model.cost.totalKnownMicros === null ||
      model.cost.knownCount === 0 ||
      modelQuality?.meanOverall === null ||
      modelQuality?.meanOverall === undefined
    ) {
      continue;
    }
    points.push({
      costUsd: model.cost.totalKnownMicros / model.cost.knownCount / 1_000_000,
      modelAlias: model.modelAlias,
      quality: modelQuality.meanOverall,
    });
  }
  return points;
};

/** `other` dominates `candidate` if it costs no more, scores no less, and
 * differs on at least one of the two axes — i.e. `other` is unambiguously
 * as-good-or-better. */
const dominates = (other: ScatterPoint, candidate: ScatterPoint): boolean => {
  const noWorse =
    other.costUsd <= candidate.costUsd && other.quality >= candidate.quality;
  const strictlyBetter =
    other.costUsd < candidate.costUsd || other.quality > candidate.quality;
  return other !== candidate && noWorse && strictlyBetter;
};

/** A point is Pareto-optimal if no other point dominates it. */
const paretoFrontier = (points: readonly ScatterPoint[]): ScatterPoint[] =>
  points
    .filter((candidate) => !points.some((other) => dominates(other, candidate)))
    .toSorted((left, right) => left.costUsd - right.costUsd);

/** Cost/quality scatter with the Pareto frontier traced — inline SVG, no
 * chart library (`docs/arc/bench/BRIEF.md`, UI section). Only models with
 * both a known cost and at least one scored judgment plot; everything else
 * is the same pre-judge empty state the verdict strip uses. */
export const ScatterChart = ({ timing, quality }: ScatterChartProps) => {
  const points = buildPoints(timing, quality);

  if (points.length === 0) {
    return (
      <div className="empty-state">
        No cost/quality pairs yet — judge this run to plot the Pareto frontier.
      </div>
    );
  }

  const maxCost = Math.max(...points.map((p) => p.costUsd), 0.001);
  const maxQuality = 4;
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const xFor = (costUsd: number) =>
    MARGIN.left + (costUsd / maxCost) * plotWidth;
  const yFor = (qualityValue: number) =>
    MARGIN.top + plotHeight - (qualityValue / maxQuality) * plotHeight;

  const frontier = paretoFrontier(points);
  const frontierPath = frontier
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xFor(point.costUsd)},${yFor(point.quality)}`
    )
    .join(" ");
  const frontierSet = new Set(frontier.map((point) => point.modelAlias));

  const yTicks = [0, 1, 2, 3, 4];
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * maxCost);

  return (
    <div className="scatter-wrap">
      <svg
        aria-label="Cost versus quality scatter plot with the Pareto frontier highlighted"
        height={HEIGHT}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
      >
        {yTicks.map((tick) => (
          <g key={`y-${tick}`}>
            <line
              stroke="var(--border)"
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
            />
            <text
              fill="var(--text-faint)"
              fontSize={10}
              textAnchor="end"
              x={MARGIN.left - 8}
              y={yFor(tick) + 3}
            >
              {tick}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text
            fill="var(--text-faint)"
            fontSize={10}
            key={`x-${tick}`}
            textAnchor="middle"
            x={xFor(tick)}
            y={HEIGHT - MARGIN.bottom + 16}
          >
            ${tick.toFixed(3)}
          </text>
        ))}
        <text
          fill="var(--text-dim)"
          fontSize={11}
          textAnchor="middle"
          transform={`translate(14 ${MARGIN.top + plotHeight / 2}) rotate(-90)`}
        >
          quality (overall)
        </text>
        <text
          fill="var(--text-dim)"
          fontSize={11}
          textAnchor="middle"
          x={WIDTH / 2}
          y={HEIGHT - 6}
        >
          cost per image (USD)
        </text>

        {frontier.length > 1 ? (
          <path
            d={frontierPath}
            fill="none"
            stroke="var(--accent)"
            strokeDasharray="4 3"
            strokeWidth={1.5}
          />
        ) : null}

        {points.map((point) => (
          <g key={point.modelAlias}>
            <circle
              cx={xFor(point.costUsd)}
              cy={yFor(point.quality)}
              fill={
                frontierSet.has(point.modelAlias)
                  ? "var(--accent)"
                  : "var(--text-faint)"
              }
              r={frontierSet.has(point.modelAlias) ? 5 : 3.5}
            />
            <text
              fill="var(--text-dim)"
              fontSize={10}
              x={xFor(point.costUsd) + 7}
              y={yFor(point.quality) + 3}
            >
              {point.modelAlias}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
