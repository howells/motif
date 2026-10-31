import { z } from "zod";

import { setMonthlyCap } from "@/lib/app/budget/ledger";
import { appError, authorise, readJson } from "@/lib/app/http/guard";

export const dynamic = "force-dynamic";

/** Whole cents, so the figure the owner typed is the figure held. */
const Body = z.strictObject({ capCents: z.int().min(0).max(1_000_000) });

/** Change the shared monthly cap. Owner only. Lowering it never cancels a
 * run that already holds part of it. */
export async function POST(request: Request) {
  const auth = await authorise(request, { owner: true, write: true });
  if (!auth.ok) {
    return auth.response;
  }
  let body: unknown;
  try {
    body = await readJson(request);
  } catch {
    return appError(400, "INVALID_JSON", "Send the request as JSON.");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return appError(400, "INVALID_CAP", "Enter the cap in dollars and cents.");
  }
  await setMonthlyCap(auth.sql, parsed.data.capCents * 10_000, auth.member.id);
  return Response.json({ capMicros: parsed.data.capCents * 10_000 });
}
