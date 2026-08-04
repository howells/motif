import { jsonError, jsonOk } from "@/lib/api-response";
/**
 * Run detail — samples, judgments, manual ratings. Polled by the results
 * page (`/runs/[id]`) via React Query while `status === "running"`, per
 * `docs/arc/bench/BRIEF.md`'s no-SSE architecture.
 */
import { getRun } from "@/lib/runs/repository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const detail = getRun(id);
  if (!detail) {
    return jsonError(404, "RUN_NOT_FOUND", `No run with id "${id}".`);
  }
  return jsonOk(detail);
}
