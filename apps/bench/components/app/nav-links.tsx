"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/components/app/shell";

/** /docs is served by the docs project through a rewrite, so it has no React
 * payload to prefetch; prefetching it only logs a 404. */
const isDocs = (href: string) => href === "/docs" || href.startsWith("/docs/");

/** The places, with the current one marked. */
export function NavLinks({
  className,
  items,
}: {
  readonly className: string;
  readonly items: readonly NavItem[];
}) {
  const pathname = usePathname();
  const current = (href: string) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav aria-label="Places" className={className}>
      {items.map((item) => (
        <Link
          aria-current={current(item.href) ? "page" : undefined}
          href={item.href}
          key={item.href}
          prefetch={isDocs(item.href) ? false : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
