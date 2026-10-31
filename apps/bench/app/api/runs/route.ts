/**
 * `GET` — the owner's past Bench runs. `POST` is closed: starting a run
 * spends from the shared fal key, and that now happens only through Compare
 * in the App, where each run is held against the monthly cap first.
 */
import { benchRetired, ownerOnly } from "@/lib/app/http/legacy";
import { listRunsResponse } from "@/lib/runs/handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return (await ownerOnly(request)) ?? (await listRunsResponse());
}

export async function POST(): Promise<Response> {
  return benchRetired();
}
