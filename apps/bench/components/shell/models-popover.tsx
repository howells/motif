"use client";

import { BENCH_ROUTES, outputFormatReach } from "@motif/bench-core";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ASPECT_DIALECT_TABLE,
  BENCH_ASPECTS,
  isUniformAspect,
} from "@/lib/aspect";
import type { BenchAspect } from "@/lib/aspect";
import { formatUsd } from "@/lib/format";
import { modelTierGroups } from "@/lib/model-tiers";
import type { RunDraft, RunDraftPatch } from "@/lib/run-spec";
import { cheapestModelAliases, DEFAULT_MODEL_COUNT } from "@/lib/run-spec";
import type {
  PreviewModelRow,
  PreviewResult,
  RunSpecInput,
} from "@/lib/runs/types";
import { BENCH_OUTPUT_FORMATS } from "@/lib/runs/types";
import { cn } from "@/lib/utils";

const RESOLUTIONS = ["0.5K", "1K", "2K", "4K"] as const;

/** The sentinel for "no format requested". Radix's Select cannot hold an
 * empty-string value, and `null` is not a `SelectItem` value either, so the
 * one draft state that is genuinely absence needs a name on the wire. */
const FORMAT_DEFAULT = "model-default";

const isBenchAspect = (value: string): value is BenchAspect =>
  (BENCH_ASPECTS as readonly string[]).includes(value);

const isResolution = (value: string): value is RunSpecInput["resolution"] =>
  (RESOLUTIONS as readonly string[]).includes(value);

const toOutputFormat = (value: string): RunSpecInput["outputFormat"] =>
  (BENCH_OUTPUT_FORMATS as readonly string[]).includes(value)
    ? // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- guarded by the includes() on the same line; BENCH_OUTPUT_FORMATS is the enum this narrows to
      (value as NonNullable<RunSpecInput["outputFormat"]>)
    : null;

const usdFromDollars = (usd: number): string =>
  formatUsd(Math.round(usd * 1_000_000));

/** The dry run for one model, as a tooltip on its chip: endpoint, what the
 * request drops, what it coerces, p95 and worst-case price. This is the old
 * preview table's content, per row — moved next to the decision it informs
 * (`docs/design/specs/design-bench-shell.md`: "Preview stops being a wall").
 * It is still a real dry run — `previewRun` aligns and prices with zero fal
 * calls. */
const ModelDryRun = ({
  row,
}: {
  readonly row: PreviewModelRow | undefined;
}) => {
  if (row === undefined) {
    return <span>Not in the current dry run.</span>;
  }
  if (!row.ok) {
    return (
      <span>
        {row.errorMessage ?? "This model could not be aligned"} — it will be
        excluded from the run.
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="text-muted text-[11px]">{row.endpoint}</span>
      <span>
        drops{" "}
        {row.dropped.length === 0
          ? "nothing"
          : row.dropped.map((entry) => entry.param).join(", ")}
        {" · coerces "}
        {row.coerced.length === 0
          ? "nothing"
          : row.coerced
              .map((entry) => `${entry.param} ${entry.from} → ${entry.to}`)
              .join("; ")}
      </span>
      <span>
        {row.speedP95Seconds === null
          ? "timeout floor"
          : `p95 ${row.speedP95Seconds}s`}{" "}
        · {usdFromDollars(row.worstCaseCostUsd)} / image
        {row.usesQueue ? " · queue ±3s" : ""}
      </span>
    </span>
  );
};

/** One model chip. Selection reads as an accent *edge*, never a fill — the
 * 2px left border is present in both states so toggling never reflows the
 * row (unchanged from the old picker, `docs/design/specs/design-bench.md`).
 * The warn dot means this model's dry run drops or coerces something; the
 * detail is in the tooltip. */
const ModelChip = ({
  alias,
  costUsd,
  onToggle,
  row,
  selected,
}: {
  readonly alias: string;
  readonly costUsd: number;
  readonly onToggle: () => void;
  readonly row: PreviewModelRow | undefined;
  readonly selected: boolean;
}) => {
  const altered =
    row !== undefined &&
    (!row.ok || row.dropped.length > 0 || row.coerced.length > 0);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-pressed={selected}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-l-2 px-2 py-1 transition-colors duration-150",
            selected
              ? "border-border border-l-accent bg-surface-soft text-ink"
              : "border-border bg-surface text-muted hover:border-ink hover:text-ink border-l-transparent hover:border-l-transparent"
          )}
          onClick={onToggle}
          type="button"
        >
          <span className="text-[11px]">{alias}</span>
          <span className="text-muted text-[11px]">
            {usdFromDollars(costUsd)}
          </span>
          {altered ? (
            <span aria-hidden className="text-warn text-[11px]">
              ●
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <ModelDryRun row={row} />
      </TooltipContent>
    </Tooltip>
  );
};

