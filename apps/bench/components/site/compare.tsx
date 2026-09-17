"use client";

import { useState } from "react";

import { Command } from "@/components/site/chapter";
import { Plate } from "@/components/site/plate";
import { COMPARE } from "@/lib/site/content";

/** The try-on result, with the photograph that went into it held underneath.
 *
 * Only the source is holdable, so only the source gets a control: the garment
 * beside it is an input the command names, not something to press. Holding
 * works with a pointer, a finger and the keyboard (Enter or Space while the
 * button has focus), because a demonstration nobody can reach with a keyboard
 * is a demonstration half the readers are locked out of.
 *
 * `touchAction` and `WebkitTouchCallout` are load-bearing on iOS: without
 * them a long press on an image opens the system share sheet and the hold
 * never reaches this component. */
export function Compare() {
  const [held, setHeld] = useState(false);
  const shown = held ? COMPARE.source : COMPARE.result;

  return (
    <section className="site-chapter site-gutter">
      <div className="flex flex-col gap-3">
        <h2 className="type-display" id="compare">
          {COMPARE.title}
        </h2>
        <p className="type-body max-w-[62ch]" style={{ color: "var(--muted)" }}>
          {COMPARE.body}
        </p>
      </div>

      <div className="flex flex-col gap-8 pt-16 md:flex-row md:items-start md:justify-between md:gap-12">
        <div className="relative w-full max-w-[620px]">
          <Plate
            fadeKey={shown.src}
            ratio="1 / 1"
            sizes="(max-width: 767px) 100vw, 620px"
            source={shown}
          />

          <div className="absolute bottom-4 left-4 flex gap-2.5">
            <button
              aria-label="Hold to see the source photograph"
              aria-pressed={held}
              className="block cursor-pointer border-2 p-0"
              onBlur={() => {
                setHeld(false);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setHeld(true);
                }
              }}
              onKeyUp={() => {
                setHeld(false);
              }}
              onPointerCancel={() => {
                setHeld(false);
              }}
              onPointerDown={() => {
                setHeld(true);
              }}
              onPointerLeave={() => {
                setHeld(false);
              }}
              onPointerUp={() => {
                setHeld(false);
              }}
              style={{
                borderColor: held ? "var(--accent)" : "var(--ground)",
                touchAction: "none",
                WebkitTouchCallout: "none",
              }}
              type="button"
            >
              <Plate
                className="w-[92px] md:w-28"
                ratio="1 / 1"
                sizes="112px"
                source={COMPARE.source}
              />
            </button>

            {/* The same 2px frame the button carries, so the two thumbs are
                the same size; only the interactive one ever colours it. */}
            <div className="border-2" style={{ borderColor: "var(--ground)" }}>
              <Plate
                className="w-[92px] md:w-28"
                ratio="1 / 1"
                sizes="112px"
                source={COMPARE.garment}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:w-[320px] md:shrink-0">
          <p className="type-small" style={{ color: "var(--muted)" }}>
            {held
              ? "The source, while you hold."
              : "The result. The small pictures are what went in."}
          </p>
          <Command>{COMPARE.command}</Command>
        </div>
      </div>
    </section>
  );
}
