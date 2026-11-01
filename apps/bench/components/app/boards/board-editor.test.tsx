import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BoardViewSchema } from "../../../lib/app/client/board-schemas";
import { BoardEditor } from "./board-editor";

const result = (generationId: string, model: string, assetId: string) => ({
  completedAt: "2026-11-01T10:00:04.000Z",
  costEstimated: false,
  costMicros: 30_000,
  createdAt: "2026-11-01T10:00:00.000Z",
  elapsedMs: 4000,
  error: null,
  generationId,
  model,
  modelName: model === "grok-image" ? "Grok Imagine" : "Muse",
  outputs: [{ assetId, url: `/api/app/media/${assetId}` }],
  runId: "brun_1",
  status: "completed",
  typicalMs: 5000,
});

const node = (id: string, kind: string, x: number) => ({
  id,
  kind,
  names: {},
  pick: null,
  price: null,
  results: [],
  settings: {},
  stale: false,
  x,
  y: 0,
});

/** A Board as the server would send it: a Prompt feeding a Generate whose
 * Pick has gone Stale, and a Compare across two Models with one picked. */
const VIEW = BoardViewSchema.parse({
  board: { id: "brd_1", kind: "board", name: "Apothecary shelf" },
  nodes: [
    {
      ...node("nod_p", "prompt", 0),
      settings: { text: "Amber bottles on a stone shelf" },
    },
    {
      ...node("nod_g", "generate", 360),
      price: { detail: "1 image", listMicros: 30_000, ok: true, usage: false },
      stale: true,
    },
    {
      ...node("nod_c", "compare", 360),
      names: { "grok-image": "Grok Imagine", "muse-image": "Muse" },
      pick: { assetId: "ast_a", height: 1024, url: "/a", width: 1024 },
      results: [
        result("gen_a", "grok-image", "ast_a"),
        result("gen_b", "muse-image", "ast_b"),
      ],
      settings: { models: ["grok-image", "muse-image"] },
      y: 400,
    },
  ],
  runs: [],
  wires: [
    { from: "nod_p", id: "wir_1", to: "nod_g" },
    { from: "nod_p", id: "wir_2", to: "nod_c" },
  ],
});

/** The words the form offers, as the App passes them in. */
const OPTIONS = {
  aspects: ["1:1", "4:5", "3:2", "9:16"],
  looks: [
    { acceptsMood: true, aspect: "4:5", id: "editorial", label: "Editorial" },
    { acceptsMood: false, aspect: "1:1", id: "object", label: "Object" },
  ],
  maxImages: 4,
  maxReferences: 4,
  moods: [{ id: "calm", label: "Calm" }],
};

/** A server render has no navigation to do; the Board only needs a router
 * to exist. */
const STILL: AppRouterInstance = {
  back: vi.fn<() => void>(),
  bfcacheId: "test",
  forward: vi.fn<() => void>(),
  prefetch: vi.fn<() => void>(),
  push: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
  replace: vi.fn<() => void>(),
};

const render = (view = VIEW): string =>
  renderToStaticMarkup(
    <AppRouterContext value={STILL}>
      <QueryClientProvider client={new QueryClient()}>
        <BoardEditor initial={view} options={OPTIONS} />
      </QueryClientProvider>
    </AppRouterContext>
  );

describe(BoardEditor, () => {
  it("draws the Board's bar, name and add-node control", () => {
    const html = render();

    expect(html).toContain("Apothecary shelf");
    expect(html).toContain("Add node");
    expect(html).toContain("⌘K");
  });

  it("says what is Stale and offers to run it without spending", () => {
    const html = render();

    expect(html).toContain("Generate is stale");
    expect(html).toContain("Nothing is spent until you run them.");
  });

  it("draws a node card per node, with Task names in Title case", () => {
    const html = render();

    expect(html).toContain("Amber bottles on a stone shelf");
    expect(html).toContain(">Generate<");
    expect(html).toContain(">Compare<");
    expect(html).not.toMatch(/>(generate|compare|prompt)</u);
  });

  it("shows a Compare's Models side by side with the Pick marked", () => {
    const html = render();

    expect(html).toContain("Grok Imagine");
    expect(html).toContain("Muse");
    expect(html).toContain("Make Pick");
    expect(html).toContain(">Pick<");
  });

  it("prices a usage-billed Model as its hold, not a refusal", () => {
    const html = render(
      BoardViewSchema.parse({
        ...VIEW,
        nodes: VIEW.nodes.map((item) =>
          item.id === "nod_g"
            ? {
                ...item,
                price: {
                  detail: "Nano Banana 2.1, 1 image",
                  listMicros: 500_000,
                  ok: true,
                  usage: true,
                },
                stale: false,
              }
            : item
        ),
      })
    );

    expect(html).toContain("Up to $0.50");
    expect(html).not.toContain("Not ready");
  });
});
