"use client";

import type { RefObject } from "react";

import { ModelsPopover } from "@/components/shell/models-popover";
import { formatUsd } from "@/lib/format";
import type { RunDraft, RunDraftPatch } from "@/lib/run-spec";
import type { PreviewResult } from "@/lib/runs/types";

interface ComposerProps {
  readonly canRun: boolean;
  readonly draft: RunDraft;
  readonly isRunning: boolean;
  readonly onOpenRuns: () => void;
  readonly onPatch: (patch: RunDraftPatch) => void;
  readonly onRun: () => void;
  readonly onToggleModel: (alias: string) => void;
  readonly preview: PreviewResult | undefined;
  readonly promptRef: RefObject<HTMLInputElement | null>;
  readonly runError: string | null;
}

const dollars = (usd: number): string => formatUsd(Math.round(usd * 1_000_000));

/** The shape of the next run on one line, and what it will cost. The estimate
 * is a real dry run: parameters aligned and priced with nothing sent to a
 * provider. A failure to start (the cost limit, an unknown Model) takes the
 * line over, because that is where the eye is when Run is pressed. */
const MetaLine = ({
  draft,
  preview,
  runError,
}: Pick<ComposerProps, "draft" | "preview" | "runError">) => {
  if (runError !== null) {
    return <output className="text-bad type-small block">{runError}</output>;
  }
  const images = draft.models.size * draft.samplesPerModel;
  return (
    <div className="text-muted type-small flex flex-wrap items-center justify-between gap-x-6 gap-y-1 tabular-nums">
      <span>
        {images} image{images === 1 ? "" : "s"} · {draft.aspect} ·{" "}
        {draft.resolution}
        {draft.outputFormat === null ? "" : ` · ${draft.outputFormat}`}
        {draft.concurrency > 1 ? (
          <span className="max-md:hidden">
            {" "}
            · parallel ×{draft.concurrency}
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-3">
        Estimate from a dry run
        <span className="text-ink">
          {preview === undefined
            ? "Estimating"
            : dollars(preview.totalWorstCaseCostUsd)}
          <span className="max-md:hidden">
            {" "}
            · limit {dollars(draft.maxEstimatedCostUsd)}
          </span>
        </span>
      </span>
    </div>
  );
};

/** The prompt, the Models, and Run: the one row that starts a run. `⌘K` puts
 * the cursor in the prompt and `⌘↵` runs from anywhere. It describes the next
 * run, so choosing a past run in the column beside it leaves it alone. */
export const Composer = ({
  canRun,
  draft,
  isRunning,
  onOpenRuns,
  onPatch,
  onRun,
  onToggleModel,
  preview,
  promptRef,
  runError,
}: ComposerProps) => (
  <div className="flex flex-col gap-3 px-4 py-4 md:px-6">
    <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
      <input
        aria-label="Prompt"
        className="app-input min-w-0 basis-full md:flex-1 md:basis-0"
        onChange={(event) => {
          onPatch({ prompt: event.target.value });
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            onRun();
          }
        }}
        placeholder="Describe an image"
        ref={promptRef}
        type="text"
        value={draft.prompt}
      />
      <div className="flex md:hidden">
        <button className="app-button" onClick={onOpenRuns} type="button">
          Runs
        </button>
      </div>
      <ModelsPopover
        draft={draft}
        onPatch={onPatch}
        onToggleModel={onToggleModel}
        preview={preview}
      />
      <button
        className={`app-button w-24 ${isRunning ? "is-quiet" : "is-primary"}`}
        disabled={!canRun}
        onClick={onRun}
        type="button"
      >
        {isRunning ? "Running" : "Run"}
      </button>
    </div>
    <MetaLine draft={draft} preview={preview} runError={runError} />
  </div>
);
