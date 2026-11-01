import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BoardEditor } from "@/components/app/boards/board-editor";
import { MembersOnly } from "@/components/app/gate";
import { MakeForm } from "@/components/app/make/make-form";
import { getViewer } from "@/lib/app/auth/viewer";
import { loadBoardView } from "@/lib/app/boards/service";
import { getOwnedBoard } from "@/lib/app/boards/store";
import { BoardViewSchema } from "@/lib/app/client/board-schemas";
import { getAppSql } from "@/lib/app/db";
import { isAppId } from "@/lib/app/ids";
import { TASK_OPTIONS } from "@/lib/app/tasks/options";

export const metadata: Metadata = { title: "Board" };

/** One of the member's Boards. Nodes are edited on a larger screen; a
 * phone gets Make instead, which lands in the Inbox. */
async function BoardPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  const { id } = await params;
  return (
    <MembersOnly title="Boards" viewer={viewer}>
      {async (member) => {
        const sql = getAppSql();
        if (sql === null || !isAppId(id, "brd")) {
          notFound();
        }
        const board = await getOwnedBoard(sql, member.id, id);
        if (board === null) {
          notFound();
        }
        // Checked against the shape the canvas reads, as an API reply would be.
        const view = BoardViewSchema.parse(
          await loadBoardView(sql, member.id, board)
        );
        return (
          <>
            <div className="hidden md:block">
              <BoardEditor initial={view} options={TASK_OPTIONS} />
            </div>
            <div className="app-column mx-auto w-full md:hidden">
              <MakeForm
                memberName={member.name ?? member.email}
                options={TASK_OPTIONS}
                initial={{ aspect: null, look: "", mood: "", prompt: "" }}
              />
            </div>
          </>
        );
      }}
    </MembersOnly>
  );
}

export default BoardPage;
