import { docs } from "@/lib/site/home/commands";
import type { Chapter, Command } from "@/lib/site/home/types";

/** One job in the price table and what it costs. */
export interface PriceRow {
  /** The job in plain words. */
  readonly job: string;
  /** The phone board's shorter wording, where it differs. */
  readonly phone?: { readonly job: string };
  /** What a dry run of `request` quotes, exactly as the SDK's `formatCost`
   * prints it. The price test re-runs the dry run and fails on any
   * difference, so change the request and the price together. */
  readonly price: string;
  /** The arguments to `motif` that price the job. A picture is named by its
   * address under `public/`. */
  readonly request: readonly string[];
}

/** The Price chapter has no Task entries: its title and line, the dry-run
 * flag, and a table of real prices with its note. */
export interface PriceChapter extends Chapter {
  readonly command: Command;
  readonly note: string;
  readonly rows: readonly PriceRow[];
}

/** `--dry-run` works with every command, so it has no command page; the
 * quickstart's "Check the price first" step documents it. */
const DRY_RUN: Command = { docs: docs("quickstart"), text: "--dry-run" };

export const PRICE: PriceChapter = {
  id: "price",
  title: "See the price before you run it.",
  intro:
    "A dry run shows what Motif would do and what it would cost. Nothing is spent.",
  tone: "ground",
  entries: [],
  command: DRY_RUN,
  rows: [
    {
      job: "Count the blocks of clay in a photo",
      price: "$0.002",
      request: [
        "ask",
        "How many blocks of clay are there, and where are they?",
        "/demo/series/02.jpg",
      ],
    },
    {
      job: "Upscale a photo four times",
      price: "$0.062",
      request: ["upscale", "/demo/upscale/source.jpg", "--scale", "4"],
    },
    {
      job: "Make a seamless travertine tile",
      price: "$0.063",
      request: ["tile", "a seamless travertine tile"],
    },
    {
      job: "Make five seconds of film from a still",
      phone: { job: "Five seconds of film from a still" },
      price: "$0.840",
      request: [
        "animate",
        "the light moves across the shelf",
        "/demo/video/poster.jpg",
        "--duration",
        "5",
      ],
    },
  ],
  note: "Prices from dry runs.",
};
