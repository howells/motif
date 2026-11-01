"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { usePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";

/** A tooltip on the paper palette: a hairlined panel, not a dark chip. */
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
}: ComponentProps<typeof TooltipPrimitive.Content>) => {
  const container = usePortalContainer();
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Content
        className={cn(
          "bg-background text-ink border-border rounded-control type-small z-50 max-w-[280px] border px-3 py-2 text-balance",
          "animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          className
        )}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
};