const Field = ({
  children,
  htmlFor,
  label,
}: {
  readonly children: ReactNode;
  readonly htmlFor: string;
  readonly label: ReactNode;
}) => (
  <div className="flex min-w-0 flex-col gap-1">
    <label className="text-muted text-[11px]" htmlFor={htmlFor}>
      {label}
    </label>
    {children}
  </div>
);

/** The aspect-coercion warning, unchanged in substance
 * (`docs/arc/bench/BRIEF.md`, UI section) and now sitting beside the aspect
 * control itself rather than three sections below it. */
const AspectCoercionNote = ({ aspect }: { readonly aspect: BenchAspect }) => {
  if (isUniformAspect(aspect)) {
    return null;
  }
  const dialects = ASPECT_DIALECT_TABLE[aspect];
  return (
    <p className="border-border border-l-warn bg-surface-soft text-muted rounded-lg border border-l-2 px-3 py-2 text-[11px] leading-[1.5]">
      <span className="text-ink">Aspect coercion is not uniform.</span> At{" "}
      <span>{aspect}</span> the three sizing dialects disagree: aspect_ratio →{" "}
      <span>{dialects.aspectRatio}</span>, image_size_enum →{" "}
      <span>{dialects.falImageSizeEnum}</span>, gpt_size →{" "}
      <span>{dialects.gptSize}</span>. Models will be framed differently, so
      quality comparisons across models are compromised. Use <span>1:1</span>{" "}
      for an honest comparison.
    </p>
  );
};

/** The aggregate reading of the dry run — what the per-chip tooltips say,
 * counted. It never grows with the model count, which is why the popover
 * needs no scroll region of its own at desktop sizes. */
/** What a requested format actually buys, counted against the current
 * selection. A format that reaches 14 of 20 models is still worth asking for
 * — the other 6 report it as a dropped param, which is the comparison this
 * tool exists to make visible — but you should know that before you spend. */
