import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CompareResults } from "@/components/app/compare/compare-results";
import { MembersOnly } from "@/components/app/gate";
import { getViewer } from "@/lib/app/auth/viewer";
import { compareModels } from "@/lib/app/compare-models";
import { isAppId } from "@/lib/app/ids";

export const metadata: Metadata = { title: "Compare Models" };

async function ComparisonPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isAppId(id, "cmp")) {
    notFound();
  }
  const viewer = await getViewer();
  return (
    <MembersOnly title="Compare Models" viewer={viewer}>
      {() => <CompareResults id={id} ranks={compareModels()} />}
    </MembersOnly>
  );
}

export default ComparisonPage;
