"use client";

import { ImageIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

import { useNow } from "@/components/app/boards/use-now";
import { Segmented } from "@/components/app/controls";
import { ComparisonTable } from "@/components/run/comparison-table";
import { ContactSheet } from "@/components/run/contact-sheet";
import { Inspector } from "@/components/run/inspector";
import { ScatterChart } from "@/components/run/scatter-chart";
import { VerdictStrip } from "@/components/shell/verdict-strip";
import { formatUsd } from "@/lib/format";
import { modelNameOf, modelPriceUsd } from "@/lib/model-names";
import type { RunDraft } from "@/lib/run-spec";
import type { PreviewResult, RunDetail } from "@/lib/runs/types";
import { groupByModel } from "@/lib/sample-order";
import { aggregateQualityByModel, buildVerdictStrip } from "@/lib/verdicts";

const TABS = [
  { label: "Images", value: "images" },
  { label: "Table", value: "table" },
  { label: "Cost and quality", value: "cost" },
] as const;

/** One name per image a Model will make, so a placeholder has an identity that
 * is not its position. A run holds at most four samples per Model. */
const SAMPLE_SLOTS = ["first", "second", "third", "fourth"] as const;

type TabId = (typeof TABS)[number]["value"];

/** A line of quiet type on the paper, not a full-pane spinner: the pane never
 * blanks a region it has already drawn. */
const PaneNote = ({ children }: { readonly children: ReactNode }) => (
  <p className="text-muted type-small px-4 py-4 md:px-6">{children}</p>
);

/** The pane's name for what is on show: "New run" or the run's own prompt. On
 * a phone the screen is named for the place, "Bench". */
const Head = ({ title }: { readonly title: string }) => (
  <header className="border-border flex h-[3.75rem] items-center border-b px-4 md:px-6">
    <h1 className="type-title truncate">
      <span className="md:hidden">Bench</span>
      <span className="max-md:hidden">{title}</span>
    </h1>
  </header>
);

/** Before there is a run: the Models the next run will use, a square for each
 * image it will make, and what each Model costs per image. */
const NewRunView = ({
  draft,
  preview,
}: {
  readonly draft: RunDraft;
  readonly preview: PreviewResult | undefined;
}) => {
  const aliases = [...draft.models].toSorted();
  if (aliases.length === 0) {
    return <PaneNote>No models selected</PaneNote>;
  }
  const rowByAlias = new Map(
    (preview?.models ?? []).map((model) => [model.alias, model])
  );
  const count = aliases.length;
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <p className="text-muted type-body tabular-nums">
        {count} model{count === 1 ? "" : "s"} · {draft.samplesPerModel} sample
        {draft.samplesPerModel === 1 ? "" : "s"} each
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[repeat(auto-fill,minmax(14rem,1fr))]">
        {aliases.map((alias) => (
          <div className="flex min-w-0 flex-col gap-3" key={alias}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="type-body truncate font-medium">
                {modelNameOf(alias)}
              </span>
              <span className="text-muted type-small shrink-0 tabular-nums">
                {formatUsd(
                  Math.round(
                    (rowByAlias.get(alias)?.worstCaseCostUsd ??
                      modelPriceUsd(alias)) * 1_000_000
                  )
                )}{" "}
                / image
              </span>
            </div>
            <div className="grid auto-cols-fr grid-flow-col gap-3">
              {SAMPLE_SLOTS.slice(0, draft.samplesPerModel).map((slot) => (
                <div
                  className="bg-surface text-faint flex aspect-square items-center justify-center"
                  key={slot}
                >
                  <ImageIcon aria-hidden="true" size={24} strokeWidth={1.5} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/** The run's three readings of the same numbers, one on show at a time, and
 * how many images you have rated, or how long a running run has been going. */
const ViewRow = ({
  detail,
  onSelect,
  tab,
}: {
  readonly detail: RunDetail;
  readonly onSelect: (tab: TabId) => void;
  readonly tab: TabId;
}) => {
  const running = detail.run.status === "running";
  const now = useNow(running);
  const completed = detail.samples.filter(
    (sample) => sample.status === "completed"
  ).length;
  const rated = detail.manualRatings.filter((rating) =>
    detail.samples.some(
      (sample) => sample.id === rating.sampleId && sample.status === "completed"
    )
  ).length;
  const startedAt =
    detail.run.startedAt === null ? now : Date.parse(detail.run.startedAt);
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="md:w-[25.5rem]">
        <Segmented
          label="View"
          onChange={onSelect}
          options={TABS}
          value={tab}
        />
      </div>
      <p className="text-muted type-small tabular-nums">
        {running ? `Elapsed ${elapsed} s` : `Rated ${rated} of ${completed}`}
      </p>
    </div>
  );
};

interface RunPaneProps {
  readonly composer: ReactNode;
  readonly detail: RunDetail | undefined;
  readonly draft: RunDraft;
  readonly errorMessage: string | null;
  readonly isLoading: boolean;
  readonly preview: PreviewResult | undefined;
  readonly runId: string | null;
}

/** The main pane: a head naming the view, the composer for the next run, and
 * under it either the next run's Models or the selected run, with its leaders,
 * its three views and the inspector that opens one image over all of it. */
export const RunPane = ({
  composer,
  detail,
  draft,
  errorMessage,
  isLoading,
  preview,
  runId,
}: RunPaneProps) => {
  const [tab, setTab] = useState<TabId>("images");
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  // Changing run returns to the images and closes the inspector: they are the
  // primary reading, and a run started from the table would otherwise stream
  // into a pane nobody is looking at. React's documented "adjust state during
  // render" pattern, so no frame shows the old view against the new run.
  const [tabRunId, setTabRunId] = useState(runId);
  if (tabRunId !== runId) {
    setTabRunId(runId);
    setTab("images");
    setInspectedId(null);
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

  const openable =
    detail === undefined
      ? []
      : groupByModel(detail.samples).flatMap(([, group]) =>
          group.filter(
            (sample) =>
              sample.status === "completed" && sample.imageUrl !== null
          )
        );
  const inspectedIndex =
    inspectedId === null
      ? -1
      : openable.findIndex((sample) => sample.id === inspectedId);

  if (detail !== undefined && inspectedIndex !== -1) {
    return (
      <main className="min-w-0 flex-1">
        <Inspector
          index={inspectedIndex}
          manualRatings={detail.manualRatings}
          onClose={() => {
            setInspectedId(null);
          }}
          onIndexChange={(next) => {
            setInspectedId(openable[next]?.id ?? null);
          }}
          run={detail.run}
          samples={openable}
        />
      </main>
    );
  }

  const body = (() => {
    if (runId === null) {
      return <NewRunView draft={draft} preview={preview} />;
    }
    if (errorMessage !== null) {
      return <PaneNote>{errorMessage}</PaneNote>;
    }
    if (detail === undefined) {
      return (
        <PaneNote>
          {isLoading ? "Loading run" : "This run does not exist"}
        </PaneNote>
      );
    }
    return (
      <>
        <VerdictStrip data={verdicts} detail={detail} quality={quality} />
        <ViewRow detail={detail} onSelect={setTab} tab={tab} />
        {tab === "images" ? (
          <ContactSheet
            manualRatings={detail.manualRatings}
            onInspect={setInspectedId}
            run={detail.run}
            samples={detail.samples}
          />
        ) : (
          <div className="px-4 pt-2 pb-6 md:px-6">
            {tab === "table" ? (
              <ComparisonTable
                quality={quality}
                samplesPerModel={detail.run.samplesPerModel}
                timing={verdicts?.timing ?? []}
              />
            ) : (
              <ScatterChart quality={quality} timing={verdicts?.timing ?? []} />
            )}
          </div>
        )}
      </>
    );
  })();

  return (
    <main className="min-w-0 flex-1">
      <Head
        title={detail?.run.prompt ?? (runId === null ? "New run" : "Run")}
      />
      {composer}
      <div className="border-border border-t">{body}</div>
    </main>
  );
};
