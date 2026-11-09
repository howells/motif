import type { ReactNode } from "react";

import { dmMono, facultyGlyphic } from "@/components/site/fonts";

/** The homepage stands on its own: the `.site` paper palette and the two
 * faces, and nothing around it. */
function HomeLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className={`site home ${facultyGlyphic.variable} ${dmMono.variable}`}>
      {children}
    </div>
  );
}

export default HomeLayout;
