import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SectionProps {
  /** Right-aligned readout on the heading's baseline — a count, a total, a
   * single control. Anything larger belongs in `children`. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  /** `false` for a section that already sits at the top of its column, where
   * a rule would double up with the page header's. */
  readonly rule?: boolean;
  readonly title: string;
}

/** The Patternmode section rhythm, which is the only hierarchy device this
 * app uses: a hairline rule, a heading at body size, then the content
 * (`docs/design/specs/design-bench.md` — "headings stay at body size and
 * earn hierarchy through spacing and rules"). There is no display type
 * anywhere in this app, so if a section needs to feel more important the
 * answer is more space above it, not a bigger heading. */
export const Section = ({
  action,
  children,
  className,
  rule = true,
  title,
}: SectionProps) => (
  <section
    className={cn(
      "flex min-w-0 flex-col gap-4",
      rule && "border-t border-border pt-5",
      className
    )}
  >
    <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
      <h2>{title}</h2>
      {action}
    </div>
    {children}
  </section>
);
