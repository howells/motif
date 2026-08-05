import { RouteRun } from "@/components/shell/selection";

// The run's data is polled client-side by the shell; this route stays
// dynamic so a run URL is never statically cached (`docs/arc/bench/BRIEF.md`:
// "force-dynamic on every DB-backed page and route").
export const dynamic = "force-dynamic";

/** Still a real deep link — it just no longer has a layout of its own. The
 * shell is already mounted by the root layout; this page selects a run
 * inside it (`docs/design/specs/design-bench-shell.md`). */
const RunPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return <RouteRun runId={id} />;
};

export default RunPage;
