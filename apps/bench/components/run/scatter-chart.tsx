"use client";

import type { ModelAggregate } from "@motif/bench-core";

import { modelNameOf } from "@/lib/model-names";
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
 * type with it, which would put a sixth size on the screen, so the chart keeps
 * its natural size and its container scrolls on a narrower viewport. */
const WIDTH = 880;
const HEIGHT = 440;
const MARGIN = { bottom: 44, left: 48, right: 144, top: 16 };

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
      modelQuality?.meanStars === null ||
      modelQuality?.meanStars === undefined
    ) {
      continue;
    }
    points.push({
      costUsd: model.cost.totalKnownMicros / model.cost.knownCount / 1_000_000,
      modelAlias: model.modelAlias,
      quality: modelQuality.meanStars,
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

/** Gridlines and tick labels. Quality's domain is the star scale's fixed
 * 0 to 5, not the observed range: rescaling to the data would make a run where
 * every Model was rated 3.9 to 4.1 look like a dramatic spread. */
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
    {[0, 1, 2, 3, 4, 5].map((tick) => (
      <g key={`y-${tick}`}>
        <line
          className="stroke-border"
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={yFor(tick)}
          y2={yFor(tick)}
        />
        <text
          className="fill-ink"
          fontSize={13}
          textAnchor="end"
          x={MARGIN.left - 12}
          y={yFor(tick) + 4}
        >
          {tick}
        </text>
      </g>
    ))}
    {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
      <text
        className="fill-ink"
        fontSize={13}
        key={`x-${fraction}`}
        textAnchor="middle"
        x={xFor(fraction * maxCost)}
        y={HEIGHT - MARGIN.bottom + 24}
      >
        ${(fraction * maxCost).toFixed(3)}
      </text>
    ))}
  </>
);

/** Cost against quality with the Pareto frontier traced, as inline SVG with no
 * chart library. Only Models with both a known cost and at least one rating
 * plot. Green marks the frontier and does only that job: the Models worth
 * considering. The rest are grey, and every mark carries its Model's name. */
export const ScatterChart = ({ quality, timing }: ScatterChartProps) => {
  const points = buildPoints(timing, quality);
  const ratings = quality.reduce((sum, entry) => sum + entry.ratedCount, 0);

  if (points.length === 0) {
    return <p className="text-muted type-small">Not rated</p>;
  }

  const maxCost = Math.max(...points.map((point) => point.costUsd), 0.001);
  const maxQuality = 5;
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
    <div className="flex flex-col gap-4">
      <div className="type-small flex items-center justify-between gap-4">
        <span className="text-muted">Mean rating</span>
        <span className="text-muted flex items-center gap-2">
          <span aria-hidden="true" className="bg-ok h-px w-6" />
          Pareto frontier
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          aria-label="Mean rating against cost per image, with the Pareto frontier"
          className="block tabular-nums"
          height={HEIGHT}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
        >
          <title>Mean rating against cost per image</title>

          <Axes maxCost={maxCost} xFor={xFor} yFor={yFor} />

          {frontier.length > 1 ? (
            <path
              className="stroke-ok"
              d={frontierPath}
              fill="none"
              strokeWidth={1.5}
            />
          ) : null}

          {points.map((point) => {
            const onFrontier = frontierSet.has(point.modelAlias);
            const x = xFor(point.costUsd);
            const y = yFor(point.quality);
            return (
              <g key={point.modelAlias}>
                <circle
                  className={onFrontier ? "fill-ok" : "fill-muted"}
                  cx={x}
                  cy={y}
                  r={4}
                />
                {/* Under and to the right of the mark, so the frontier line
                    that runs through it never strikes the name out. */}
                <text fontSize={13} x={x + 16} y={y + 4}>
                  <tspan className="fill-ink" fontWeight={500}>
                    {modelNameOf(point.modelAlias)}
                  </tspan>
                  <tspan className="fill-muted" dx={8}>
                    {point.quality.toFixed(1)} ★
                  </tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="type-small flex items-center justify-between gap-4">
        <span className="text-muted">Cost per image</span>
        <span className="text-muted">
          {ratings} rating{ratings === 1 ? "" : "s"} · costs estimated
        </span>
      </div>
    </div>
  );
};
