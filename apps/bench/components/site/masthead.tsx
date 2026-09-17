import { FOOTER_LINKS, MASTHEAD_LINKS, SITE } from "@/lib/site/content";

/** The install line on the left, where a reader looks for it, and the three
 * places the package lives on the right. */
export function Masthead() {
  return (
    <header className="site-gutter flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-6">
      <code className="type-mono" style={{ color: "var(--faint)" }}>
        {SITE.install}
      </code>
      <nav className="flex gap-6">
        {MASTHEAD_LINKS.map((link) => (
          <a
            className="type-small no-underline hover:underline"
            href={link.href}
            key={link.label}
            style={{ color: "var(--muted)" }}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-gutter flex flex-wrap items-center justify-between gap-x-12 gap-y-4 pt-30 pb-16">
      <code className="type-mono" style={{ color: "var(--ink)" }}>
        {SITE.install}
      </code>
      <nav className="flex flex-wrap gap-x-7 gap-y-2">
        {FOOTER_LINKS.map((link) => (
          <a
            className="type-small no-underline hover:underline"
            href={link.href}
            key={link.label}
            style={{ color: "var(--muted)" }}
          >
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
