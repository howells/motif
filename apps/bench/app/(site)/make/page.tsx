import type { Metadata } from "next";

import { MembersOnly } from "@/components/app/gate";
import { MakeForm } from "@/components/app/make/make-form";
import { getViewer } from "@/lib/app/auth/viewer";
import { MakeQuerySchema } from "@/lib/app/boards/make-schema";
import type { MakeStart } from "@/lib/app/boards/make-schema";
import { TASK_OPTIONS } from "@/lib/app/tasks/options";

export const metadata: Metadata = { title: "Make" };

type Query = Promise<Record<string, string | string[] | undefined>>;

const known = (
  entries: readonly { readonly id: string }[],
  id: string | undefined
): string => (entries.some((entry) => entry.id === id) ? (id ?? "") : "");

/** Where the form starts. A link that doesn't read starts empty; a Look or
 * Mood the SDK doesn't have is dropped. */
const startOf = (query: Awaited<Query>): MakeStart => {
  const read = MakeQuerySchema.safeParse(query);
  const asked = read.success ? read.data : {};
  return {
    aspect: asked.aspect ?? null,
    look: known(TASK_OPTIONS.looks, asked.look),
    mood: known(TASK_OPTIONS.moods, asked.mood),
    prompt: (asked.prompt ?? "").slice(0, 4000),
  };
};

/** Make, on a phone or anywhere. "Make again" arrives with the last
 * prompt, Look, Mood and shape filled in. */
async function MakePage({ searchParams }: { readonly searchParams: Query }) {
  const viewer = await getViewer();
  const start = startOf(await searchParams);
  return (
    <MembersOnly title="Make" viewer={viewer}>
      {(member) => (
        <div className="app-column mx-auto w-full">
          <MakeForm
            memberName={member.name ?? member.email}
            options={TASK_OPTIONS}
            initial={start}
          />
        </div>
      )}
    </MembersOnly>
  );
}

export default MakePage;
