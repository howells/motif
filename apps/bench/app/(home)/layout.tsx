import type { ReactNode } from "react";

import { dmMono, facultyGlyphic } from "@/components/site/fonts";

/** The homepage stands on its own, with no rail and no bar: the same paper,
 * type and palette as the pages in `(entry)`, and no Shell. */
function HomeLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div
      className={`site app app-entry ${facultyGlyphic.variable} ${dmMono.variable}`}
    >
      {children}
    </div>
  );
}

export default HomeLayout;
