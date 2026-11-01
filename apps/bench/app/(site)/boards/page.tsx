import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MembersOnly } from "@/components/app/gate";
import { getViewer } from "@/lib/app/auth/viewer";
import { ensureInbox, listBoards } from "@/lib/app/boards/store";
import { getAppSql } from "@/lib/app/db";

export const metadata: Metadata = { title: "Boards" };

/** The Board worked on last, or the Inbox on a first visit. */
async function BoardsPage() {
  const viewer = await getViewer();
  const sql = getAppSql();
  if (viewer.state === "member" && sql !== null) {
    const inbox = await ensureInbox(sql, viewer.member.id);
    const boards = await listBoards(sql, viewer.member.id);
    const latest = boards.toSorted(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    )[0];
    redirect(`/boards/${latest?.id ?? inbox.id}`);
  }
  return (
    <MembersOnly title="Boards" viewer={viewer}>
      {() => null}
    </MembersOnly>
  );
}

export default BoardsPage;
