import type { Metadata } from "next";

import { CompareSetup } from "@/components/app/compare/compare-setup";
import { MembersOnly } from "@/components/app/gate";
import { getViewer } from "@/lib/app/auth/viewer";
import { MAX_COMPARISON_MODELS } from "@/lib/app/budget/policy";
import { compareModels } from "@/lib/app/compare-models";
import { APP_ASPECTS } from "@/lib/app/tasks/request";

export const metadata: Metadata = { title: "Compare Models" };

async function ComparePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ prompt?: string }>;
}) {
  const viewer = await getViewer();
  const { prompt } = await searchParams;
  return (
    <MembersOnly
      standfirst="One prompt, several Models, side by side"
      title="Compare Models"
      viewer={viewer}
    >
      {() => (
        <CompareSetup
          aspects={APP_ASPECTS}
          initialPrompt={
            typeof prompt === "string" ? prompt.slice(0, 4000) : ""
          }
          max={MAX_COMPARISON_MODELS}
          models={compareModels()}
        />
      )}
    </MembersOnly>
  );
}

export default ComparePage;
