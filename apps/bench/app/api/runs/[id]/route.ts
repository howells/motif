/**
 * One past Bench run — samples, judgments, manual ratings — for the owner.
 */
import { ownerOnly } from "@/lib/app/http/legacy";
import { runDetailResponse } from "@/lib/runs/handlers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  return (
    (await ownerOnly(request)) ?? (await runDetailResponse(request, context))
  );
}
