"use client";

import { useJudgeRun, useRun } from "@/lib/queries";
import { aggregateQualityByModel, buildVerdictStrip } from "@/lib/verdicts";

import { ComparisonTable } from "./comparison-table";
import { ImageGrid } from "./image-grid";
import { RunHeader } from "./run-header";
import { ScatterChart } from "./scatter-chart";
import { VerdictStrip } from "./verdict-strip";

export const RunDetail = ({ runId }: { runId: string }) => {
  const { data, isLoading, isError, error } = useRun(runId);
  const judgeRun = useJudgeRun(runId);

  if (isLoading) {
    return <div className="empty-state">Loading run…</div>;
  }
  if (isError) {
    const notFound =
      error instanceof Error && error.message.includes("No run with id");
    return (
      <div className="empty-state">
        {notFound ? "This run does not exist." : "Could not load this run."}
      </div>
    );
  }
  if (!data) {
    return <div className="empty-state">This run does not exist.</div>;
  }

  const { run, samples, judgments, manualRatings } = data;
  const verdicts = buildVerdictStrip(samples, judgments);
  const quality = aggregateQualityByModel(samples, judgments);

  return (
    <main>
      <RunHeader
        judgePending={judgeRun.isPending}
        onJudgeClick={() => {
          judgeRun.mutate();
        }}
        run={run}
      />

      <div className="card">
        <div className="section-title">Verdict</div>
        <VerdictStrip data={verdicts} />
      </div>

      <div className="card">
        <div className="section-title">Samples</div>
        <ImageGrid
          judgments={judgments}
          manualRatings={manualRatings}
          run={run}
          samples={samples}
        />
      </div>

      <div className="card">
        <div className="section-title">Comparison</div>
        <ComparisonTable quality={quality} timing={verdicts.timing} />
      </div>

      <div className="card">
        <div className="section-title">Cost vs. quality</div>
        <ScatterChart quality={quality} timing={verdicts.timing} />
      </div>
    </main>
  );
};
