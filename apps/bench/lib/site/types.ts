/** Types for the demo page content. Import them from `@/lib/site/content`. */

export interface Asset {
  alt: string;
  height: number;
  src: string;
  width: number;
}

/** A command and its captured output, shortened where the output is long. */
export interface Transcript {
  command: string;
  output: string;
}

/** One series run: its images in order, each with the framing its scene
 * prompt was given, then the run's contact sheet and history. */
export interface SeriesDemo {
  kind: "series";
  list: Transcript;
  /** The first scene prompt in full, to show how the framing slots in. */
  scenePrompt: string;
  scenes: { image: Asset; slot: string }[];
  sheet: { command: string; image: Asset };
  show: Transcript;
}

export type Demo =
  /** Same framing before and after, so the two are directly comparable.
   * `detail` adds the same region of each at full size, for changes too fine
   * to see in the whole frame. */
  | {
      after: Asset;
      before: Asset;
      detail?: { after: Asset; before: Asset };
      kind: "pair";
    }
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
      /** The command's raw output, when it is worth showing as printed. */
      output?: string;
      source: Asset;
    }
  | SeriesDemo
  /** Captured terminal text, for commands that print rather than save. */
  | { kind: "terminal"; label: string; output: string; wrap?: boolean }
  | { kind: "text"; output: string; source?: Asset }
  /** A video file, with the frame shown before it plays. */
  | {
      kind: "video";
      label: string;
      poster: Asset;
      source?: Asset;
      src: string;
    };

export type CapabilityGroup = "edit" | "make" | "more" | "tools" | "understand";

export interface Capability {
  /** What changed, factual, one sentence. */
  caption: string;
  /** Exact, as run, with paths shortened to file names. Commands run one
   * after the other go on separate lines. */
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
  acceptsMood: boolean;
  /** The command that made `image`. */
  command: string;
  description: string;
  id: string;
  image: Asset;
  name: string;
  prompt: string;
}

export interface MoodEntry {
  /** The command that made `image`. */
  command: string;
  description: string;
  id: string;
  image: Asset;
  name: string;
}
