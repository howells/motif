import { Composer } from "@/components/composer/composer";
import { HistoryList } from "@/components/history/history-list";

// This route reads run history through the app's own store on every
// request (via the client-side React Query hooks it renders); it must never
// be statically cached (`docs/arc/bench/BRIEF.md`: "force-dynamic on every
// DB-backed page and route").
export const dynamic = "force-dynamic";

/** Composer left, recent runs right (`docs/design/specs/design-bench.md`,
 * the `/` layout). The two collapse to one column below `lg` with the
 * composer first — history is a way back to a previous decision, not the
 * thing you came here to do. */
const HomePage = () => (
  <main className="grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_236px] lg:gap-12">
    <Composer />
    <HistoryList />
  </main>
);

export default HomePage;
