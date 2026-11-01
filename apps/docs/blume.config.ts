import { defineConfig } from "blume";

import { GROUPS } from "./scripts/commands";

const SITE = "https://motif.danielhowells.com";

/** The Motif documentation, served from motif.danielhowells.com/docs.
 *
 * The main site rewrites /docs/:path* to this project, so every page, asset,
 * sitemap entry and llms.txt link has to sit under /docs. `deployment.base`
 * does that for the whole app. `basePath` alone would move only the pages and
 * leave public/ at the site root, where the rewrite would never reach it. */
export default defineConfig({
  agents: {
    llmsTxt: {
      details:
        "Reach for Motif when a project needs images or short video made or edited from the command line, with a price shown before anything is spent. Install it with `npm install -g @howells/motif-cli`; the SDK is `@howells/motif-sdk`.",
    },
    // The MCP server is a live endpoint, so it needs a server adapter. This
    // site is static, so it stays off; llms.txt and the raw Markdown mirror
    // are the agent surface.
    mcp: { enabled: false },
  },
  deployment: {
    base: "/docs",
    site: SITE,
  },
  description:
    "Install Motif, add a fal key, and make, edit and inspect images from your terminal.",
  feedback: false,
  footer: {
    copyright: "Motif documentation",
    links: [
      { href: "https://github.com/howells/motif", label: "GitHub" },
      {
        href: "https://www.npmjs.com/package/@howells/motif-cli",
        label: "npm",
      },
      { href: `${SITE}/docs/llms.txt`, label: "llms.txt" },
    ],
  },
  logo: { href: SITE, text: "Motif" },
  markdown: { code: { icons: false } },
  navigation: {
    cta: { href: `${SITE}/make`, label: "Open the App" },
    repo: false,
    // Written out so the order matches the Paper boards: two groups, then
    // three plain pages. The command groups are the same ones the generated
    // pages are written from.
    sidebar: {
      display: "flat",
      items: [
        { items: ["/quickstart", "/setup"], label: "Getting started" },
        {
          items: [
            "/commands",
            ...GROUPS.map((group) => ({
              collapsed: true,
              display: "group" as const,
              items: group.commands.map((spec) => `/commands/${spec.id}`),
              label: group.name,
            })),
          ],
          label: "Commands",
        },
        "/looks-and-moods",
        "/agents",
        "/sdk",
      ],
    },
  },
  redirects: [{ from: "/", status: 302, to: "/quickstart" }],
  seo: { rss: { enabled: false } },
  theme: {
    accent: "#1C1B1A",
    action: "#1C1B1A",
    background: "#FAF9F7",
    fonts: {
      body: "inter",
      display: "inter",
      mono: {
        fallback: "mono",
        name: "DM Mono",
        provider: "google",
        weights: [400, 500],
      },
    },
    mode: "light",
    radius: "sm",
    toggle: false,
  },
  title: "Motif documentation",
});
