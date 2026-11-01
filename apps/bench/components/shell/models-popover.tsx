"use client";

import { BENCH_ROUTES } from "@motif/bench-core";
import { CheckIcon, ChevronDownIcon, PlusIcon, XIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import type { ComponentType, ReactNode } from "react";

import { Field } from "@/components/app/controls";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BENCH_ASPECTS, isUniformAspect } from "@/lib/aspect";
import type { BenchAspect } from "@/lib/aspect";
import { formatUsd } from "@/lib/format";
import { modelNameOf, modelPriceUsd } from "@/lib/model-names";
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
const SAMPLE_COUNTS = [1, 2, 3, 4] as const;
const PARALLEL_COUNTS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** The value for "no format requested": a select cannot hold `null`, and the
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

const usd = (dollars: number): string =>
  formatUsd(Math.round(dollars * 1_000_000));

/** True from the width where the Bench has a rail, and so a popover rather
 * than a sheet. */
const useIsWide = (): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const query = globalThis.matchMedia("(width >= 48rem)");
      query.addEventListener("change", onChange);
      return () => {
        query.removeEventListener("change", onChange);
      };
    },
    () => globalThis.matchMedia("(width >= 48rem)").matches,
    () => true
  );

/** What the dry run says about one Model, in a few words. */
const rowNote = (row: PreviewModelRow | undefined): string | null => {
  if (row === undefined) {
    return null;
  }
  if (!row.ok) {
    return "Left out of the run";
  }
  const parts = row.dropped.map(
    (entry) =>
      `${entry.param.slice(0, 1).toUpperCase()}${entry.param.slice(1)} ignored`
  );
  return parts.length === 0 ? null : parts.join(" · ");
};

interface BodyProps {
  readonly draft: RunDraft;
  readonly onClose: () => void;
  readonly onPatch: (patch: RunDraftPatch) => void;
  readonly onToggleModel: (alias: string) => void;
  readonly preview: PreviewResult | undefined;
  readonly Title: ComponentType<{ readonly children: ReactNode }>;
}

