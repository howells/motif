import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `skeleton`, on the plate rather than on paper — the only
 * place this app shows one is a frame waiting for its image
 * (`docs/design/specs/design-bench.md`: "skeleton at the frame's aspect on
 * the plate. No spinner, no layout shift when the image lands").
 *
 * `motion-safe:` rather than a bare `animate-pulse`: under
 * `prefers-reduced-motion` the pulse drops away and the static
 * `plate-edge` tint remains, which is exactly the spec's reduced-motion
 * requirement rather than an approximation of it. */
export const Skeleton = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn("bg-plate-edge motion-safe:animate-pulse", className)}
    data-slot="skeleton"
    {...props}
  />
);
