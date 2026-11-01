import { z } from "zod";

import { parseBody, respond } from "@/lib/app/boards/http";
import { SettingsInputSchema } from "@/lib/app/boards/model";
import { editNode } from "@/lib/app/boards/service";
import { appError, authorise } from "@/lib/app/http/guard";
import { isAppId } from "@/lib/app/ids";

export const dynamic = "force-dynamic";

const Edit = z
  .strictObject({
    pickAssetId: z
      .string()
      .regex(/^ast_[0-9a-f]{32}$/u)
      .optional(),
    settings: SettingsInputSchema.optional(),
  })
  .refine(
    (edit) => edit.pickAssetId !== undefined || edit.settings !== undefined,
    "Change a setting or the Pick."
  );

/** Change a node's settings or its Pick. Spends nothing; what it feeds goes
 * Stale. */
export async function PATCH(
  request: Request,
  context: RouteContext<"/api/app/nodes/[id]">
) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const { id } = await context.params;
  if (!isAppId(id, "nod")) {
    return appError(404, "NOT_FOUND", "Not found.");
  }
  const body = await parseBody(request, Edit);
  if (!body.ok) {
    return body.response;
  }
  return respond(await editNode(auth.sql, auth.member.id, id, body.value));
}
