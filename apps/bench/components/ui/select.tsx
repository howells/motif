"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `select` on house tokens, trimmed to the trigger/content/item
 * trio this app uses. The stock `shadow-xs`/`shadow-md` stay; what moved is
 * the item's focus wash, off `accent` — in this theme `accent` is the one
 * forest green, not a neutral hover tint, so upstream's `focus:bg-accent`
 * would paint a green row. */
export const Select = (props: ComponentProps<typeof SelectPrimitive.Root>) => (
  <SelectPrimitive.Root data-slot="select" {...props} />
);

export const SelectValue = (
  props: ComponentProps<typeof SelectPrimitive.Value>
) => <SelectPrimitive.Value data-slot="select-value" {...props} />;

export const SelectTrigger = ({
  children,
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) => (
  <SelectPrimitive.Trigger
    className={cn(
      "border-border bg-surface-soft text-ink data-[placeholder]:text-muted flex h-[34px] w-full cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 whitespace-nowrap shadow-xs transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45",
      className
    )}
    data-slot="select-trigger"
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="text-muted size-3.5 shrink-0" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
);

export const SelectContent = ({
  children,
  className,
  position = "popper",
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      className={cn(
        "border-border bg-surface text-ink relative z-50 max-h-(--radix-select-content-available-height) min-w-[var(--radix-select-trigger-width)] origin-(--radix-select-content-transform-origin) overflow-y-auto rounded-md border p-1 shadow-md",
        "animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
        className
      )}
      data-slot="select-content"
      position={position}
      sideOffset={4}
      {...props}
    >
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
);

export const SelectItem = ({
  children,
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) => (
  <SelectPrimitive.Item
    className={cn(
      "data-[highlighted]:bg-surface-soft relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-7 pl-2 outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-45",
      className
    )}
    data-slot="select-item"
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="text-accent absolute right-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <CheckIcon className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
);