const OutputFormatNote = ({ draft }: { readonly draft: RunDraft }) => {
  if (draft.outputFormat === null) {
    return null;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- draft.models only ever holds aliases toggled from BENCH_ROUTES (see toggleModel), and outputFormatReach ignores anything MODELS has no entry for
  const aliases = [...draft.models] as Parameters<typeof outputFormatReach>[0];
  const { dropped, supported } = outputFormatReach(aliases, draft.outputFormat);
  return (
    <p className="text-muted text-[11px]">
      <span className="text-ink">
        {draft.outputFormat} reaches {supported} of {aliases.length} selected
        models.
      </span>{" "}
      {dropped === 0
        ? "Every model in this run returns the same container."
        : `The other ${dropped} have no format control; each will record outputFormat as a dropped param.`}
    </p>
  );
};

const DryRunSummary = ({
  preview,
}: {
  readonly preview: PreviewResult | undefined;
}) => {
  if (preview === undefined) {
    return (
      <p className="text-muted text-[11px]">
        Dry run pending. It costs nothing — no request reaches a provider.
      </p>
    );
  }
  const coerces = preview.models.filter(
    (model) => model.ok && model.coerced.length > 0
  ).length;
  const drops = preview.models.filter(
    (model) => model.ok && model.dropped.length > 0
  ).length;
  return (
    <p className="text-muted text-[11px] leading-[1.5]">
      Dry run:{" "}
      <span className="text-ink">
        {preview.models.length - preview.failedCount}
      </span>{" "}
      of <span>{preview.models.length}</span> align · <span>{coerces}</span>{" "}
      coerce a parameter · <span>{drops}</span> drop one
      {preview.failedCount > 0 ? (
        <>
          {" · "}
          <span className="text-warn">{preview.failedCount}</span> will be
          excluded
        </>
      ) : null}
      {" · "}
      <span className="text-ink">
        {usdFromDollars(preview.totalWorstCaseCostUsd)}
      </span>{" "}
      worst case. Hover a model for its aligned request. Nothing here reaches a
      provider.
    </p>
  );
};

interface ModelsPopoverProps {
  readonly draft: RunDraft;
  readonly onPatch: (patch: RunDraftPatch) => void;
  readonly onToggleModel: (alias: string) => void;
  readonly preview: PreviewResult | undefined;
}

type SectionProps = Omit<ModelsPopoverProps, "preview">;

/** Count plus the three selections worth one click: the default five, the
 * full sweep, and none. */
const SelectionHeader = ({
  draft,
  onPatch,
}: Omit<SectionProps, "onToggleModel">) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
    <h2>Models</h2>
    <div className="text-muted flex items-center gap-3 text-[11px]">
      <span>
        <span>{draft.models.size}</span> of <span>{BENCH_ROUTES.length}</span>{" "}
        selected
      </span>
      <Button
        className="h-6 px-2 text-[11px]"
        onClick={() => {
          onPatch({
            models: new Set(cheapestModelAliases(DEFAULT_MODEL_COUNT)),
          });
        }}
        type="button"
        variant="ghost"
      >
        {DEFAULT_MODEL_COUNT} cheapest
      </Button>
      <Button
        className="h-6 px-2 text-[11px]"
        onClick={() => {
          onPatch({
            models: new Set(BENCH_ROUTES.map((route) => route.alias)),
          });
        }}
        type="button"
        variant="ghost"
      >
        All
      </Button>
      <Button
        className="h-6 px-2 text-[11px]"
        onClick={() => {
          onPatch({ models: new Set() });
        }}
        type="button"
        variant="ghost"
      >
        None
      </Button>
    </div>
  </div>
);

/** All models, grouped by price tier. Tier labels stay sentence-case muted
 * text, deliberately not uppercase eyebrows. */
const ModelGroups = ({
  draft,
  onToggleModel,
  preview,
}: Omit<ModelsPopoverProps, "onPatch">) => {
  const rowByAlias = new Map(
    (preview?.models ?? []).map((model) => [model.alias, model])
  );
  return (
    <>
      {modelTierGroups().map((group) =>
        group.routes.length === 0 ? null : (
          <div className="flex flex-col gap-1.5" key={group.label}>
            <p className="text-muted text-[11px]">{group.label}</p>
            <div className="flex flex-wrap gap-1">
              {group.routes.map((route) => (
                <ModelChip
                  alias={route.alias}
                  costUsd={route.pricing.estimatedCostUsd}
                  key={route.alias}
                  onToggle={() => {
                    onToggleModel(route.alias);
                  }}
                  row={rowByAlias.get(route.alias)}
                  selected={draft.models.has(route.alias)}
                />
              ))}
            </div>
          </div>
        )
      )}
    </>
  );
};

