import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `input` on house tokens: inset `surface-soft` fill and a
 * warm-grey hairline instead of the upstream `shadow-xs`, with the focus
 * ring left to the global `:focus-visible` rule. Numeric fields pass
 * `className="bench-numeric"` so their digits align with every other
 * comparable number in the app. */
export const Input = ({
  className,
  type,
  ...props
}: ComponentProps<"input">) => (
  <input
    className={cn(
      "h-[34px] w-full min-w-0 rounded-md border border-border bg-surface-soft px-2.5 text-ink transition-colors duration-150 placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-45",
      className
    )}
    data-slot="input"
    type={type}
    {...props}
  />
);
