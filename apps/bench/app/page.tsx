import { Composer } from "@/components/composer/composer";
import { HistoryList } from "@/components/history/history-list";

// This route reads run history through the app's own store on every
// request (via the client-side React Query hooks it renders); it must never
// be statically cached (`docs/arc/bench/BRIEF.md`: "force-dynamic on every
// DB-backed page and route").
export const dynamic = "force-dynamic";

const HomePage = () => (
  <main>
    <Composer />
    <div className="card">
      <div className="section-title">History</div>
      <HistoryList />
    </div>
  </main>
);

export default HomePage;
