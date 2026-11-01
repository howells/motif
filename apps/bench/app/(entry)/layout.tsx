import type { ReactNode } from "react";

import { dmMono, facultyGlyphic } from "@/components/site/fonts";

/** Pages that stand on their own, before the App opens: no rail, no bar,
 * the same paper and type as the rest of the site. */
function EntryLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div
      className={`site app app-entry ${facultyGlyphic.variable} ${dmMono.variable}`}
    >
      {children}
    </div>
  );
}

export default EntryLayout;
