import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { TaskWorkspace } from "@/components/app/task/workspace";
import { getViewer } from "@/lib/app/auth/viewer";
import type { PickedImage } from "@/lib/app/client/task-draft";
import { getAppSql } from "@/lib/app/db";
import { isAppId } from "@/lib/app/ids";
import { getOwnedAsset } from "@/lib/app/media/assets";
import { TASK_OPTIONS } from "@/lib/app/tasks/options";
import { mediaUrl } from "@/lib/app/views";
import {
  LIBRARY_IDS,
  commandEntry,
  commandTitle,
  isAppTaskId,
} from "@/lib/site/commands";

interface Params {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const entry = commandEntry(id);
  return entry === undefined
    ? {}
    : { description: entry.summary, title: commandTitle(entry) };
}

/** A Source handed over from a result or the Library, if it is the
 * person's own. */
const initialSource = async (
  ownerId: string,
  raw: string | string[] | undefined
): Promise<PickedImage | null> => {
  const sql = getAppSql();
  if (typeof raw !== "string" || !isAppId(raw, "ast") || sql === null) {
    return null;
  }
  const asset = await getOwnedAsset(sql, ownerId, raw);
  return asset === null || asset.kind === "mask"
    ? null
    : {
        assetId: asset.id,
        height: asset.height,
        url: mediaUrl(asset.id),
        width: asset.width,
      };
};

/** Where a command is documented. Two catalogue ids have no page of their
 * own in the docs: `series run` lives on `series`, and the error codes on
 * the agents page. */
const DOCS_PATHS: Readonly<Record<string, string>> = {
  errors: "/docs/agents",
  "series-run": "/docs/commands/series",
};

const docsPathFor = (id: string): string =>
  DOCS_PATHS[id] ?? `/docs/commands/${id}`;

/** One command. Signed in, the six App Tasks are working forms; everywhere
 * else the command is documented in the docs, so the page sends you there. */
async function CommandPage({ params, searchParams }: Params) {
  const { id } = await params;
  const entry = commandEntry(id);
  if (entry === undefined) {
    notFound();
  }
  const viewer = await getViewer();
  if (viewer.state === "member" && LIBRARY_IDS.has(id)) {
    redirect("/library");
  }
  if (viewer.state === "member" && isAppTaskId(id)) {
    const query = await searchParams;
    const source = await initialSource(viewer.member.id, query.source);
    return (
      <TaskWorkspace
        initialSource={source}
        key={source?.assetId ?? "none"}
        options={TASK_OPTIONS}
        summary={entry.summary.replace(/\.$/u, "")}
        task={id}
        usage={entry.usage}
      />
    );
  }
  return redirect(docsPathFor(id));
}

export default CommandPage;
