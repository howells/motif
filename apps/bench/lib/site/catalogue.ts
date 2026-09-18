/** The catalogue: every command Motif has, one full-width band each.
 *
 * Copy is the CLI's. `summary` is `motif --describe tasks` sentence-cased
 * and `usage` is the signature verbatim. The page must not describe a command
 * differently from the tool itself. */

export interface Plate {
  readonly alt: string;
  readonly caption?: string;
  readonly height: number;
  readonly src: string;
  readonly width: number;
}

export interface LedgerRow {
  readonly cost: string;
  readonly id: string;
  readonly model: string;
  readonly prompt: string;
}

/** How the field to the right of the rail is drawn.
 *
 * Fifteen treatments in the Paper index. Restyle is a Pair here: there is no
 * reference-image asset, so three-up would invent a picture. Reframe pairs the
 * 16:9 bench with its square extension, so the new canvas reads at a glance.
 * Relight is a specimen, not a pair: no same-scene relight asset exists, so
 * the band shows the two real invocations instead of a regeneration passing
 * as a relight. Series is a carousel of its six images, not a `series show`
 * specimen: the specimen text beside the pictures added nothing the rail
 * doesn't already say. Studio is a specimen of the real Studio home menu,
 * set as type rather than screenshotted. Upscale and restore are details
 * rather than matched pairs: two squares at the same size hide the very
 * difference they are there to show, so both files are drawn at one
 * magnification and clipped to the same region instead. */
export type CatalogueTreatment =
  | "ask"
  | "carousel"
  | "detail"
  | "held"
  | "ledger"
  | "lifted"
  | "matched"
  | "motion"
  | "pair"
  | "plate"
  | "repeat"
  | "set"
  | "specimen"
  | "stack"
  | "studio"
  | "takes"
  | "trio";

export interface CatalogueEntry {
  readonly answer?: string;
  readonly duration?: string;
  /** Where in both files the detail panes are centred, as fractions of the
   * file's own width and height. */
  readonly focus?: { readonly x: number; readonly y: number };
  /** Caps a held frame near native size, for detail crops that would only
   * blur blown up to the field width. */
  readonly frameCap?: number;
  readonly frames?: readonly Plate[];
  readonly id: string;
  readonly legend?: string;
  readonly ledger?: readonly LedgerRow[];
  /** The result caption is a command rather than a sentence, so it is set in
   * mono. */
  readonly mono?: boolean;
  readonly plain?: boolean;
  readonly question?: string;
  readonly result?: Plate;
  readonly source?: Plate;
  readonly specimen?: readonly string[];
  readonly summary: string;
  readonly treatment: CatalogueTreatment;
  readonly usage: string;
  readonly verb: string;
  readonly video?: string;
  /** How wide each file is drawn inside a detail pane, in CSS pixels. Both
   * panes use the same number, which is what makes the magnification the
   * same and the difference the command's. */
  readonly zoom?: number;
}

export interface CatalogueGroup {
  readonly body: string;
  readonly count: string;
  readonly entries: readonly CatalogueEntry[];
  readonly name: string;
}

export { CATALOGUE } from "@/lib/site/catalogue-groups";
