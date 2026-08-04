import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** shadcn/ui's `table` on house tokens. Rules are `border-soft` hairlines
 * between rows and a `border` rule under the header — no zebra fill, no row
 * hover wash: the numbers are the content, and a tinted row would compete
 * with the one thing this table highlights (the best value in a row).
 *
 * Column headers are the one place besides the verdict labels where mono
 * small-caps is allowed (`docs/design/specs/design-bench.md`, Typography). */
export const Table = ({ className, ...props }: ComponentProps<"table">) => (
  <div className="w-full overflow-x-auto" data-slot="table-container">
    <table
      className={cn("w-full caption-bottom border-collapse", className)}
      data-slot="table"
      {...props}
    />
  </div>
);

export const TableHeader = ({
  className,
  ...props
}: ComponentProps<"thead">) => (
  <thead
    className={cn("[&_tr]:border-b [&_tr]:border-border", className)}
    data-slot="table-header"
    {...props}
  />
);

export const TableBody = ({ className, ...props }: ComponentProps<"tbody">) => (
  <tbody
    className={cn("[&_tr:last-child]:border-0", className)}
    data-slot="table-body"
    {...props}
  />
);

export const TableRow = ({ className, ...props }: ComponentProps<"tr">) => (
  <tr
    className={cn("border-b border-border-soft", className)}
    data-slot="table-row"
    {...props}
  />
);

export const TableHead = ({ className, ...props }: ComponentProps<"th">) => (
  <th
    className={cn(
      "px-2.5 py-2 text-left align-bottom font-mono text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-muted uppercase first:pl-0 last:pr-0",
      className
    )}
    data-slot="table-head"
    {...props}
  />
);

export const TableCell = ({ className, ...props }: ComponentProps<"td">) => (
  <td
    className={cn("px-2.5 py-2.5 align-top first:pl-0 last:pr-0", className)}
    data-slot="table-cell"
    {...props}
  />
);

export const TableCaption = ({
  className,
  ...props
}: ComponentProps<"caption">) => (
  <caption
    className={cn("mt-3 text-left text-[13px] text-muted", className)}
    data-slot="table-caption"
    {...props}
  />
);
