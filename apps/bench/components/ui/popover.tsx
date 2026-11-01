"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { usePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";

/** A popover on the paper palette: a panel with a hairline, no shadow, drawn
 * inside the shell so the tokens resolve. Radix owns `Escape`, focus return
 * and click-outside, so nothing here re-implements them. */
export const Popover = (
  props: ComponentProps<typeof PopoverPrimitive.Root>
) => <PopoverPrimitive.Root data-slot="popover" {...props} />;

export const PopoverTrigger = (
  props: ComponentProps<typeof PopoverPrimitive.Trigger>
) => <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;

export const PopoverContent = ({
  align = "end",
  className,
  sideOffset = 8,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) => {
  const container = usePortalContainer();
  return (
    <PopoverPrimitive.Portal container={container} data-slot="popover-portal">
      <PopoverPrimitive.Content
        align={align}
        className={cn(
          "border-border bg-background text-ink rounded-panel z-50 border outline-none",
          className
        )}
        data-slot="popover-content"
        sideOffset={sideOffset}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
};
