import Link from "next/link";

import { InstallBlock } from "@/components/home/install";
import { HOME } from "@/lib/site/content";

/** Where the page ends: the install command, the two ways in, and a ruled
 * list into the docs. On a phone the heading, the list and then the actions
 * stack; from 768px the heading and actions share the left column and the
 * list takes the right. */
export function HomeHandoff() {
  return (
    <section
      aria-labelledby="home-handoff"
      className="home-gutter home-section flex flex-col gap-8 md:grid md:grid-cols-[456px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-12"
    >
      <h2 className="type-heading" id="home-handoff">
        {HOME.handoff}
      </h2>

      <ul className="m-0 flex list-none flex-col p-0 md:col-start-2 md:row-span-2 md:row-start-1">
        {HOME.docs.map((item) => (
          <li className="border-border border-t last:border-b" key={item.href}>
            <a
              className="group min-h-control flex flex-col justify-center gap-1 py-4 no-underline md:h-[72px] md:flex-row md:items-center md:justify-between md:py-0"
              href={item.href}
            >
              <span className="type-body font-medium group-hover:underline">
                {item.title}
              </span>
              <span className="type-body text-muted">{item.body}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 md:col-start-1 md:row-start-2">
        <InstallBlock />
        <div className="flex flex-col gap-2 md:flex-row">
          <Link
            className="app-button is-primary type-body font-medium md:flex-1"
            href="/docs"
            prefetch={false}
          >
            Read the docs
          </Link>
          <Link
            className="app-button home-button-raised type-body font-medium md:flex-1"
            href="/make"
          >
            Open the App
          </Link>
        </div>
      </div>
    </section>
  );
}
