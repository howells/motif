import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `input` on house tokens — inset `surface-soft` fill, warm-grey
 * hairline, stock `shadow-xs` kept (Patternmode ships the primitives with
 * theirs), and the focus ring left to the global `:focus-visible` rule.
 * Numeric fields pass `className="bench-numeric"` so their digits align with
 * every other comparable number in the app. */
export const Input = ({
  className,
  type,
  ...props
}: ComponentProps<"input">) => (
  <input
    className={cn(
      "border-border bg-surface-soft text-ink placeholder:text-muted h-[34px] w-full min-w-0 rounded-md border px-2.5 shadow-xs transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
      className
    )}
    data-slot="input"
    type={type}
    {...props}
  />
);
