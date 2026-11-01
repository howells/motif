"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/components/app/shell";

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
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