/** The five fields that decide what shape of file comes back. */
const ShapeFields = ({
  draft,
  onPatch,
}: Omit<SectionProps, "onToggleModel">) => (
  <div className="border-border grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3 sm:grid-cols-5">
    <Field htmlFor="bench-samples" label="Samples per model">
      <Input
        className="h-8"
        id="bench-samples"
        max={4}
        min={1}
        onChange={(event) => {
          onPatch({ samplesPerModel: Number(event.target.value) });
        }}
        type="number"
        value={draft.samplesPerModel}
      />
    </Field>

    <Field
      htmlFor="bench-concurrency"
      label={
        draft.concurrency > 1 ? (
          <span className="text-warn">Parallel — contended</span>
        ) : (
          "Parallel"
        )
      }
    >
      <Input
        className="h-8"
        id="bench-concurrency"
        max={8}
        min={1}
        onChange={(event) => {
          onPatch({ concurrency: Number(event.target.value) });
        }}
        type="number"
        value={draft.concurrency}
      />
    </Field>

    <Field htmlFor="bench-aspect" label="Aspect">
      <Select
        onValueChange={(value) => {
          if (isBenchAspect(value)) {
            onPatch({ aspect: value });
          }
        }}
        value={draft.aspect}
      >
        <SelectTrigger className="h-8" id="bench-aspect">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BENCH_ASPECTS.map((value) => (
            <SelectItem key={value} value={value}>
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
            onPatch({ resolution: value });
          }
        }}
        value={draft.resolution}
      >
        <SelectTrigger className="h-8" id="bench-resolution">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RESOLUTIONS.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>

    <Field htmlFor="bench-format" label="Format">
      <Select
        onValueChange={(value) => {
          onPatch({ outputFormat: toOutputFormat(value) });
        }}
        value={draft.outputFormat ?? FORMAT_DEFAULT}
      >
        <SelectTrigger className="h-8" id="bench-format">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {/* Default is a real choice, not an empty state: it is the only
              setting under which each model returns its own native container,
              which is what every run before this control did. */}
          <SelectItem value={FORMAT_DEFAULT}>default</SelectItem>
          {BENCH_OUTPUT_FORMATS.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  </div>
);

/** Seed and the hard cost cap — how the run *behaves* rather than what it
 * produces. The cap is still enforced server-side; this is only where it is
 * set. */
const BehaviourFields = ({
  draft,
  onPatch,
}: Omit<SectionProps, "onToggleModel">) => (
  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
    <div className="flex items-center gap-2">
      <Checkbox
        checked={draft.seedEnabled}
        id="bench-seed-enabled"
        onCheckedChange={(checked) => {
          onPatch({ seedEnabled: checked === true });
        }}
      />
      <label className="text-muted text-[11px]" htmlFor="bench-seed-enabled">
        Fixed seed
      </label>
      <Input
        aria-label="Seed value"
        className="h-8 w-[80px]"
        disabled={!draft.seedEnabled}
        onChange={(event) => {
          onPatch({ seed: Number(event.target.value) });
        }}
        type="number"
        value={draft.seed}
      />
    </div>

    <div className="flex items-center gap-2">
      <label className="text-muted text-[11px]" htmlFor="bench-max-cost">
        Stop above
      </label>
      <Input
        className="h-8 w-[88px]"
        id="bench-max-cost"
        min={0.01}
        onChange={(event) => {
          onPatch({ maxEstimatedCostUsd: Number(event.target.value) });
        }}
        step={0.01}
        type="number"
        value={draft.maxEstimatedCostUsd}
      />
    </div>
  </div>
);

/** The whole run configuration behind one `Models ▾` trigger. It used to be
 * the largest thing on the page — 24 chips in three tiers plus a settings
 * block plus a preview table — for a decision made once per run, while the
 * prompt was one field above it. As a popover it costs no permanent space,
 * and Radix closes it on `Escape`.
 *
 * At `md` and up the content fits without scrolling, which is what keeps the
 * shell's "exactly three scroll containers" true while it is open; the
 * `overflow-y-auto` is a floor for a short viewport, not the normal case. */
export const ModelsPopover = ({
  draft,
  onPatch,
  onToggleModel,
  preview,
}: ModelsPopoverProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button size="sm" type="button">
        Models
        <span className="text-muted">{draft.models.size}</span>
        <ChevronDownIcon />
      </Button>
    </PopoverTrigger>
    <PopoverContent className="flex max-h-[calc(100dvh-5rem)] w-[min(760px,calc(100vw-1.5rem))] flex-col gap-3 overflow-y-auto">
      <SelectionHeader draft={draft} onPatch={onPatch} />
      <ModelGroups
        draft={draft}
        onToggleModel={onToggleModel}
        preview={preview}
      />
      <ShapeFields draft={draft} onPatch={onPatch} />
      <BehaviourFields draft={draft} onPatch={onPatch} />
      <AspectCoercionNote aspect={draft.aspect} />
      <OutputFormatNote draft={draft} />
      <div className="border-border border-t pt-3">
        <DryRunSummary preview={preview} />
      </div>
    </PopoverContent>
  </Popover>
);
