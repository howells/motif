import { authorise } from "@/lib/app/http/guard";
import { listStacks } from "@/lib/app/library/queries";
import { stackView } from "@/lib/app/views";

export const dynamic = "force-dynamic";

/** The person's stacks, latest first. */
export async function GET(request: Request) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  const params = new URL(request.url).searchParams;
  const stacks = await listStacks(auth.sql, auth.member.id, {
    comparisonsOnly: params.get("filter") === "comparisons",
    search: params.get("q")?.slice(0, 200),
  });
  return Response.json({ stacks: stacks.map((stack) => stackView(stack)) });
}
