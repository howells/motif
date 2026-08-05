"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `dialog` on house tokens, trimmed to the parts this app uses.
 * The stock `shadow-lg` stays (Patternmode keeps it); what is gone is the
 * built-in close button. That was for the lightbox, which supplied its own
 * chrome; Aperto owns the expanded image view now and the only dialog left
 * is the mobile runs drawer (`runs-rail.tsx`), which dismisses on overlay
 * tap and `Escape` and carries no close control of its own. */
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
      // Deep enough that the page behind it stops competing with the image
      // being judged, which is the only thing this app opens a dialog for.
      "fixed inset-0 z-50 bg-ink/85 animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
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
}: ComponentProps<typeof DialogPrimitive.Content>) => (
  <DialogPrimitive.Portal data-slot="dialog-portal">
    <DialogOverlay />
    <DialogPrimitive.Content
      className={cn(
        "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[min(1100px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-border bg-surface shadow-lg animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className
      )}
      data-slot="dialog-content"
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
);

export const DialogTitle = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title
    className={cn("font-medium", className)}
    data-slot="dialog-title"
    {...props}
  />
);

export const DialogDescription = ({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description
    className={cn("text-[13px] text-muted", className)}
    data-slot="dialog-description"
    {...props}
  />
);
