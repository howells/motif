import { MASTHEAD_LINKS, SITE } from "@/lib/site/content";
import { CHAPTERS } from "@/lib/site/home/chapters";
import { docs, INSTALL, taskCommand } from "@/lib/site/home/commands";
import type { Home, Link } from "@/lib/site/home/types";

/** Every word on the homepage, in page order, as the Paper file "Motif" sets
 * it (desktop and phone homepage artboards). The words follow that file
 * exactly; change them there first. */

function github(): Link {
  const found = MASTHEAD_LINKS.find((link) => link.label === "GitHub");
  if (found === undefined) {
    throw new Error("MASTHEAD_LINKS has no GitHub link");
  }
  return { href: found.href, label: found.label };
}

const GITHUB = github();

const STILL_LIFE =
  "Two amber glass bottles, one holding a sprig of dried flowers, and a small brass dish on a walnut shelf against an olive wall, with late sun throwing leaf shadows across it.";

export const HOME: Home = {
  wordmark: SITE.name,

  masthead: {
    docs: { href: docs(), label: "Docs" },
    github: GITHUB,
    label: "Motif",
    menu: "Menu",
    openApp: { href: "/make", label: "Open the App" },
    signIn: "Sign in",
    signInAction: "/auth/sign-in",
  },

  hero: {
    intro:
      "Make and edit pictures by describing them. Motif picks the model, tells you the price and saves the file.",
    install: INSTALL,
    figure: {
      caption: "Made from one sentence.",
      command: taskCommand(
        "generate",
        'motif "amber bottles and a brass dish on a walnut shelf…"'
      ),
      image: {
        alt: STILL_LIFE,
        height: 1440,
        src: "/demo/showcase/hero.jpg",
        width: 2560,
      },
      phone: {
        caption:
          "Made from one sentence: “amber bottles and a brass dish on a walnut shelf”.",
        image: {
          alt: STILL_LIFE,
          height: 1440,
          src: "/demo/showcase/hero-portrait.jpg",
          width: 1150,
        },
      },
    },
  },

  chapters: CHAPTERS,

  close: {
    line: "Start with a sentence.",
    install: INSTALL,
    links: [
      { href: docs(), label: "Read the docs" },
      { href: docs("commands"), label: "Browse every task" },
      { href: docs("sdk"), label: "Use it from code" },
      { href: docs("agents"), label: "Use it with an AI agent" },
      GITHUB,
    ],
    credit: "Every picture on this page was made or edited with Motif.",
  },
};
