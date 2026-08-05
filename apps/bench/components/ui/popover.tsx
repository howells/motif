"use client";

import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `popover` on house tokens. The model picker lives in one
 * (`docs/design/specs/design-bench-shell.md`): it is a decision made once per
 * run, and as a page section it was the largest thing on screen for the
 * smallest question on it.
 *
 * The stock `shadow-md` stays, for the same reason `dialog` keeps its
 * `shadow-lg` — the "zero box-shadow" guardrail is about panels and surfaces,
 * and Patternmode ships shadcn's overlays with their shadows intact.
 *
 * Radix owns `Escape`, focus return and click-outside, so nothing here
 * re-implements them. */
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
}: ComponentProps<typeof PopoverPrimitive.Content>) => (
  <PopoverPrimitive.Portal data-slot="popover-portal">
    <PopoverPrimitive.Content
      align={align}
      className={cn(
        "z-50 rounded-lg border border-border bg-surface p-4 shadow-md outline-none animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        className
      )}
      data-slot="popover-content"
      sideOffset={sideOffset}
      {...props}
    />
  </PopoverPrimitive.Portal>
);
