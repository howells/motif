import type { Metadata } from "next";

import { PageHead } from "@/components/app/page-head";
import { Looks } from "@/components/site/looks";
import { Moods } from "@/components/site/moods";

export const metadata: Metadata = { title: "Looks" };

/** The house Looks, then the Moods that light them. */
function LooksPage() {
  return (
    <main>
      <PageHead
        standfirst="A Look sets the medium and the framing; a Mood sets the light."
        title="Looks"
      />
      <Looks />
      <Moods />
    </main>
  );
}

export default LooksPage;
