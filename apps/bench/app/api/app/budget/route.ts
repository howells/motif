import { monthSummary, spendFor } from "@/lib/app/budget/ledger";
import { authorise } from "@/lib/app/http/guard";

export const dynamic = "force-dynamic";

/** This month's spending as the person asking may see it: their own spend
 * and what is left, and for the owner the pot's total and everyone's. */
export async function GET(request: Request) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const summary = await monthSummary(auth.sql);
  return Response.json({ budget: spendFor(summary, auth.member) });
}
