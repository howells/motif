/** The homepage as data: chapters, made of entries, made of figures, with the
 * hero before them and the close after. Components render these shapes and
 * hold no words of their own. */

/** A file under `public/`, at the size the file really is. The test reads the
 * file and fails if either number is wrong. */
export interface ImageRef {
  /** What the picture shows, not which Task made it. */
  readonly alt: string;
  readonly height: number;
  /** Site-relative, e.g. `/demo/showcase/hero.jpg`. */
  readonly src: string;
  readonly width: number;
}

/** A command as the page prints it, linked to the docs page that explains
 * it. Build one with `taskCommand`, `cliCommand` or `INSTALL` so the link is
 * derived, never typed by hand. */
export interface Command {
  /** Site-relative docs page, e.g. `/docs/commands/erase`. */
  readonly docs: string;
  readonly text: string;
}

export interface Link {
  readonly href: string;
  readonly label: string;
}

/** One picture and the words that hang below it. `phone` swaps the picture or
 * the caption where the phone board shows a different one. */
export interface Figure {
  readonly caption?: string;
  readonly image: ImageRef;
  readonly phone?: {
    readonly caption?: string;
    readonly image?: ImageRef;
  };
}

/** One line of a conversation with Motif, and who said it. */
export interface Turn {
  readonly speaker: string;
  readonly text: string;
}

/** A question put to Motif about a picture and the answer it gave, word for
 * word from a real run. */
export interface Exchange {
  readonly answer: Turn;
  readonly question: Turn;
}

/** One Task on the page: a plain headline, a line or two, the command and the
 * pictures that show it. A row of plates (Looks, Moods) can stand without the
 * headline or the line, as the board draws it. */
export interface Entry {
  readonly body?: string;
  readonly command: Command;
  /** Present where the entry shows a question and Motif's answer. */
  readonly exchange?: Exchange;
  readonly figures: readonly Figure[];
  readonly headline?: string;
  /** The fragment the entry answers to, unique on the page. */
  readonly id: string;
}

export interface Chapter {
  readonly entries: readonly Entry[];
  /** The fragment the chapter answers to; the masthead links here. */
  readonly id: string;
  /** The one line beside the title. */
  readonly intro: string;
  /** Present when the masthead links to this chapter, with these words. */
  readonly nav?: string;
  readonly title: string;
  /** `mount` sets the chapter on the slightly darker ground. */
  readonly tone: "ground" | "mount";
}

export interface Home {
  readonly chapters: readonly Chapter[];
  readonly close: {
    /** The closing line, set as large as the wordmark. */
    readonly line: string;
    readonly install: Command;
    readonly links: readonly Link[];
    readonly credit: string;
  };
  readonly hero: {
    readonly figure: Figure & {
      readonly caption: string;
      readonly command: Command;
    };
    readonly install: Command;
    readonly intro: string;
  };
  readonly masthead: {
    readonly docs: Link;
    readonly github: Link;
    /** Names the masthead's link list for screen readers. */
    readonly label: string;
    /** The phone's menu button, read by screen readers. */
    readonly menu: string;
    readonly openApp: Link;
    readonly signIn: string;
    /** Where the sign-in form posts. */
    readonly signInAction: string;
  };
  /** The one word set in the masthead, the hero and the close. */
  readonly wordmark: string;
}
