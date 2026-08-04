"use client";

import { Section } from "@/components/section";
import { useJudgeRun, useRun } from "@/lib/queries";
import { aggregateQualityByModel, buildVerdictStrip } from "@/lib/verdicts";

import { ComparisonTable } from "./comparison-table";
import { ContactSheet } from "./contact-sheet";
import { RunHeader } from "./run-header";
import { ScatterChart } from "./scatter-chart";
import { VerdictBand } from "./verdict-band";

/** The results page, top to bottom: what you asked for, what won, the
 * images, then the numbers behind the verdict
 * (`docs/design/specs/design-bench.md`, the `/runs/[id]` layout).
 *
 * The contact sheet deliberately sits between the verdict and the tables:
 * the verdict is a claim, and the images are the evidence you check it
 * against before reading any further. */
export const RunDetail = ({ runId }: { runId: string }) => {
  const { data, error, isError, isLoading } = useRun(runId);
  const judgeRun = useJudgeRun(runId);

  if (isLoading) {
    return <p className="text-[13px] text-muted">Loading run…</p>;
  }
  if (isError) {
    const notFound =
      error instanceof Error && error.message.includes("No run with id");
    return (
      <p className="text-[13px] text-muted">
        {notFound ? "This run does not exist." : "Could not load this run."}
      </p>
    );
  }
  if (!data) {
    return <p className="text-[13px] text-muted">This run does not exist.</p>;
  }

  const { judgments, manualRatings, run, samples } = data;
  const verdicts = buildVerdictStrip(samples, judgments);
  const quality = aggregateQualityByModel(samples, judgments);

  return (
    <main className="flex min-w-0 flex-col gap-9">
      <RunHeader
        judgePending={judgeRun.isPending}
        onJudgeClick={() => {
          judgeRun.mutate();
        }}
        run={run}
      />

      <VerdictBand data={verdicts} />

      <Section rule={false} title="Samples">
        <ContactSheet
          judgments={judgments}
          manualRatings={manualRatings}
          run={run}
          samples={samples}
        />
      </Section>

      <Section title="Comparison">
        <ComparisonTable quality={quality} timing={verdicts.timing} />
      </Section>

      <Section title="Cost against quality">
        <ScatterChart quality={quality} timing={verdicts.timing} />
      </Section>
    </main>
  );
};
