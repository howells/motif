import { HOME, MASTHEAD_LINKS } from "@/lib/site/content";

const ORDER = ["GitHub", "npm", "SDK"] as const;

const LINKS = [
  ...ORDER.flatMap((label) => {
    const found = MASTHEAD_LINKS.find((item) => item.label === label);
    return found === undefined ? [] : [found];
  }),
  HOME.llms,
];

export function HomeFooter() {
  return (
    <footer className="home-gutter flex items-end pt-6 pb-4 md:pt-24">
      <nav aria-label="Elsewhere" className="flex gap-6 md:gap-8">
        {LINKS.map((item) => (
          <a
            className="type-small text-muted min-h-control inline-flex items-center no-underline hover:underline"
            href={item.href}
            key={item.label}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
