import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { processOf } from "../../../lib/app/boards/process";
import type { Beat, RunEventKind } from "../../../lib/app/boards/run-events";
import { RECEDE } from "../../../lib/app/boards/veil";
import { LiveBeats, ProcessLog } from "./process";

const T0 = Date.parse("2026-11-01T10:00:00.000Z");

const beat = (
  seq: number,
  kind: RunEventKind,
  text: string,
  at: number,
  data: Beat["data"] = null
): Beat => ({
  at: new Date(T0 + at).toISOString(),
  data,
  kind,
  nodeId: "nod_x",
  seq,
  text,
});

const BEATS = [
  beat(1, "begin", "Starting", 0),
  beat(2, "read", "Reading the Prompt", 400),
  beat(3, "price", "Price checked again: $0.080", 4200),
  beat(4, "send", "Sending to fal: Muse", 4900),
];

const USUALLY = beat(5, "make", "Muse usually takes about 50 s", 5000, {
  typicalMs: 50_000,
});

describe("LiveBeats", () => {
  it("sets the current beat large with the earlier ones receding above it", () => {
    const html = renderToStaticMarkup(
      <LiveBeats beats={BEATS} depth={2} now={T0 + 6000} />
    );
    expect(html).toContain("Sending to fal: Muse");
    expect(html).toContain("Price checked again: $0.080");
    expect(html).not.toContain(">Starting<");
    expect(html).toContain("4.2 s");
    expect(html.match(/board-beat-past/gu)).toHaveLength(2);
    // The current line is the one announced to assistive technology.
    expect(html).toMatch(
      /<output[^>]*board-beat-current[^>]*>Sending to fal: Muse<\/output>/u
    );
  });

  it("dims earlier lines by the shares the contrast allows, nearest first", () => {
    const html = renderToStaticMarkup(
      <LiveBeats beats={BEATS} depth={3} now={T0 + 6000} />
    );
    const shares = [...html.matchAll(/opacity:([0-9.]+)/gu)].map((match) =>
      Number(match[1])
    );
    // Farthest first in the page, nearest last.
    expect(shares).toStrictEqual([...RECEDE].toReversed());
  });

  it("sets timings in tabular figures of the sans, not mono", () => {
    const html = renderToStaticMarkup(
      <LiveBeats beats={BEATS} depth={2} now={T0 + 6000} />
    );
    expect(html).toContain("tabular-nums");
    expect(html).not.toContain("board-mono");
  });

  it("only sweeps without the owner's history", () => {
    const html = renderToStaticMarkup(
      <LiveBeats beats={BEATS} now={T0 + 6000} />
    );
    expect(html).toContain("board-time-sweep");
    expect(html).not.toContain("board-time-fill");
  });

  it("fills toward the typical time with it, never full", () => {
    const share = (elapsed: number) => {
      const html = renderToStaticMarkup(
        <LiveBeats beats={[...BEATS, USUALLY]} now={T0 + 5000 + elapsed} />
      );
      return Number(/scaleX\(([0-9.]+)\)/u.exec(html)?.[1]);
    };
    expect(
      renderToStaticMarkup(<LiveBeats beats={[...BEATS, USUALLY]} now={T0} />)
    ).not.toContain("board-time-sweep");
    expect(share(0)).toBe(0);
    expect(share(25_000)).toBeGreaterThan(0.5);
    expect(share(50_000)).toBeGreaterThan(share(25_000));
    expect(share(900_000)).toBeLessThan(1);
  });

  it("draws nothing before the first beat", () => {
    expect(renderToStaticMarkup(<LiveBeats beats={[]} now={T0} />)).toBe("");
  });
});

describe("ProcessLog", () => {
  it("lists every beat in order with its time and a quiet label, marking the current one", () => {
    const html = renderToStaticMarkup(
      <ProcessLog now={T0 + 6000} process={processOf(BEATS, "running")} />
    );
    expect(html.indexOf("Starting")).toBeLessThan(
      html.indexOf("Sending to fal: Muse")
    );
    expect(html).toContain("Reading");
    expect(html).toContain("Price");
    expect(html.match(/board-beat-dot/gu)).toHaveLength(1);
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("board-mono");
  });

  it("runs its clock with the run, not with the last beat", () => {
    // Every beat came inside 5 s; the panel is read 49 s in.
    const html = renderToStaticMarkup(
      <ProcessLog now={T0 + 49_000} process={processOf(BEATS, "running")} />
    );
    expect(html).toMatch(/<span class="tabular-nums">49 s<\/span>/u);
  });

  it("folds a finished node into one line", () => {
    const done = [...BEATS, beat(5, "done", "Finished", 12_000)];
    const html = renderToStaticMarkup(
      <ProcessLog now={T0 + 99_000} process={processOf(done, "completed")} />
    );
    expect(html).toContain("3 steps · 12 s");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Sending to fal: Muse");
  });

  it("draws nothing without beats", () => {
    expect(
      renderToStaticMarkup(
        <ProcessLog now={T0} process={processOf([], "running")} />
      )
    ).toBe("");
  });
});
