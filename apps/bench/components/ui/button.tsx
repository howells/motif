import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `button`, retuned to the house theme
 * (`docs/design/specs/design-bench.md`): `transition-all` narrowed to the
 * three properties that actually change, and the focus ring left to the
 * global `:focus-visible` rule in `app/globals.css` rather than a
 * per-variant `ring-*` stack, so every control rings identically.
 *
 * The stock `shadow-xs` stays. The spec's "zero box-shadow" guardrail is
 * about panels and surfaces — Patternmode ships shadcn's primitives with
 * their shadows intact, and matching that is what makes the two apps read
 * as siblings.
 *
 * `accent` is the only filled variant and the spec allows at most two filled
 * elements per screen — reach for `outline` unless this is *the* action of
 * the page. */
const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md whitespace-nowrap transition-[background-color,border-color,color] duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    defaultVariants: {
      size: "default",
      variant: "outline",
    },
    variants: {
      size: {
        default: "h-[34px] px-3.5",
        icon: "size-8",
        sm: "h-8 px-3",
      },
      variant: {
        accent:
          "border-accent bg-accent text-background hover:bg-accent/90 border font-medium shadow-xs",
        ghost: "text-muted hover:bg-surface-soft hover:text-ink",
        link: "text-accent underline-offset-4 hover:underline",
        outline:
          "border-border bg-surface text-ink hover:border-ink border shadow-xs",
        // The plate is the one dark surface; its controls cannot borrow the
        // paper palette or they vanish into it.
        plate:
          "border-plate-edge text-plate-ink hover:bg-plate-edge focus-visible:outline-plate-ink border bg-transparent",
      },
    },
  }
);

export const Button = ({
  asChild = false,
  className,
  size,
  variant,
  ...props
}: ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { readonly asChild?: boolean }) => {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      className={cn(buttonVariants({ className, size, variant }))}
      data-slot="button"
      {...props}
    />
  );
};

export { buttonVariants };
