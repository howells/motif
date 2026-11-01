import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { processOf } from "../../../lib/app/boards/process";
import type { Beat, RunEventKind } from "../../../lib/app/boards/run-events";
import { LiveBeats, ProcessLog } from "./process";

const beat = (
  seq: number,
  kind: RunEventKind,
  text: string,
  at: number
): Beat => ({
  at: new Date(Date.parse("2026-11-01T10:00:00.000Z") + at).toISOString(),
  data: null,
  kind,
  nodeId: "nod_x",
  seq,
  text,
});

const BEATS = [
  beat(1, "begin", "Starting", 0),
  beat(2, "read", "Reading the Prompt", 400),
  beat(
    3,
    "price",
    "Pricing again on the real image: $0.070, within the $0.100 you approved",
    4200
  ),
  beat(4, "send", "Sending to fal: Muse", 4900),
];

describe("LiveBeats", () => {
  it("sets the current beat large with the earlier ones receding above it", () => {
    const html = renderToStaticMarkup(<LiveBeats beats={BEATS} depth={2} />);
    expect(html).toContain("Sending to fal: Muse");
    expect(html).toContain("Reading the Prompt");
    expect(html).not.toContain(">Starting<");
    expect(html).toContain("4.2 s");
    expect(html.match(/board-beat-past/gu)).toHaveLength(2);
    // The current line is the one announced to assistive technology.
    expect(html).toMatch(
      /<output[^>]*board-beat-current[^>]*>Sending to fal: Muse<\/output>/u
    );
    // One segment of the rail for each beat so far, the last the current one.
    expect(html.match(/<span class="(?:is-current)?"><\/span>/gu)).toHaveLength(
      4
    );
    expect(html).toContain('class="is-current"');
  });

  it("draws nothing before the first beat", () => {
    expect(renderToStaticMarkup(<LiveBeats beats={[]} />)).toBe("");
  });
});

describe("ProcessLog", () => {
  it("lists every beat in order with its time and a quiet label, marking the current one", () => {
    const html = renderToStaticMarkup(
      <ProcessLog process={processOf(BEATS, "running")} />
    );
    expect(html.indexOf("Starting")).toBeLessThan(
      html.indexOf("Sending to fal: Muse")
    );
    expect(html).toContain("Reading");
    expect(html).toContain("Price");
    expect(html.match(/board-beat-dot/gu)).toHaveLength(1);
    expect(html).not.toContain("aria-expanded");
  });

  it("folds a finished node into one line", () => {
    const done = [...BEATS, beat(5, "done", "Finished", 12_000)];
    const html = renderToStaticMarkup(
      <ProcessLog process={processOf(done, "completed")} />
    );
    expect(html).toContain("3 steps · 12 s");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Sending to fal: Muse");
  });

  it("draws nothing without beats", () => {
    expect(
      renderToStaticMarkup(<ProcessLog process={processOf([], "running")} />)
    ).toBe("");
  });
});
