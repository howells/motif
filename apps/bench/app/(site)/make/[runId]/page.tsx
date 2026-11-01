import type { AppSql } from "@motif/bench-db/app-sql";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MembersOnly } from "@/components/app/gate";
import { MakeResult } from "@/components/app/make/make-result";
import { getViewer } from "@/lib/app/auth/viewer";
import { upstreamOf } from "@/lib/app/boards/model";
import { getOwnedRun } from "@/lib/app/boards/run-store";
import type { BoardRun } from "@/lib/app/boards/run-store";
import { getGraph } from "@/lib/app/boards/store";
import { getAppSql } from "@/lib/app/db";
import { isAppId } from "@/lib/app/ids";
import { TASK_OPTIONS } from "@/lib/app/tasks/options";

export const metadata: Metadata = { title: "Make" };

const labelOf = (
  entries: readonly { readonly id: string; readonly label: string }[],
  id: string
): string | null => entries.find((entry) => entry.id === id)?.label ?? null;

/** What "Make again" starts from: the prompt, Look and Mood of the Prompt
 * node the run was made from, and the Generate node's ratio. */
const againOf = async (sql: AppSql, ownerId: string, run: BoardRun) => {
  const graph = await getGraph(sql, ownerId, run.boardId);
  const generate = graph.nodes.find((node) => node.id === run.fromNodeId);
  const promptId = upstreamOf(run.fromNodeId, graph.wires);
  const promptNode = graph.nodes.find((node) => node.id === promptId);
  const said = promptNode?.kind === "prompt" ? promptNode.settings : null;
  return {
    aspect:
      generate?.kind === "generate" ? (generate.settings.aspect ?? "") : "",
    look: said?.look ?? "",
    mood: said?.mood ?? "",
    prompt: said?.text ?? "",
  };
};

/** What a Make made, as it arrives. The run is the member's own; its prompt,
 * Look and Mood come from the Prompt node it was made from. */
async function MakeResultPage({
  params,
}: {
  readonly params: Promise<{ runId: string }>;
}) {
  const viewer = await getViewer();
  const { runId } = await params;
  return (
    <MembersOnly title="Make" viewer={viewer}>
      {async (member) => {
        const sql = getAppSql();
        if (sql === null || !isAppId(runId, "brun")) {
          notFound();
        }
        const run = await getOwnedRun(sql, member.id, runId);
        if (run === null) {
          notFound();
        }
        const again = await againOf(sql, member.id, run);
        return (
          <div className="app-column mx-auto w-full">
            <MakeResult
              again={again}
              boardId={run.boardId}
              lookLabel={labelOf(TASK_OPTIONS.looks, again.look)}
              moodLabel={labelOf(TASK_OPTIONS.moods, again.mood)}
              runId={run.id}
            />
          </div>
        );
      }}
    </MembersOnly>
  );
}

export default MakeResultPage;
