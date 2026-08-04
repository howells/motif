import { jsonError, jsonOk, jsonValidationError } from "@/lib/api-response";
/**
 * Triggers judging for a run — either the composer's "judge after" toggle
 * firing server-side on completion (`mock-store.ts`'s `finalizeRunIfDone`),
 * or this endpoint, hit by a manual "Judge this run" button on the results
 * page. Idempotent: samples that already carry a judgment are skipped
 * (`mock-store.ts`'s `startJudging`), so a second click never double-judges.
 */
import { startJudging } from "@/lib/runs/repository";
import { JudgeRunInputSchema } from "@/lib/runs/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown = {};
  const rawText = await request.text();
  if (rawText.length > 0) {
    try {
      body = JSON.parse(rawText);
    } catch {
      return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
    }
  }

  const parsed = JudgeRunInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonValidationError(parsed.error);
  }

  const started = await startJudging(id, parsed.data.judgeModel);
  if (!started) {
    return jsonError(404, "RUN_NOT_FOUND", `No run with id "${id}".`);
  }
  return jsonOk({ started: true });
}
