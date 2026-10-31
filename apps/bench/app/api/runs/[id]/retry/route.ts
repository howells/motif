/**
 * Closed. A retry spends from the shared fal key, so it happens only in the
 * App, where a failed run is retried against the monthly cap.
 */
import { benchRetired } from "@/lib/app/http/legacy";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return benchRetired();
}
