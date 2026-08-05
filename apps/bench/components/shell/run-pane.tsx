"use client";

import { ScrollFrame } from "@patternmode/scrollframe";
import { useState } from "react";

import { ComparisonTable } from "@/components/run/comparison-table";
import { ContactSheet } from "@/components/run/contact-sheet";
import { ScatterChart } from "@/components/run/scatter-chart";
import { VerdictStrip } from "@/components/shell/verdict-strip";
import { formatUsd } from "@/lib/format";
import type { RunDraft } from "@/lib/run-spec";
import type { RunDetail } from "@/lib/runs/types";
import { cn } from "@/lib/utils";
import { aggregateQualityByModel, buildVerdictStrip } from "@/lib/verdicts";

const TABS = [
  { id: "images", label: "Images" },
  { id: "table", label: "Table" },
  { id: "cost", label: "Cost/quality" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** A line of quiet type on the paper ground, not a full-pane spinner — the
 * shell never blanks a region it has already drawn
 * (`docs/design/specs/design-bench-shell.md`). */
const PaneNote = ({ children }: { readonly children: React.ReactNode }) => (
  <p className="max-w-[56ch] px-4 py-4 text-[13px] leading-[1.6] text-muted">
    {children}
  </p>
);

/** What the pane says before there is anything to compare: the prompt that
 * is loaded and the models it will run against, so the first action is
 * obvious. */
const FirstRunHint = ({ draft }: { readonly draft: RunDraft }) => (
  <div className="flex flex-col gap-3 px-4 py-4">
    <p className="max-w-[56ch] text-[13px] leading-[1.6] text-muted">
      Press <span className="text-ink">Run</span> (or{" "}
      <span className="bench-numeric text-ink">⌘↵</span>) to send this prompt to
      the models below. The estimate in the summary line above comes from a real
      dry run — parameters aligned and priced with nothing sent to a provider.
    </p>
    <p className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-muted">
      {[...draft.models].toSorted().map((alias) => (
        <span key={alias}>{alias}</span>
      ))}
    </p>
  </div>
);

const TabBar = ({
  detail,
  onSelect,
  tab,
}: {
  readonly detail: RunDetail | undefined;
  readonly onSelect: (tab: TabId) => void;
  readonly tab: TabId;
}) => (
  <div className="order-2 flex h-10 shrink-0 items-center gap-1 border-t border-border px-3 md:order-3 md:px-4">
    {TABS.map((entry) => (
      <button
        aria-current={entry.id === tab ? "true" : undefined}
        className={cn(
          "cursor-pointer rounded-md px-2.5 py-1 text-[13px] transition-colors duration-150",
          entry.id === tab
            ? "bg-surface-soft text-ink"
            : "text-muted hover:text-ink"
        )}
        key={entry.id}
        onClick={() => {
          onSelect(entry.id);
        }}
        type="button"
      >
        {entry.label}
      </button>
    ))}
    {detail === undefined ? null : (
      <span className="bench-numeric ml-auto hidden truncate pl-4 text-[11px] text-muted sm:block">
        {detail.samples.length} sample
        {detail.samples.length === 1 ? "" : "s"} · {detail.run.aspect} ·{" "}
        {detail.run.resolution} ·{" "}
        {formatUsd(
          detail.run.costActualMicros ?? detail.run.costEstimatedMicros
        )}
        {detail.run.costActualMicros === null ? " est" : ""}
      </span>
    )}
  </div>
);

interface RunPaneProps {
  readonly detail: RunDetail | undefined;
  readonly draft: RunDraft;
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly runId: string | null;
}

/** The main pane: verdicts pinned, one scroll frame filling the rest, tabs
 * that swap only that lower region. The images get the largest area on
 * screen, which was never true of the stacked document this replaces.
 *
 * Two of the shell's three scroll frames are here — the contact sheet (on
 * the plate) and the data pane (table and scatter share it, because they are
 * two readings of the same numbers and only one is ever on screen). Exactly
 * one of the two is mounted at a time. */
export const RunPane = ({
  detail,
  draft,
  errorMessage,
  isLoading,
  runId,
}: RunPaneProps) => {
  const [tab, setTab] = useState<TabId>("images");
  // Changing run returns to the images, because they are the primary reading
  // and because a run started from the Table tab would otherwise stream into
  // a pane nobody is looking at. React's documented "adjust state during
  // render" pattern, not an effect — no second paint, no flash of the old
  // tab's content against the new run's data.
  const [tabRunId, setTabRunId] = useState(runId);
  if (tabRunId !== runId) {
    setTabRunId(runId);
    setTab("images");
  }

  const verdicts =
    detail === undefined
      ? null
      : buildVerdictStrip(
          detail.samples,
          detail.judgments,
          detail.manualRatings
        );
  const quality =
    detail === undefined
      ? []
      : aggregateQualityByModel(detail.samples, detail.manualRatings);

  const body = (() => {
    if (runId === null) {
      return <FirstRunHint draft={draft} />;
    }
    if (errorMessage !== null) {
      return <PaneNote>{errorMessage}</PaneNote>;
    }
    if (detail === undefined) {
      return (
        <PaneNote>
          {isLoading ? "Loading run…" : "This run does not exist."}
        </PaneNote>
      );
    }
    if (tab === "images") {
      return (
        <ScrollFrame
          aria-label="Contact sheet"
          className="size-full bg-plate"
          fadeColor="var(--color-plate)"
          fadeSize={28}
          key="contact-sheet"
        >
          <ContactSheet
            judgments={detail.judgments}
            manualRatings={detail.manualRatings}
            run={detail.run}
            samples={detail.samples}
          />
        </ScrollFrame>
      );
    }
    return (
      <ScrollFrame
        aria-label={
          tab === "table" ? "Comparison table" : "Cost against quality"
        }
        axes="both"
        className="size-full"
        contentClassName="p-4"
        fadeColor="var(--color-background)"
        fadeSize={28}
        key="data-pane"
      >
        {tab === "table" ? (
          <ComparisonTable quality={quality} timing={verdicts?.timing ?? []} />
        ) : (
          <ScatterChart quality={quality} timing={verdicts?.timing ?? []} />
        )}
      </ScrollFrame>
    );
  })();

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <VerdictStrip data={verdicts} run={detail?.run ?? null} />
      <div
        className={cn(
          "order-3 min-w-0 md:order-2 md:min-h-0 md:flex-1",
          tab === "images" && runId !== null ? "bg-plate" : ""
        )}
      >
        {body}
      </div>
      <TabBar detail={detail} onSelect={setTab} tab={tab} />
    </main>
  );
};
