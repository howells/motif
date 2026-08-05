"use client";

import { BENCH_ROUTES } from "@motif/bench-core";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Section } from "@/components/section";
import type { BenchAspect } from "@/lib/aspect";
import { formatUsd } from "@/lib/format";
import { useCreateRun, usePreview } from "@/lib/queries";
import type { PreviewResult, RunSpecInput } from "@/lib/runs/types";

import { ComposerFields } from "./composer-fields";
import { ComposerPreview } from "./composer-preview";
import { ModelChips } from "./model-chips";

const DEFAULT_MAX_COST_USD = 2;

/** Before a preview lands there is no honest number to put on the confirm
 * button, and "$0.00" would read as "this is free" — the one thing it must
 * never say. So it stays a bare "Run" until a dry run has priced it. */
const formatRunLabel = (preview: PreviewResult | undefined): string =>
  preview === undefined
    ? "Run"
    : `Run — ${formatUsd(Math.round(preview.totalWorstCaseCostUsd * 1_000_000))}`;

/** "5 of 23 selected" — both counts mono so the pair stays legible as the
 * selection changes and the first number's width shifts. */
const SelectedCount = ({ selected }: { readonly selected: number }) => (
  <span className="text-[13px] text-muted">
    <span className="bench-numeric">{selected}</span> of{" "}
    <span className="bench-numeric">{BENCH_ROUTES.length}</span> selected
  </span>
);

/** The one field with no rule above it: it sits at the top of the column,
 * directly under the page header's own rule, and doubling them would read as
 * a border rather than as rhythm. */
const PromptField = ({
  onChange,
  value,
}: {
  readonly onChange: (value: string) => void;
  readonly value: string;
}) => (
  <Section rule={false} title="Prompt">
    <textarea
      className="min-h-[92px] w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5 leading-[1.6] text-ink"
      id="bench-prompt"
      onChange={(event) => {
        onChange(event.target.value);
      }}
      value={value}
    />
  </Section>
);

/** Composer + preview flow (`docs/arc/bench/BRIEF.md`, UI section):
 * Preview (dry-run, zero fal calls) → confirm button reading
 * "Run — spend ~$X.XX" → navigate to `/runs/[id]`. Confirming is disabled
 * until a preview has been run against the *current* form state — editing
 * any field after previewing invalidates it, so a stale preview can never
 * be confirmed against a different spec. Field inputs themselves live in
 * `ComposerFields`; this component owns state, the preview/confirm mutations,
 * and the prompt/model-chip fields.
 *
 * The confirm button is the page's single accent-filled element
 * (`docs/design/specs/design-bench.md` allows at most two per screen) —
 * spending money is the one irreversible thing here, so it gets the fill and
 * nothing else does. */
export const Composer = () => {
  const router = useRouter();
  const [prompt, setPrompt] = useState(
    "A well-lit modern living room with a gray sofa, a wooden coffee table, and large windows showing a garden."
  );
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [samplesPerModel, setSamplesPerModel] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [aspect, setAspect] = useState<BenchAspect>("1:1");
  const [resolution, setResolution] =
    useState<RunSpecInput["resolution"]>("1K");
  const [seedEnabled, setSeedEnabled] = useState(false);
  const [seed, setSeed] = useState(42);
  const [maxEstimatedCostUsd, setMaxEstimatedCostUsd] =
    useState(DEFAULT_MAX_COST_USD);
  const [previewedSpecKey, setPreviewedSpecKey] = useState<string | null>(null);

  const preview = usePreview();
  const createRun = useCreateRun();

  const spec: RunSpecInput = useMemo(
    () => ({
      aspect,
      concurrency,
      judgeAfter: false,
      maxEstimatedCostUsd,
      models: [...selectedModels].toSorted(),
      prompt: prompt.trim(),
      resolution,
      samplesPerModel,
      seed: seedEnabled ? seed : null,
    }),
    [
      aspect,
      concurrency,
      maxEstimatedCostUsd,
      prompt,
      resolution,
      samplesPerModel,
      seed,
      seedEnabled,
      selectedModels,
    ]
  );
  const specKey = JSON.stringify(spec);
  const isPreviewCurrent =
    previewedSpecKey === specKey && preview.data !== undefined;

  const toggleModel = (alias: string) => {
    setSelectedModels((current) => {
      const next = new Set(current);
      if (next.has(alias)) {
        next.delete(alias);
      } else {
        next.add(alias);
      }
      return next;
    });
  };

  const canPreview = spec.models.length > 0 && spec.prompt.length > 0;

  const runLabel = formatRunLabel(preview.data);

  const runPreview = () => {
    preview.mutate(spec, {
      onSuccess: () => {
        setPreviewedSpecKey(specKey);
      },
    });
  };

  const confirmRun = () => {
    createRun.mutate(spec, {
      onSuccess: ({ runId }) => {
        router.push(`/runs/${runId}`);
      },
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PromptField onChange={setPrompt} value={prompt} />

      <Section
        action={<SelectedCount selected={selectedModels.size} />}
        title="Models"
      >
        <ModelChips onToggle={toggleModel} selected={selectedModels} />
      </Section>

      <Section title="Settings">
        <ComposerFields
          aspect={aspect}
          concurrency={concurrency}
          maxEstimatedCostUsd={maxEstimatedCostUsd}
          onAspectChange={setAspect}
          onConcurrencyChange={setConcurrency}
          onMaxCostChange={setMaxEstimatedCostUsd}
          onResolutionChange={setResolution}
          onSamplesPerModelChange={setSamplesPerModel}
          onSeedChange={setSeed}
          onSeedEnabledChange={setSeedEnabled}
          resolution={resolution}
          samplesPerModel={samplesPerModel}
          seed={seed}
          seedEnabled={seedEnabled}
        />
      </Section>

      <ComposerPreview
        canPreview={canPreview}
        createRun={createRun}
        isPreviewCurrent={isPreviewCurrent}
        onConfirmRun={confirmRun}
        onRunPreview={runPreview}
        preview={preview}
        runLabel={runLabel}
      />
    </div>
  );
};
