import { RunDetail } from "@/components/run/run-detail";

// Polls the app's own store while the run is in flight (`RunDetail`'s
// `useRun`) — never statically cached (`docs/arc/bench/BRIEF.md`:
// "force-dynamic on every DB-backed page and route").
export const dynamic = "force-dynamic";

const RunPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return <RunDetail runId={id} />;
};

export default RunPage;
