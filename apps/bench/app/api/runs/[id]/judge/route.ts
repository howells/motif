/**
 * Closed. Judging calls a paid model with the shared key and had no hold
 * against the monthly cap.
 */
import { benchRetired } from "@/lib/app/http/legacy";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return benchRetired();
}
