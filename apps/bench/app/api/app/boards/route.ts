import { z } from "zod";

import { parseBody } from "@/lib/app/boards/http";
import { createBoard, ensureInbox, listBoards } from "@/lib/app/boards/store";
import { authorise } from "@/lib/app/http/guard";

export const dynamic = "force-dynamic";

/** The member's Boards, Inbox first. The Inbox is made the first time. */
export async function GET(request: Request) {
  const auth = await authorise(request);
  if (!auth.ok) {
    return auth.response;
  }
  await ensureInbox(auth.sql, auth.member.id);
  const boards = await listBoards(auth.sql, auth.member.id);
  return Response.json({
    boards: boards.map((board) => ({
      id: board.id,
      images: board.images,
      kind: board.kind,
      name: board.name,
    })),
  });
}

const NewBoard = z.strictObject({
  name: z.string().trim().min(1, "Name the Board.").max(80),
});

export async function POST(request: Request) {
  const auth = await authorise(request, { write: true });
  if (!auth.ok) {
    return auth.response;
  }
  const body = await parseBody(request, NewBoard);
  if (!body.ok) {
    return body.response;
  }
  const board = await createBoard(auth.sql, auth.member.id, body.value.name);
  return Response.json(
    { board: { id: board.id, kind: board.kind, name: board.name } },
    { status: 201 }
  );
}
