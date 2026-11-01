import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/** A table on paper: hairlines between rows and no fill, so the figures are
 * the content. Rows are one control tall. The page scrolls it sideways when a
 * long run has more Models than the width holds. */
export const Table = ({ className, ...props }: ComponentProps<"table">) => (
  <table
    className={cn("w-full caption-bottom border-collapse", className)}
    data-slot="table"
    {...props}
  />
);

export const TableHeader = ({
  className,
  ...props
}: ComponentProps<"thead">) => (
  <thead
    className={cn("[&_tr]:border-border [&_tr]:border-b", className)}
    data-slot="table-header"
    {...props}
  />
);

export const TableBody = ({ className, ...props }: ComponentProps<"tbody">) => (
  <tbody
    className={cn("[&_tr:last-child]:border-b", className)}
    data-slot="table-body"
    {...props}
  />
);

export const TableRow = ({ className, ...props }: ComponentProps<"tr">) => (
  <tr
    className={cn("border-border h-control border-b", className)}
    data-slot="table-row"
    {...props}
  />
);

/** A column header names the column: muted, sentence case, regular weight. */
export const TableHead = ({ className, ...props }: ComponentProps<"th">) => (
  <th
    className={cn(
      "text-muted type-small px-3 py-2 text-left align-middle whitespace-nowrap first:pl-0 last:pr-0",
      className
    )}
    data-slot="table-head"
    {...props}
  />
);

export const TableCell = ({ className, ...props }: ComponentProps<"td">) => (
  <td
    className={cn("px-3 py-2 align-middle first:pl-0 last:pr-0", className)}
    data-slot="table-cell"
    {...props}
  />
);

export const TableCaption = ({
  className,
  ...props
}: ComponentProps<"caption">) => (
  <caption
    className={cn("text-muted type-small mt-3 text-left", className)}
    data-slot="table-caption"
    {...props}
  />
);
