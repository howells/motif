"use client";

import type { RefObject } from "react";

import { ModelsPopover } from "@/components/shell/models-popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/format";
import type { RunDraft, RunDraftPatch } from "@/lib/run-spec";
import type { PreviewResult } from "@/lib/runs/types";

interface TopBarProps {
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

/** The run's shape in one line — `12 models · 1:1 · 1K · ~$0.42`. It replaces
 * the preview wall: the cost estimate is always on screen and updates as the
 * selection changes, instead of being a table you had to scroll past to reach
 * the Run button (`docs/design/specs/design-bench-shell.md`).
 *
 * A run-creation failure (the cost cap, an unknown model) takes this line
 * over rather than opening a new region, because the line is already where
 * the user is looking when they press Run and the shell has no vertical
 * slack to grow into. */
const SummaryLine = ({
  draft,
  preview,
  runError,
}: Pick<TopBarProps, "draft" | "preview" | "runError">) => {
  if (runError !== null) {
    return (
      <output className="block truncate text-[11px] text-bad">
        {runError}
      </output>
    );
  }
  return (
    <p className="truncate text-[11px] text-muted">
      <span className="bench-numeric">{draft.models.size}</span> model
      {draft.models.size === 1 ? "" : "s"}
      {draft.samplesPerModel > 1 ? (
        <>
          {" × "}
          <span className="bench-numeric">{draft.samplesPerModel}</span> samples
        </>
      ) : null}
      {" · "}
      <span className="bench-numeric">{draft.aspect}</span>
      {" · "}
      <span className="bench-numeric">{draft.resolution}</span>
      {" · "}
      {preview === undefined ? (
        <span>estimating…</span>
      ) : (
        <span className="bench-numeric text-ink">
          ~{formatUsd(Math.round(preview.totalWorstCaseCostUsd * 1_000_000))}
        </span>
      )}
    </p>
  );
};

/** The fixed 56px top bar. The prompt is the hero — a single wide field —
 * and the primary action sits beside it and is reachable from every state,
 * which is the thing document scroll took away
 * (`docs/design/specs/design-bench-shell.md`).
 *
 * `Run` is the shell's one accent-filled element. The only other accent
 * *fill* on screen is the best-in-row mark in the comparison table, which
 * keeps the two-fill budget exactly met. */
export const TopBar = ({
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
}: TopBarProps) => (
  <header className="z-20 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border bg-background px-3 py-2 max-md:sticky max-md:top-0 md:h-14 md:grid-cols-[auto_minmax(0,1fr)_auto] md:content-center md:gap-y-0.5 md:px-4 md:py-0">
    <h1 className="row-span-2 hidden shrink-0 pr-1 md:block">Motif Bench</h1>

    <Input
      aria-label="Prompt"
      className="col-span-2 col-start-1 row-start-1 h-8 bg-surface md:col-span-1 md:col-start-2"
      onChange={(event) => {
        onPatch({ prompt: event.target.value });
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          onRun();
        }
      }}
      placeholder="Describe the image every model should make…"
      ref={promptRef}
      type="text"
      value={draft.prompt}
    />

    <div className="col-span-2 col-start-1 row-start-3 min-w-0 self-center md:col-span-1 md:col-start-2 md:row-start-2">
      <SummaryLine draft={draft} preview={preview} runError={runError} />
    </div>

    {/* A phone gets three full-width rows — prompt, actions, summary —
        because sharing a row squeezes the prompt to a few characters and
        truncates the estimate off the end of the summary. Both are the point
        of the bar, so neither yields to the other. */}
    <div className="col-span-2 col-start-1 row-start-2 flex shrink-0 items-center justify-end gap-2 md:col-span-1 md:col-start-3 md:row-span-2 md:row-start-1">
      <Button
        className="md:hidden"
        onClick={onOpenRuns}
        size="sm"
        type="button"
      >
        Runs
      </Button>
      <ModelsPopover
        draft={draft}
        onPatch={onPatch}
        onToggleModel={onToggleModel}
        preview={preview}
      />
      <Button
        disabled={!canRun}
        onClick={onRun}
        size="sm"
        type="button"
        variant="accent"
      >
        {isRunning ? "Running…" : "Run"}
      </Button>
    </div>
  </header>
);