const Select = ({
  id,
  onChange,
  options,
  value,
}: {
  readonly id: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly value: string;
}) => (
  <select
    className="app-select"
    id={id}
    onChange={(event) => {
      onChange(event.target.value);
    }}
    value={value}
  >
    {options.map((option) => (
      <option key={option.value} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

const plain = (values: readonly (number | string)[]) =>
  values.map((value) => ({ label: String(value), value: String(value) }));

const Header = ({
  onClose,
  Title,
  title,
}: Pick<BodyProps, "onClose" | "Title"> & { readonly title: string }) => (
  <div className="flex items-center justify-between gap-4">
    <Title>{title}</Title>
    <button
      aria-label="Close"
      className="board-quiet hover:bg-surface"
      onClick={onClose}
      type="button"
    >
      <XIcon aria-hidden="true" size={18} strokeWidth={1.5} />
    </button>
  </div>
);

/** Every Model, selected ones first, each a checkbox with its price. */
const ModelsView = ({
  draft,
  onClose,
  onBack,
  onPatch,
  onToggleModel,
  preview,
  Title,
}: BodyProps & { readonly onBack: () => void }) => {
  const rowByAlias = new Map(
    (preview?.models ?? []).map((model) => [model.alias, model])
  );
  const selected = BENCH_ROUTES.filter((route) =>
    draft.models.has(route.alias)
  );
  const others = BENCH_ROUTES.filter((route) => !draft.models.has(route.alias));
  const images = draft.models.size * draft.samplesPerModel;

  const row = (alias: string) => {
    const note = rowNote(rowByAlias.get(alias));
    return (
      <li key={alias}>
        <label className="border-border min-h-control flex cursor-pointer items-center gap-4 border-b py-3">
          <input
            checked={draft.models.has(alias)}
            className="accent-ink size-4 shrink-0"
            onChange={() => {
              onToggleModel(alias);
            }}
            type="checkbox"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="type-body truncate font-medium">
              {modelNameOf(alias)}
            </span>
            {note === null ? null : (
              <span className="text-muted type-small">{note}</span>
            )}
          </span>
          <span className="type-small tabular-nums">
            {usd(modelPriceUsd(alias))}
          </span>
        </label>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Header onClose={onClose} Title={Title} title="Models" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted type-small tabular-nums">
          {draft.models.size} selected
        </p>
        <div className="flex items-center">
          {[
            {
              label: `Cheapest ${DEFAULT_MODEL_COUNT}`,
              models: new Set(cheapestModelAliases(DEFAULT_MODEL_COUNT)),
            },
            {
              label: "All",
              models: new Set(BENCH_ROUTES.map((route) => route.alias)),
            },
            { label: "None", models: new Set<string>() },
          ].map((choice) => (
            <button
              className="board-quiet type-small text-muted hover:text-ink px-3"
              key={choice.label}
              onClick={() => {
                onPatch({ models: choice.models });
              }}
              type="button"
            >
              {choice.label}
            </button>
          ))}
        </div>
      </div>
      <ul className="m-0 flex list-none flex-col p-0">
        {selected.map((route) => row(route.alias))}
      </ul>
      {others.length === 0 ? null : (
        <>
          <p className="text-muted type-small">Other models</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {others.map((route) => row(route.alias))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-muted type-small tabular-nums">
          {images} images ·{" "}
          {preview === undefined
            ? "Estimating"
            : usd(preview.totalWorstCaseCostUsd)}{" "}
          · Estimate from a dry run
        </p>
        <button
          className="app-button is-primary max-md:w-full md:w-[6.75rem]"
          onClick={onBack}
          type="button"
        >
          Done
        </button>
      </div>
    </div>
  );
};

/** The run's settings: the Models in it, and the seven choices that shape
 * what comes back and what it costs. */
const SettingsView = ({
  draft,
  onClose,
  onModels,
  onPatch,
  onToggleModel,
  preview,
  Title,
}: BodyProps & { readonly onModels: () => void }) => {
  const images = draft.models.size * draft.samplesPerModel;
  const ignoringResolution =
    preview?.models.filter(
      (model) =>
        model.ok && model.dropped.some((entry) => entry.param === "resolution")
    ).length ?? 0;
  const reach =
    draft.outputFormat === null
      ? null
      : BENCH_ROUTES.filter(
          (route) =>
            draft.models.has(route.alias) &&
            !(
              preview?.models
                .find((model) => model.alias === route.alias)
                ?.dropped.some((entry) => entry.param === "outputFormat") ??
              false
            )
        ).length;
  const selectedRoutes = BENCH_ROUTES.filter((route) =>
    draft.models.has(route.alias)
  );
  const notes = [
    ignoringResolution === 0
      ? null
      : `${ignoringResolution} model${ignoringResolution === 1 ? "" : "s"} ignore${ignoringResolution === 1 ? "s" : ""} resolution`,
    isUniformAspect(draft.aspect) ? null : "Framing not uniform",
    reach === null
      ? null
      : `${draft.outputFormat} reaches ${reach} of ${draft.models.size}`,
    draft.concurrency > 1 ? "Timings contended" : null,
  ].filter((note) => note !== null);

  return (
    <div className="flex flex-col gap-6">
      <Header onClose={onClose} Title={Title} title="Models & settings" />

      <div className="max-md:hidden">
        <ul className="m-0 flex list-none flex-col p-0">
          {selectedRoutes.map((route) => (
            <li key={route.alias}>
              <button
                aria-label={`Remove ${modelNameOf(route.alias)}`}
                className="border-border min-h-control flex w-full cursor-pointer items-center gap-4 border-b py-3 text-left"
                onClick={() => {
                  onToggleModel(route.alias);
                }}
                type="button"
              >
                <CheckIcon aria-hidden="true" size={18} strokeWidth={1.5} />
                <span className="type-body flex-1 truncate font-medium">
                  {modelNameOf(route.alias)}
                </span>
                <span className="text-muted type-small tabular-nums">
                  {usd(route.pricing.estimatedCostUsd)} / image
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button className="app-button mt-2" onClick={onModels} type="button">
          <PlusIcon aria-hidden="true" size={18} strokeWidth={1.5} />
          Add models
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 md:hidden">
        <p className="type-body">Models</p>
        <button className="app-button" onClick={onModels} type="button">
          <ChevronDownIcon aria-hidden="true" size={18} strokeWidth={1.5} />
          {draft.models.size} selected
        </button>
      </div>

      <div className="border-border grid grid-cols-2 gap-x-4 gap-y-4 md:grid-cols-3 md:border-t md:pt-6">
        <Field htmlFor="bench-samples" label="Samples per model">
          <Select
            id="bench-samples"
            onChange={(value) => {
              onPatch({ samplesPerModel: Number(value) });
            }}
            options={plain(SAMPLE_COUNTS)}
            value={String(draft.samplesPerModel)}
          />
        </Field>
        <Field htmlFor="bench-concurrency" label="Parallel">
          <Select
            id="bench-concurrency"
            onChange={(value) => {
              onPatch({ concurrency: Number(value) });
            }}
            options={plain(PARALLEL_COUNTS)}
            value={String(draft.concurrency)}
          />
        </Field>
        <Field htmlFor="bench-aspect" label="Aspect">
          <Select
            id="bench-aspect"
            onChange={(value) => {
              if (isBenchAspect(value)) {
                onPatch({ aspect: value });
              }
            }}
            options={plain(BENCH_ASPECTS)}
            value={draft.aspect}
          />
        </Field>
        <Field htmlFor="bench-resolution" label="Resolution">
          <Select
            id="bench-resolution"
            onChange={(value) => {
              if (isResolution(value)) {
                onPatch({ resolution: value });
              }
            }}
            options={plain(RESOLUTIONS)}
            value={draft.resolution}
          />
        </Field>
        <Field htmlFor="bench-format" label="Format">
          <Select
            id="bench-format"
            onChange={(value) => {
              onPatch({ outputFormat: toOutputFormat(value) });
            }}
            options={[
              { label: "Model default", value: FORMAT_DEFAULT },
              ...BENCH_OUTPUT_FORMATS.map((format) => ({
                label: format,
                value: format,
              })),
            ]}
            value={draft.outputFormat ?? FORMAT_DEFAULT}
          />
        </Field>
        <Field htmlFor="bench-seed-enabled" label="Fixed seed">
          <Select
            id="bench-seed-enabled"
            onChange={(value) => {
              onPatch({ seedEnabled: value === "on" });
            }}
            options={[
              { label: "Off", value: "off" },
              { label: "On", value: "on" },
            ]}
            value={draft.seedEnabled ? "on" : "off"}
          />
        </Field>
      </div>

      <div className="border-border grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-6 md:grid-cols-3">
        <Field htmlFor="bench-max-cost" label="Stop above">
          <input
            className="app-input tabular-nums"
            id="bench-max-cost"
            min={0.01}
            onChange={(event) => {
              onPatch({ maxEstimatedCostUsd: Number(event.target.value) });
            }}
            step={0.01}
            type="number"
            value={draft.maxEstimatedCostUsd}
          />
        </Field>
        {draft.seedEnabled ? (
          <Field htmlFor="bench-seed" label="Seed">
            <input
              className="app-input tabular-nums"
              id="bench-seed"
              onChange={(event) => {
                onPatch({ seed: Number(event.target.value) });
              }}
              type="number"
              value={draft.seed}
            />
          </Field>
        ) : null}
        <div
          className={cn(
            "type-small flex flex-col items-end justify-end text-right",
            draft.seedEnabled ? "col-span-2 md:col-span-1" : "md:col-span-2"
          )}
        >
          <p className="text-muted tabular-nums">Estimate from a dry run</p>
          <p className="tabular-nums">
            {images} images ·{" "}
            {preview === undefined
              ? "Estimating"
              : usd(preview.totalWorstCaseCostUsd)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="text-muted type-small flex flex-col">
          {notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
        <button
          className="app-button is-primary max-md:w-full md:w-[6.75rem]"
          onClick={onClose}
          type="button"
        >
          Done
        </button>
      </div>
    </div>
  );
};

interface ModelsPopoverProps {
  readonly draft: RunDraft;
  readonly onPatch: (patch: RunDraftPatch) => void;
  readonly onToggleModel: (alias: string) => void;
  readonly preview: PreviewResult | undefined;
}

const PanelTitle = ({ children }: { readonly children: ReactNode }) => (
  <h2 className="type-title">{children}</h2>
);

const SheetTitle = ({ children }: { readonly children: ReactNode }) => (
  <DialogTitle>{children}</DialogTitle>
);

/** The whole run configuration behind one button that says how many Models are
 * in the run. A popover under the composer on a wide screen and a sheet above
 * the bottom bar on a phone, with the same two views in both: the settings,
 * and the list of every Model. Radix closes either on `Escape`. */
export const ModelsPopover = ({
  draft,
  onPatch,
  onToggleModel,
  preview,
}: ModelsPopoverProps) => {
  const wide = useIsWide();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"models" | "settings">("settings");

  const change = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setView("settings");
    }
  };
  const close = () => {
    change(false);
  };

  const body = (Title: BodyProps["Title"]) => {
    const props = {
      draft,
      onClose: close,
      onPatch,
      onToggleModel,
      preview,
      Title,
    };
    return view === "models" ? (
      <ModelsView
        {...props}
        onBack={() => {
          setView("settings");
        }}
      />
    ) : (
      <SettingsView
        {...props}
        onModels={() => {
          setView("models");
        }}
      />
    );
  };

  const count = draft.models.size;
  const trigger = (
    <button
      aria-label={`Models and settings, ${count} selected`}
      className="app-button max-md:flex-1 md:w-[8.25rem]"
      type="button"
    >
      <ChevronDownIcon aria-hidden="true" size={18} strokeWidth={1.5} />
      <span className="font-medium tabular-nums">
        {count === 0 ? "No models" : `${count} model${count === 1 ? "" : "s"}`}
      </span>
    </button>
  );

  return (
    <>
      <Popover onOpenChange={change} open={open && wide}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          className="app-panel max-h-[calc(100dvh-var(--spacing-32))] w-[min(40rem,calc(100vw-var(--spacing-12)))] overflow-y-auto p-6"
          collisionPadding={24}
        >
          {body(PanelTitle)}
        </PopoverContent>
      </Popover>
      <Dialog onOpenChange={change} open={open && !wide}>
        <DialogContent
          aria-describedby={undefined}
          className="overflow-y-auto px-4 pt-4 pb-4"
        >
          {body(SheetTitle)}
        </DialogContent>
      </Dialog>
    </>
  );
};
