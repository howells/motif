"use client";

import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `checkbox` on house tokens. Checked fills at `ink` rather
 * than `accent` for the same reason as `switch`: the accent budget belongs
 * to the page's real action, not to routine control state. */
export const Checkbox = ({
  className,
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) => (
  <CheckboxPrimitive.Root
    className={cn(
      "peer size-4 shrink-0 cursor-pointer rounded-[4px] border border-border bg-surface shadow-xs transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 data-[state=checked]:border-ink data-[state=checked]:bg-ink data-[state=checked]:text-background",
      className
    )}
    data-slot="checkbox"
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className="grid place-content-center text-current"
      data-slot="checkbox-indicator"
    >
      <CheckIcon className="size-3" strokeWidth={2.5} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
);
