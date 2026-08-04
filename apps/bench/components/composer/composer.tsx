"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { BenchAspect } from "@/lib/aspect";
import { formatUsd } from "@/lib/format";
import { ApiError, useCreateRun, usePreview } from "@/lib/queries";
import type { RunSpecInput } from "@/lib/runs/types";

import { ComposerFields } from "./composer-fields";
import { ModelChips } from "./model-chips";
import { PreviewTable } from "./preview-table";

const DEFAULT_MAX_COST_USD = 2;

/** Composer + preview flow (`docs/arc/bench/BRIEF.md`, UI section):
 * Preview (dry-run, zero fal calls) → confirm button reading
 * "Run — spend ~$X.XX" → navigate to `/runs/[id]`. Confirming is disabled
 * until a preview has been run against the *current* form state — editing
 * any field after previewing invalidates it, so a stale preview can never
 * be confirmed against a different spec. Field inputs themselves live in
 * `ComposerFields`; this component owns state, the preview/confirm mutations,
 * and the prompt/model-chip fields. */
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
  const [judgeAfter, setJudgeAfter] = useState(true);
  const [maxEstimatedCostUsd, setMaxEstimatedCostUsd] =
    useState(DEFAULT_MAX_COST_USD);
  const [previewedSpecKey, setPreviewedSpecKey] = useState<string | null>(null);

  const preview = usePreview();
  const createRun = useCreateRun();

  const spec: RunSpecInput = useMemo(
    () => ({
      aspect,
      concurrency,
      judgeAfter,
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
      judgeAfter,
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
    <div className="card">
      <div className="section-title">New run</div>

      <div className="field">
        <label htmlFor="bench-prompt">Prompt</label>
        <textarea
          id="bench-prompt"
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
          value={prompt}
        />
      </div>

      <div className="field">
        <label>Models ({selectedModels.size} selected)</label>
        <ModelChips onToggle={toggleModel} selected={selectedModels} />
      </div>

      <ComposerFields
        aspect={aspect}
        concurrency={concurrency}
        judgeAfter={judgeAfter}
        maxEstimatedCostUsd={maxEstimatedCostUsd}
        onAspectChange={setAspect}
        onConcurrencyChange={setConcurrency}
        onJudgeAfterChange={setJudgeAfter}
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

      <div className="btn-row">
        <button
          className="btn"
          disabled={!canPreview || preview.isPending}
          onClick={runPreview}
          type="button"
        >
          {preview.isPending ? "Previewing…" : "Preview (dry run)"}
        </button>
      </div>

      {preview.isError ? (
        <div className="error-banner">
          {preview.error instanceof ApiError
            ? preview.error.message
            : "Preview failed."}
        </div>
      ) : null}

      {preview.data ? (
        <div style={{ marginTop: 14 }}>
          <PreviewTable preview={preview.data} />
        </div>
      ) : null}

      {createRun.isError ? (
        <div className="error-banner">
          {createRun.error instanceof ApiError
            ? createRun.error.message
            : "Could not start the run."}
        </div>
      ) : null}

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button
          className="btn btn-primary"
          disabled={!isPreviewCurrent || createRun.isPending}
          onClick={confirmRun}
          type="button"
        >
          {createRun.isPending
            ? "Starting…"
            : `Run — spend ~${formatUsd(
                Math.round(
                  (preview.data?.totalWorstCaseCostUsd ?? 0) * 1_000_000
                )
              )}`}
        </button>
        {!isPreviewCurrent && preview.data ? (
          <span
            style={{
              alignSelf: "center",
              color: "var(--text-faint)",
              fontSize: 12,
            }}
          >
            The form changed since the last preview — preview again to confirm.
          </span>
        ) : null}
      </div>
    </div>
  );
};
