import { z } from "zod";

import { parseBody, respond } from "@/lib/app/boards/http";
import { NODE_KINDS, SettingsInputSchema } from "@/lib/app/boards/model";
import { addBoardNode } from "@/lib/app/boards/service";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

const coordinate = z.number().min(-100_000).max(100_000);

const NewNode = z.strictObject({
  assetId: z
    .string()
    .regex(/^ast_[0-9a-f]{32}$/u)
    .optional(),
  from: z
    .string()
    .regex(/^nod_[0-9a-f]{32}$/u)
    .optional(),
  kind: z.enum(NODE_KINDS),
  settings: SettingsInputSchema.optional(),
  x: coordinate,
  y: coordinate,
});

export async function POST(
  request: Request,
  context: RouteContext<"/api/app/boards/[id]/nodes">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "brd")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const body = await parseBody(request, NewNode);
  if (!body.ok) {
    return body.response;
  }
  return respond(
    await addBoardNode(auth.sql, auth.member.id, id, body.value),
    201
  );
}
