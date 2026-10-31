import type { Metadata } from "next";

import { MembersOnly } from "@/components/app/gate";
import { LibraryView } from "@/components/app/library/library-view";
import { getViewer } from "@/lib/app/auth/viewer";

export const metadata: Metadata = { title: "Library" };

async function LibraryPage() {
  const viewer = await getViewer();
  return (
    <MembersOnly
      standfirst="Your Generations, latest first"
      title="Library"
      viewer={viewer}
    >
      {() => <LibraryView />}
    </MembersOnly>
  );
}

export default LibraryPage;
