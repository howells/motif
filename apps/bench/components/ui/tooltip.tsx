"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `tooltip` on house tokens — ink plate, paper text, no
 * shadow. Used for the one thing the spec asks a tooltip to carry: the
 * reason behind an `inconclusive` judgment. */
export const TooltipProvider = ({
  delayDuration = 120,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider
    data-slot="tooltip-provider"
    delayDuration={delayDuration}
    {...props}
  />
);

export const Tooltip = (
  props: ComponentProps<typeof TooltipPrimitive.Root>
) => <TooltipPrimitive.Root data-slot="tooltip" {...props} />;

export const TooltipTrigger = (
  props: ComponentProps<typeof TooltipPrimitive.Trigger>
) => <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;

export const TooltipContent = ({
  children,
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      className={cn(
        "z-50 max-w-[280px] origin-(--radix-tooltip-content-transform-origin) rounded-md bg-ink px-2.5 py-1.5 text-[13px] leading-[1.45] text-balance text-background",
        "animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className
      )}
      data-slot="tooltip-content"
      sideOffset={sideOffset}
      {...props}
    >
      {children}
      <TooltipPrimitive.Arrow className="z-50 size-2 translate-y-[calc(-50%_-_1px)] rotate-45 bg-ink fill-ink" />
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
);
