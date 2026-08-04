"use client";

import {
  ASPECT_DIALECT_TABLE,
  BENCH_ASPECTS,
  isUniformAspect,
} from "@/lib/aspect";
import type { BenchAspect } from "@/lib/aspect";
import type { RunSpecInput } from "@/lib/runs/types";

const RESOLUTIONS = ["0.5K", "1K", "2K", "4K"] as const;

/** Narrows a `<select>`'s `event.target.value` (always `string`) against the
 * exact option list it was rendered from — a validated type guard instead of
 * an `as BenchAspect` cast, even though the DOM guarantees the value can
 * only ever be one of the rendered `<option>`s. */
const isBenchAspect = (value: string): value is BenchAspect =>
  (BENCH_ASPECTS as readonly string[]).includes(value);

const isResolution = (value: string): value is RunSpecInput["resolution"] =>
  (RESOLUTIONS as readonly string[]).includes(value);

interface ComposerFieldsProps {
  readonly aspect: BenchAspect;
  readonly concurrency: number;
  readonly judgeAfter: boolean;
  readonly maxEstimatedCostUsd: number;
  readonly onAspectChange: (aspect: BenchAspect) => void;
  readonly onConcurrencyChange: (value: number) => void;
  readonly onJudgeAfterChange: (value: boolean) => void;
  readonly onMaxCostChange: (value: number) => void;
  readonly onResolutionChange: (resolution: RunSpecInput["resolution"]) => void;
  readonly onSamplesPerModelChange: (value: number) => void;
  readonly onSeedChange: (value: number) => void;
  readonly onSeedEnabledChange: (value: boolean) => void;
  readonly resolution: RunSpecInput["resolution"];
  readonly samplesPerModel: number;
  readonly seed: number;
  readonly seedEnabled: boolean;
}

/** The composer's non-prompt, non-model fields: samples/concurrency,
 * aspect/resolution (with the aspect-coercion warning — `docs/arc/bench
 * /BRIEF.md`, UI section), seed, judge-after, and the hard cost cap. Split
 * out of `Composer` purely to keep that component's own body short; this
 * component owns no state of its own. */
export const ComposerFields = ({
  aspect,
  concurrency,
  judgeAfter,
  maxEstimatedCostUsd,
  onAspectChange,
  onConcurrencyChange,
  onJudgeAfterChange,
  onMaxCostChange,
  onResolutionChange,
  onSamplesPerModelChange,
  onSeedChange,
  onSeedEnabledChange,
  resolution,
  samplesPerModel,
  seed,
  seedEnabled,
}: ComposerFieldsProps) => (
  <>
    <div className="field-row">
      <div className="field">
        <label htmlFor="bench-samples">Samples per model</label>
        <input
          id="bench-samples"
          max={4}
          min={1}
          onChange={(event) => {
            onSamplesPerModelChange(Number(event.target.value));
          }}
          type="number"
          value={samplesPerModel}
        />
      </div>
      <div className="field">
        <label htmlFor="bench-concurrency">
          Concurrency{" "}
          {concurrency > 1 ? (
            <span className="badge badge-warn">contended</span>
          ) : null}
        </label>
        <input
          id="bench-concurrency"
          max={8}
          min={1}
          onChange={(event) => {
            onConcurrencyChange(Number(event.target.value));
          }}
          type="number"
          value={concurrency}
        />
      </div>
      <div className="field">
        <label htmlFor="bench-aspect">Aspect</label>
        <select
          id="bench-aspect"
          onChange={(event) => {
            if (isBenchAspect(event.target.value)) {
              onAspectChange(event.target.value);
            }
          }}
          value={aspect}
        >
          {BENCH_ASPECTS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="bench-resolution">Resolution</label>
        <select
          id="bench-resolution"
          onChange={(event) => {
            if (isResolution(event.target.value)) {
              onResolutionChange(event.target.value);
            }
          }}
          value={resolution}
        >
          {RESOLUTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    </div>

    {isUniformAspect(aspect) ? null : (
      <div className="warning-banner">
        <strong>Aspect coercion is not uniform.</strong> At {aspect}, the three
        sizing dialects disagree on the real output shape:{" "}
        <code>aspect_ratio</code> → {ASPECT_DIALECT_TABLE[aspect].aspectRatio},{" "}
        <code>image_size_enum</code> →{" "}
        {ASPECT_DIALECT_TABLE[aspect].falImageSizeEnum}, <code>gpt_size</code> →{" "}
        {ASPECT_DIALECT_TABLE[aspect].gptSize}. Models will be framed
        differently, so quality comparisons across models are compromised. Use{" "}
        <code>1:1</code> for an honest comparison.
      </div>
    )}

    <div className="field-row">
      <div className="checkbox-row">
        <input
          checked={seedEnabled}
          id="bench-seed-enabled"
          onChange={(event) => {
            onSeedEnabledChange(event.target.checked);
          }}
          type="checkbox"
        />
        <label htmlFor="bench-seed-enabled">Fixed seed</label>
        <input
          disabled={!seedEnabled}
          onChange={(event) => {
            onSeedChange(Number(event.target.value));
          }}
          style={{ width: 90 }}
          type="number"
          value={seed}
        />
      </div>
      <div className="checkbox-row">
        <input
          checked={judgeAfter}
          id="bench-judge-after"
          onChange={(event) => {
            onJudgeAfterChange(event.target.checked);
          }}
          type="checkbox"
        />
        <label htmlFor="bench-judge-after">
          Judge automatically after completion
        </label>
      </div>
    </div>

    <div className="field" style={{ maxWidth: 220 }}>
      <label htmlFor="bench-max-cost">Hard cost cap (USD)</label>
      <input
        id="bench-max-cost"
        min={0.01}
        onChange={(event) => {
          onMaxCostChange(Number(event.target.value));
        }}
        step={0.01}
        type="number"
        value={maxEstimatedCostUsd}
      />
    </div>
  </>
);
