import { CREATIVE_TAXONOMY, LOOKS } from "@howells/motif-sdk";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PageHead } from "@/components/app/page-head";
import type { TaskOptions } from "@/components/app/task/fields";
import { TaskWorkspace } from "@/components/app/task/workspace";
import { Field } from "@/components/site/catalogue-fields";
import { Command } from "@/components/site/chapter";
import { getViewer } from "@/lib/app/auth/viewer";
import { MAX_IMAGES_PER_RUN, MAX_REFERENCES } from "@/lib/app/budget/policy";
import type { PickedImage } from "@/lib/app/client/task-draft";
import { getAppSql } from "@/lib/app/db";
import { isAppId } from "@/lib/app/ids";
import { getOwnedAsset } from "@/lib/app/media/assets";
import { APP_ASPECTS } from "@/lib/app/tasks/request";
import { mediaUrl } from "@/lib/app/views";
import {
  LIBRARY_IDS,
  commandEntry,
  commandName,
  isAppTaskId,
} from "@/lib/site/commands";
import { SITE } from "@/lib/site/content";

const OPTIONS: TaskOptions = {
  aspects: APP_ASPECTS,
  looks: LOOKS.map((look) => ({
    acceptsMood: look.acceptsMood,
    aspect: look.aspect,
    id: look.id,
    label: look.label,
  })),
  maxImages: MAX_IMAGES_PER_RUN,
  maxReferences: MAX_REFERENCES,
  moods: CREATIVE_TAXONOMY.mood.map((mood) => ({
    id: mood.id,
    label: mood.label,
  })),
};

interface Params {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const entry = commandEntry(id);
  return entry === undefined
    ? {}
    : { description: entry.summary, title: commandName(entry) };
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

/** One command. Signed in, the six App Tasks are working forms; everywhere
 * else the page shows what the command does and how to run it. */
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
        options={OPTIONS}
        summary={entry.summary.replace(/\.$/u, "")}
        task={id}
        usage={entry.usage}
      />
    );
  }
  const inApp = isAppTaskId(id);
  return (
    <main>
      <PageHead
        back={
          <Link
            className="type-small text-muted flex min-h-11 items-center gap-1 md:hidden"
            href="/commands"
          >
            <ChevronLeft aria-hidden="true" size={16} strokeWidth={1.5} />
            Commands
          </Link>
        }
        standfirst={entry.summary.replace(/\.$/u, "")}
        title={commandName(entry)}
      />
      <div className="flex flex-col gap-8 px-4 py-6 md:px-10 md:py-8">
        <div className="max-w-[60rem]">
          <Field entry={entry} />
        </div>
        <div className="flex max-w-[40rem] flex-col gap-3">
          <h2 className="type-body font-medium">In your terminal</h2>
          <Command>{entry.usage}</Command>
          <p className="type-small text-muted">
            Install once with <code className="font-mono">{SITE.install}</code>,
            then run it from any folder.
          </p>
        </div>
        {inApp ? (
          <div className="flex max-w-[40rem] flex-col items-start gap-3">
            <h2 className="type-body font-medium">In the App</h2>
            <p className="type-small text-muted">
              Signed in, this page becomes the {commandName(entry)} form, with
              your Library to work from.
            </p>
            <form action="/auth/sign-in" method="get">
              <button className="app-button" type="submit">
                Sign in to use it
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default CommandPage;
