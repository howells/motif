import { parseBody, respond } from "@/lib/app/boards/http";
import { quoteMake } from "@/lib/app/boards/make";
import { MakeSchema } from "@/lib/app/boards/make-schema";
import { authorise } from "@/lib/app/http/guard";

export const dynamic = "force-dynamic";

/** Price a Make. Spends nothing. */
export async function POST(request: Request) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const body = await parseBody(request, MakeSchema);
  if (!body.ok) {
    return body.response;
  }
  return respond(await quoteMake(auth.sql, auth.member.id, body.value));
}
