/** Types for the demo page content. Import them from `@/lib/site/content`. */

export interface Asset {
  alt: string;
  height: number;
  src: string;
  width: number;
}

export type Demo =
  /** Same framing before and after, so the two are directly comparable. */
  | { after: Asset; before: Asset; kind: "pair" }
  /** Several outputs from one call, such as layers or material maps. */
  | { kind: "set"; outputs: Asset[]; source?: Asset }
  /** Boxes in normalised coordinates, 0 to 1 across the source image. */
  | {
      answer?: string;
      boxes: {
        label: string;
        x0: number;
        x1: number;
        y0: number;
        y1: number;
      }[];
      kind: "boxes";
      source: Asset;
    }
  | { kind: "text"; output: string; source?: Asset };

export type CapabilityGroup = "edit" | "make" | "tools" | "understand";

export interface Capability {
  /** What changed, factual, one sentence. */
  caption: string;
  /** Exact, as run, with paths shortened to file names. */
  command: string;
  demo: Demo;
  group: CapabilityGroup;
  id: string;
  notes?: string;
  /** The Motif command this demonstrates, when a fal tool made the asset. */
  relatesTo?: string;
  /** The user's task, in sentence case. */
  title: string;
  /** The fal registry tool that made the asset, when one did. */
  tool?: string;
}

export interface LookEntry {
  /** The command that made `image`, only for looks that have one. */
  command?: string;
  description: string;
  id: string;
  image?: Asset;
  name: string;
  prompt?: string;
}
