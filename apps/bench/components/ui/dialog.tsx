"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { usePortalContainer } from "@/lib/portal";
import { cn } from "@/lib/utils";

/** A phone's sheet on the paper palette, sitting on top of the bottom bar's
 * edge so the bar stays in view. It is the Runs list and the Bench's
 * settings on a phone; a wider screen has a rail and a popover instead.
 * Radix owns focus, `Escape` and the overlay tap. */
export const Dialog = (props: ComponentProps<typeof DialogPrimitive.Root>) => (
  <DialogPrimitive.Root data-slot="dialog" {...props} />
);

export const DialogTrigger = (
  props: ComponentProps<typeof DialogPrimitive.Trigger>
) => <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;

export const DialogClose = (
  props: ComponentProps<typeof DialogPrimitive.Close>
) => <DialogPrimitive.Close data-slot="dialog-close" {...props} />;

export const DialogOverlay = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) => (
  <DialogPrimitive.Overlay
    className={cn(
      "bg-plate/45 animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-x-0 top-0 bottom-[var(--bar)] z-50",
      className
    )}
    data-slot="dialog-overlay"
    {...props}
  />
);

export const DialogContent = ({
  children,
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) => {
  const container = usePortalContainer();
  return (
    <DialogPrimitive.Portal container={container} data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "bg-background text-ink rounded-t-panel animate-in fade-in-0 slide-in-from-bottom-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-x-0 bottom-[var(--bar)] z-50 flex max-h-[calc(100dvh-var(--bar)-var(--spacing-24))] flex-col outline-none",
          className
        )}
        data-slot="dialog-content"
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
};

export const DialogTitle = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title
    className={cn("type-title", className)}
    data-slot="dialog-title"
    {...props}
  />
);

export const DialogDescription = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description
    className={cn("text-muted type-small", className)}
    data-slot="dialog-description"
    {...props}
  />
);
