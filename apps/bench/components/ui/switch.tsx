"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `switch` on house tokens: no shadow, and `transition-all`
 * narrowed to the two properties that move.
 *
 * Checked fills at `ink`, not `accent`. The accent budget is two filled
 * elements per screen (`docs/design/specs/design-bench.md`) and on the
 * composer both are spoken for by the one irreversible action — spending
 * money. A toggle in its default-on state is not that. */
export const Switch = ({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) => (
  <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=unchecked]:bg-surface-soft",
      className
    )}
    data-slot="switch"
    {...props}
  >
    <SwitchPrimitive.Thumb
      className="pointer-events-none block size-3.5 translate-x-px rounded-full bg-surface transition-transform duration-150 data-[state=checked]:translate-x-[15px] data-[state=unchecked]:bg-muted"
      data-slot="switch-thumb"
    />
  </SwitchPrimitive.Root>
);
