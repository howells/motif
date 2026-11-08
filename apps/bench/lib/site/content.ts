/** The site's name, address and install line, read by the root layout, the
 * share card, the manifest, robots, the sitemap and the homepage, and the
 * links to the packages, read by the App's shell. The homepage's own words
 * live in `lib/site/home/`. */

export const SITE = {
  description:
    "One command line for curated image models. Name the job; Motif chooses the model, shows the plan before you spend and hands back the file.",
  install: "npm install -g @howells/motif-cli",
  name: "Motif",
  title: "Motif - one command line for curated image models",
  /** The canonical address. The site answers on other aliases too; search
   * engines and share cards are pointed here. */
  url: "https://motif.danielhowells.com",
} as const;

export const MASTHEAD_LINKS = [
  { href: "https://www.npmjs.com/package/@howells/motif-cli", label: "npm" },
  { href: "https://github.com/howells/motif", label: "GitHub" },
  { href: "https://www.npmjs.com/package/@howells/motif-sdk", label: "SDK" },
] as const;
