"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ASPECT_DIALECT_TABLE,
  BENCH_ASPECTS,
  isUniformAspect,
} from "@/lib/aspect";
import type { BenchAspect } from "@/lib/aspect";
import type { RunSpecInput } from "@/lib/runs/types";

const RESOLUTIONS = ["0.5K", "1K", "2K", "4K"] as const;

/** Narrows a select's committed value (always `string`) against the exact
 * option list it was rendered from — a validated type guard instead of an
 * `as BenchAspect` cast, even though the control guarantees the value can
 * only ever be one of the rendered items. */
const isBenchAspect = (value: string): value is BenchAspect =>
  (BENCH_ASPECTS as readonly string[]).includes(value);

const isResolution = (value: string): value is RunSpecInput["resolution"] =>
  (RESOLUTIONS as readonly string[]).includes(value);

/** One labelled control. The label is muted 13px and the control below it —
 * the field's own value is the thing with contrast, not its name. */
const Field = ({
  children,
  htmlFor,
  label,
}: {
  readonly children: ReactNode;
  readonly htmlFor: string;
  readonly label: ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-1.5">
    <label className="text-[13px] text-muted" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
  </div>
);

/** The aspect-coercion warning (`docs/arc/bench/BRIEF.md`, UI section). It
 * spells out all three sizing dialects' real output rather than saying
 * "framing may differ", because the discrepancy is the whole point: at any
 * aspect but 1:1 a cross-model quality comparison is dishonest, and the
 * concrete numbers are what make that believable. A warn-coloured left rule,
 * not a tinted panel — the house theme earns emphasis from rules, not fills. */
const AspectCoercionNote = ({ aspect }: { readonly aspect: BenchAspect }) => {
  if (isUniformAspect(aspect)) {
    return null;
  }
  const dialects = ASPECT_DIALECT_TABLE[aspect];
  return (
    <p className="max-w-[68ch] rounded-lg border border-border border-l-2 border-l-warn bg-surface-soft px-3.5 py-3 text-[13px] leading-[1.55] text-muted">
      <span className="text-ink">Aspect coercion is not uniform.</span> At{" "}
      <span className="bench-numeric">{aspect}</span> the three sizing dialects
      disagree on the real output shape: aspect_ratio →{" "}
      <span className="bench-numeric">{dialects.aspectRatio}</span>,
      image_size_enum →{" "}
      <span className="bench-numeric">{dialects.falImageSizeEnum}</span>,
      gpt_size → <span className="bench-numeric">{dialects.gptSize}</span>.
      Models will be framed differently, so quality comparisons across models
      are compromised. Use <span className="bench-numeric">1:1</span> for an
      honest comparison.
    </p>
  );
};

interface ComposerFieldsProps {
  readonly aspect: BenchAspect;
  readonly concurrency: number;
  readonly maxEstimatedCostUsd: number;
  readonly onAspectChange: (aspect: BenchAspect) => void;
  readonly onConcurrencyChange: (value: number) => void;
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
  maxEstimatedCostUsd,
  onAspectChange,
  onConcurrencyChange,
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
  <div className="flex flex-col gap-5">
    <ShapeFields
      aspect={aspect}
      concurrency={concurrency}
      onAspectChange={onAspectChange}
      onConcurrencyChange={onConcurrencyChange}
      onResolutionChange={onResolutionChange}
      onSamplesPerModelChange={onSamplesPerModelChange}
      resolution={resolution}
      samplesPerModel={samplesPerModel}
    />

    <AspectCoercionNote aspect={aspect} />

    <ToggleFields
      maxEstimatedCostUsd={maxEstimatedCostUsd}
      onMaxCostChange={onMaxCostChange}
      onSeedChange={onSeedChange}
      onSeedEnabledChange={onSeedEnabledChange}
      seed={seed}
      seedEnabled={seedEnabled}
    />
  </div>
);

/** Samples, parallelism, aspect and resolution — the four fields that decide
 * what shape of image comes back, laid out as one 4-up row so the whole
 * request reads in a single glance. */
const ShapeFields = ({
  aspect,
  concurrency,
  onAspectChange,
  onConcurrencyChange,
  onResolutionChange,
  onSamplesPerModelChange,
  resolution,
  samplesPerModel,
}: Pick<
  ComposerFieldsProps,
  | "aspect"
  | "concurrency"
  | "onAspectChange"
  | "onConcurrencyChange"
  | "onResolutionChange"
  | "onSamplesPerModelChange"
  | "resolution"
  | "samplesPerModel"
>) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
    <Field htmlFor="bench-samples" label="Samples per model">
      <Input
        className="bench-numeric"
        id="bench-samples"
        max={4}
        min={1}
        onChange={(event) => {
          onSamplesPerModelChange(Number(event.target.value));
        }}
        type="number"
        value={samplesPerModel}
      />
    </Field>

    <Field
      htmlFor="bench-concurrency"
      label={
        <span className="flex items-center gap-1.5">
          Parallel
          {concurrency > 1 ? <Badge variant="warn">contended</Badge> : null}
        </span>
      }
    >
      <Input
        className="bench-numeric"
        id="bench-concurrency"
        max={8}
        min={1}
        onChange={(event) => {
          onConcurrencyChange(Number(event.target.value));
        }}
        type="number"
        value={concurrency}
      />
    </Field>

    <Field htmlFor="bench-aspect" label="Aspect">
      <Select
        onValueChange={(value) => {
          if (isBenchAspect(value)) {
            onAspectChange(value);
          }
        }}
        value={aspect}
      >
        <SelectTrigger className="bench-numeric" id="bench-aspect">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BENCH_ASPECTS.map((value) => (
            <SelectItem className="bench-numeric" key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>

    <Field htmlFor="bench-resolution" label="Resolution">
      <Select
        onValueChange={(value) => {
          if (isResolution(value)) {
            onResolutionChange(value);
          }
        }}
        value={resolution}
      >
        <SelectTrigger className="bench-numeric" id="bench-resolution">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RESOLUTIONS.map((value) => (
            <SelectItem className="bench-numeric" key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  </div>
);

/** Seed, judge-after and the hard cost cap: the three settings that are
 * about how the run *behaves* rather than what it produces. */
const ToggleFields = ({
  maxEstimatedCostUsd,
  onMaxCostChange,
  onSeedChange,
  onSeedEnabledChange,
  seed,
  seedEnabled,
}: Pick<
  ComposerFieldsProps,
  | "maxEstimatedCostUsd"
  | "onMaxCostChange"
  | "onSeedChange"
  | "onSeedEnabledChange"
  | "seed"
  | "seedEnabled"
>) => (
  <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
    <div className="flex items-center gap-2.5">
      <Checkbox
        checked={seedEnabled}
        id="bench-seed-enabled"
        onCheckedChange={(checked) => {
          onSeedEnabledChange(checked === true);
        }}
      />
      <label className="text-[13px] text-muted" htmlFor="bench-seed-enabled">
        Fixed seed
      </label>
      <Input
        aria-label="Seed value"
        className="bench-numeric w-[84px]"
        disabled={!seedEnabled}
        onChange={(event) => {
          onSeedChange(Number(event.target.value));
        }}
        type="number"
        value={seed}
      />
    </div>

    <div className="flex items-center gap-2.5">
      <label className="text-[13px] text-muted" htmlFor="bench-max-cost">
        Stop above
      </label>
      <Input
        className="bench-numeric w-[92px]"
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
  </div>
);
