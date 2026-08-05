import { jsonError, jsonOk, jsonValidationError } from "@/lib/api-response";
/**
 * Manual 1–5 star override for one sample — the "manual" judge state
 * (`docs/arc/bench/BRIEF.md`, UI section: judge states are first-class,
 * including manual-override). Mirrors `@motif/bench-db`'s
 * `bench_manual_ratings` upsert semantics (`upsertManualRating`): a second
 * call for the same sample replaces the rating rather than erroring.
 */
import { setManualRating } from "@/lib/runs/repository";
import { ManualRatingInputSchema } from "@/lib/runs/validation";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "Request body must be JSON.");
  }

  const parsed = ManualRatingInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonValidationError(parsed.error);
  }

  const rating = await setManualRating({
    note: parsed.data.note ?? null,
    sampleId: id,
    stars: parsed.data.stars,
  });
  if (!rating) {
    return jsonError(404, "SAMPLE_NOT_FOUND", `No sample with id "${id}".`);
  }
  return jsonOk(rating);
}
