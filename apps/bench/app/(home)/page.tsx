import type { Metadata } from "next";

import { HomeFooter } from "@/components/home/footer";
import { HomeHandoff } from "@/components/home/handoff";
import { HomeLooks } from "@/components/home/looks";
import { HomeMasthead } from "@/components/home/masthead";
import { HomeMoods } from "@/components/home/moods";
import { HomeOpening } from "@/components/home/opening";
import { getViewer } from "@/lib/app/auth/viewer";
import { SITE } from "@/lib/site/content";

/** The share card itself comes from `opengraph-image.tsx` beside the root
 * layout, which Next adds to both the Open Graph and the X tags. */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: SITE.description,
  openGraph: {
    description: SITE.description,
    locale: "en_GB",
    siteName: SITE.name,
    title: SITE.title,
    type: "website",
    url: "/",
  },
  title: { absolute: SITE.title },
  twitter: {
    card: "summary_large_image",
    description: SITE.description,
    title: SITE.title,
  },
};

/** Home. A member sees the same page as anyone else; only the last link in
 * the masthead changes, from Sign in to Open the App. */
async function HomePage() {
  const viewer = await getViewer();
  return (
    <>
      <HomeMasthead member={viewer.state === "member"} />
      <main>
        <HomeOpening />
        <HomeLooks />
        <HomeMoods />
        <HomeHandoff />
      </main>
      <HomeFooter />
    </>
  );
}

export default HomePage;
