import { monthSummary } from "@/lib/app/budget/ledger";
import { authorise } from "@/lib/app/http/guard";

export const dynamic = "force-dynamic";

/** The shared cap this month. Members see the totals and their own line;
 * the owner sees everyone's. */
export async function GET(request: Request) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const summary = await monthSummary(auth.sql);
  const members =
    auth.member.role === "owner"
      ? summary.members
      : summary.members.filter((line) => line.memberId === auth.member.id);
  return Response.json({ budget: { ...summary, members } });
}
