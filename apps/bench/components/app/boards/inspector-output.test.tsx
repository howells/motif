import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BoardViewSchema } from "../../../lib/app/client/board-schemas";
import type { NodeViewData } from "../../../lib/app/client/board-schemas";
import { BoardContext } from "./board-context";
import type { BoardActions } from "./board-context";
import { OutputFields } from "./inspector-output";
import { MarkupField } from "./markup-field";
import { versionOf } from "./use-node-options";

const SOURCE = `ast_${"a".repeat(32)}`;
const MARKUP = `ast_${"b".repeat(32)}`;

const node = (id: string, kind: string, settings: object) => ({
  id,
  kind,
  names: {},
  pick: null,
  price: null,
  results: [],
  settings,
  stale: false,
  x: 0,
  y: 0,
});

/** A Source feeding a Vary with markup drawn on it, and a GIF Generate. */
const VIEW = BoardViewSchema.parse({
  board: { id: "brd_1", kind: "board", name: "Markup" },
  nodes: [
    {
      ...node("nod_s", "source", { assetId: SOURCE }),
      pick: { assetId: SOURCE, height: 600, url: "/s", width: 800 },
    },
    node("nod_v", "vary", { markupAssetId: MARKUP, markupDrawnOn: SOURCE }),
    node("nod_g", "generate", { format: "gif", model: "flare" }),
  ],
  runs: [],
  wires: [{ from: "nod_s", id: "wir_1", to: "nod_v" }],
});

const find = (id: string): NodeViewData => {
  const found = VIEW.nodes.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`No node ${id}.`);
  }
  return found;
};

const generateNode = (): Extract<NodeViewData, { kind: "generate" }> => {
  const found = find("nod_g");
  if (found.kind !== "generate") {
    throw new Error("nod_g isn't a Generate.");
  }
  return found;
};

const varyNode = (): Extract<NodeViewData, { kind: "vary" }> => {
  const found = find("nod_v");
  if (found.kind !== "vary") {
    throw new Error("nod_v isn't a Vary.");
  }
  return found;
};

const actions: BoardActions = {
  chooseSource: vi.fn<() => void>(),
  editSettings: vi.fn<() => void>(),
  makePick: vi.fn<() => void>(),
  now: 0,
  openRun: vi.fn<() => void>(),
  process: () => ({
    beats: [],
    failed: false,
    finished: false,
    live: false,
    origin: null,
  }),
  select: vi.fn<() => void>(),
  selectedId: null,
  stop: vi.fn<() => void>(),
  view: VIEW,
  words: { looks: [], moods: [] },
};

const render = (children: React.ReactNode, generate = false): string => {
  const client = new QueryClient();
  if (generate) {
    const target = generateNode();
    client.setQueryData(["options", target.id, versionOf(target, VIEW)], {
      models: [
        {
          chosen: true,
          listMicros: 500_000,
          model: "flare",
          name: "GPT Image 2.6 Flare",
          qualities: ["low", "medium", "high", "xhigh", "max"],
          reason: null,
          tier: "quality",
          usage: true,
        },
      ],
      motifChoice: "sunburst",
    });
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <BoardContext value={actions}>{children}</BoardContext>
    </QueryClientProvider>
  );
};

describe(OutputFields, () => {
  it("offers Image, GIF and SVG, with a GIF's frames and the Model's quality", () => {
    const html = render(<OutputFields node={generateNode()} />, true);
    expect(html).toContain(">SVG<");
    expect(html).toContain("Frames");
    expect(html).toContain("200 ms");
    expect(html).toContain("Extra high");
  });

  it("offers no SVG for an edit", () => {
    const html = render(<OutputFields node={varyNode()} />);
    expect(html).toContain(">GIF<");
    expect(html).not.toContain(">SVG<");
  });
});

describe(MarkupField, () => {
  it("shows markup over the image it was drawn on", () => {
    const html = render(<MarkupField node={varyNode()} />);
    expect(html).toContain("The markup drawn on it");
    expect(html).toContain("Draw again");
    expect(html).toContain("Clear");
  });
});
