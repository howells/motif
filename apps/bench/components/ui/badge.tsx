import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `badge`, retuned: outline-only in every variant. Status here
 * is carried by the label text, with colour as reinforcement
 * (`docs/design/specs/design-bench.md`: "Every status carries a text label,
 * never colour alone") — so no variant fills, and the two-accent-fills
 * budget stays free for the page's real actions.
 *
 * Body font, not mono. A badge holds a *word* — `partial`, `mock`,
 * `contended ×2`, `framing not uniform` — and mono buys nothing for a word.
 * It costs: monospace is emphasis, and emphasis spent on every small label is
 * the uniform texture that makes an interface read as generated. Mono is kept
 * for figures that are scanned against each other. */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-px text-[11px] whitespace-nowrap [&>svg]:size-3",
  {
    defaultVariants: {
      variant: "default",
    },
    variants: {
      variant: {
        accent: "border-accent/45 text-accent",
        bad: "border-bad/45 text-bad",
        default: "border-border text-muted",
        ok: "border-ok/45 text-ok",
        // On the plate, warm-grey hairlines disappear — plate tokens only.
        plate: "border-plate-edge text-plate-muted",
        warn: "border-warn/45 text-warn",
      },
    },
  }
);

export const Badge = ({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) => (
  <span
    className={cn(badgeVariants({ className, variant }))}
    data-slot="badge"
    {...props}
  />
);

export { badgeVariants };
