import { RouteRun } from "@/components/shell/selection";

// Nothing DB-backed renders here any more — the shell fetches through React
// Query — but the route stays dynamic so nothing can pin a cached selection
// to this URL (`docs/arc/bench/BRIEF.md`: "force-dynamic on every DB-backed
// page and route").
export const dynamic = "force-dynamic";

/** `/` is the shell with no run selected: the rail, the composer, and the
 * first-run hint. The shell itself is mounted by the root layout, so this
 * page renders nothing of its own. */
const HomePage = () => <RouteRun runId={null} />;

export default HomePage;
