import { monthSummary } from "@/lib/app/budget/ledger";
import { appError, authorise, readJson } from "@/lib/app/http/guard";
import { quote, resolveOwnedInputs } from "@/lib/app/tasks/plan";
import { parseTaskRequest } from "@/lib/app/tasks/request";

export const dynamic = "force-dynamic";

/** Price a request without running it: the Model Motif would choose, the
 * most it can cost, and what's left of the shared cap. Spends nothing. */
export async function POST(request: Request) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return appError(400, "INVALID_JSON", "Send the request as JSON.");
  }
  const parsed = parseTaskRequest(body);
  if (!parsed.ok) {
    return appError(400, "UNSUPPORTED_REQUEST", parsed.message);
  }
  const inputs = await resolveOwnedInputs(
    auth.sql,
    auth.member,
    parsed.request
  );
  if (!inputs.ok) {
    return appError(inputs.status, inputs.code, inputs.message);
  }
  const quoted = quote(parsed.request, inputs);
  const budget = await monthSummary(auth.sql);
  const availableMicros = Math.max(
    0,
    budget.capMicros - budget.spentMicros - budget.heldMicros
  );
  if (quoted.kind === "invalid") {
    return appError(400, "UNSUPPORTED_REQUEST", quoted.message);
  }
  const common = {
    availableMicros,
    chosenBy: quoted.plan.chosenBy,
    estimate: quoted.plan.cost,
    mode: quoted.plan.mode ?? null,
    model: quoted.plan.model,
    tier: quoted.plan.tier,
  };
  if (quoted.kind === "blocked") {
    return Response.json({
      ...common,
      alternatives: quoted.alternatives,
      kind: "blocked",
      reason: quoted.reason,
    });
  }
  return Response.json({
    ...common,
    basis: quoted.bound.basis,
    boundMicros: quoted.bound.micros,
    kind: "ready",
    listMicros: quoted.bound.listMicros,
  });
}
