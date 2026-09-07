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
      <output className="text-bad block truncate text-[11px]">
        {runError}
      </output>
    );
  }
  // Body font throughout. This is one line of running text — a count, a
  // ratio, a size and a price, read left to right once — not a column of
  // figures scanned against anything. Setting it in mono made a caption look
  // like console output, and it was the same treatment as the verdict labels,
  // the rail heading and every table header, which is how a screen ends up
  // with one uniform texture and no emphasis left to spend.
  return (
    <p className="text-muted truncate text-[11px] md:whitespace-nowrap">
      {draft.models.size} model{draft.models.size === 1 ? "" : "s"}
      {draft.samplesPerModel > 1 ? ` × ${draft.samplesPerModel} samples` : ""}
      {/* Framing and size drop out below `xl` and give their width back to the
          prompt, which is the hero of this bar and was truncating mid-word to
          make room for them. They are the two least volatile parts of the
          summary — both are one click away in the Models popover, and both are
          restated for the *selected* run in the tab bar. The count and the
          price never drop: the price is the reason this line exists. */}
      <span className="max-xl:hidden">
        {" · "}
        {draft.aspect}
        {" · "}
        {draft.resolution}
        {/* Only when asked for. The default is every model's own container,
            which is what this line meant before the control existed, so
            printing "default" would add a word that says nothing. */}
        {draft.outputFormat === null ? "" : ` · ${draft.outputFormat}`}
      </span>
      {" · "}
      {preview === undefined ? (
        <span>estimating…</span>
      ) : (
        <span className="text-ink">
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
  <header className="border-border bg-background z-20 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b px-3 py-2 max-md:sticky max-md:top-0 md:flex md:h-14 md:gap-x-0 md:px-0 md:py-0">
    {/* The wordmark holds a 220px column with the rail's own hairline on its
        right edge, so the vertical rule that divides history from results runs
        the full height of the shell instead of starting below the bar. Before
        this, nothing in the top bar lined up with anything beneath it. */}
    <h1 className="border-border hidden h-full shrink-0 items-center border-r px-3 md:flex md:w-[220px]">
      Motif Bench
    </h1>

    {/* Borderless: a boxed input 1100px wide was the largest and heaviest
        object on screen, and it read as a form dropped into a toolbar. The
        prompt is a sentence you edit in place — it earns its prominence from
        width and ink, and grows a hairline only on hover and focus. */}
    <Input
      aria-label="Prompt"
      className="hover:border-b-border-soft focus:border-b-ink max-md:border-border max-md:bg-surface col-span-2 col-start-1 row-start-1 h-9 min-w-0 rounded-none border-0 border-b border-b-transparent bg-transparent px-0 shadow-none max-md:h-8 max-md:rounded-md max-md:border max-md:px-2.5 md:flex-1 md:px-4"
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
      // A single-line field scrolls its own content, so a long prompt is
      // always clipped at *some* width. The title makes the whole of it
      // readable on hover without spending a second line of the shell's fixed
      // height — and the selected run's rail entry carries it in full too.
      title={draft.prompt.length > 0 ? draft.prompt : undefined}
      type="text"
      value={draft.prompt}
    />

    {/* The estimate sits beside the button it prices rather than under the
        prompt: it is what pressing Run will cost, and hanging it below the
        field made the bar two half-height rows of unequal weight. */}
    <div className="col-span-2 col-start-1 row-start-3 min-w-0 self-center md:order-none md:min-w-0 md:shrink-0 md:pr-3 md:pl-4">
      <SummaryLine draft={draft} preview={preview} runError={runError} />
    </div>

    {/* A phone gets three full-width rows — prompt, actions, summary —
        because sharing a row squeezes the prompt to a few characters and
        truncates the estimate off the end of the summary. Both are the point
        of the bar, so neither yields to the other. */}
    <div className="col-span-2 col-start-1 row-start-2 flex shrink-0 items-center justify-end gap-2 md:pr-4">
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
