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

/** Fixed pixel geometry, not a percentage width. Scaling an SVG scales its
 * type with it, which would put a fifth size on a page the spec caps at four
 * — so the chart keeps its natural size and the container scrolls when the
 * viewport is narrower than it is. */
const WIDTH = 1040;
const HEIGHT = 360;
const MARGIN = { bottom: 46, left: 40, right: 120, top: 30 };

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

/** Gridlines and tick labels. Quality's domain is the rubric's fixed 0–4,
 * not the observed range: rescaling to the data would make a run where every
 * model scored 2.9–3.1 look like a dramatic spread. */
const Axes = ({
  maxCost,
  xFor,
  yFor,
}: {
  readonly maxCost: number;
  readonly xFor: (costUsd: number) => number;
  readonly yFor: (qualityValue: number) => number;
}) => (
  <>
    {[0, 1, 2, 3, 4].map((tick) => (
      <g key={`y-${tick}`}>
        <line
          className="stroke-border-soft"
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={yFor(tick)}
          y2={yFor(tick)}
        />
        <text
          className="fill-muted"
          fontSize={11}
          textAnchor="end"
          x={MARGIN.left - 10}
          y={yFor(tick) + 4}
        >
          {tick}
        </text>
      </g>
    ))}
    {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
      <text
        className="fill-muted"
        fontSize={11}
        key={`x-${fraction}`}
        textAnchor="middle"
        x={xFor(fraction * maxCost)}
        y={HEIGHT - MARGIN.bottom + 18}
      >
        ${(fraction * maxCost).toFixed(3)}
      </text>
    ))}
  </>
);

/** Cost/quality scatter with the Pareto frontier traced — inline SVG, no
 * chart library (`docs/arc/bench/BRIEF.md`, UI section). Only models with
 * both a known cost and at least one scored judgment plot; everything else
 * is the same pre-judge empty state the verdict band uses.
 *
 * The accent is spent on the frontier alone: on-frontier models are forest,
 * dominated ones are muted, and the grid is `border-soft` hairlines. Colour
 * is doing one job here — "these are the models worth considering" — and
 * every mark also carries its alias as text. */
export const ScatterChart = ({ quality, timing }: ScatterChartProps) => {
  const points = buildPoints(timing, quality);

  if (points.length === 0) {
    return (
      <p className="max-w-[52ch] text-[13px] leading-[1.6] text-muted">
        No cost/quality pairs yet — judge this run to plot the Pareto frontier.
      </p>
    );
  }

  const maxCost = Math.max(...points.map((point) => point.costUsd), 0.001);
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

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <svg
          aria-label="Cost versus quality scatter plot with the Pareto frontier highlighted"
          className="block font-mono tabular-nums"
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
        >
          <title>Cost versus quality, with the Pareto frontier traced</title>

          {/* Axis titles sit outside the plot, at the two ends the eye already
              travels to: quality above its scale, cost below its own. */}
          <text className="fill-muted" fontSize={11} x={0} y={11}>
            quality
          </text>
          <text
            className="fill-muted"
            fontSize={11}
            textAnchor="end"
            x={WIDTH - MARGIN.right}
            y={HEIGHT - 6}
          >
            cost per image
          </text>

          <Axes maxCost={maxCost} xFor={xFor} yFor={yFor} />

          {frontier.length > 1 ? (
            <path
              className="stroke-accent"
              d={frontierPath}
              fill="none"
              strokeDasharray="3 3"
              strokeWidth={1.25}
            />
          ) : null}

          {points.map((point) => {
            const onFrontier = frontierSet.has(point.modelAlias);
            return (
              <g key={point.modelAlias}>
                <circle
                  className={onFrontier ? "fill-accent" : "fill-muted"}
                  cx={xFor(point.costUsd)}
                  cy={yFor(point.quality)}
                  r={onFrontier ? 4.5 : 3}
                />
                <text
                  className={onFrontier ? "fill-ink" : "fill-muted"}
                  fontSize={11}
                  x={xFor(point.costUsd) + 8}
                  y={yFor(point.quality) + 4}
                >
                  {point.modelAlias}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="max-w-[68ch] text-[13px] leading-[1.55] text-muted">
        The dashed line traces the Pareto frontier: models nothing else in this
        run beats on both price and quality. Anything below and right of it is
        dominated — you can have its quality for less, or more quality for its
        price.
      </p>
    </div>
  );
};
