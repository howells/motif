"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Plate } from "@/components/site/plate";
import { HERO_STEPS, SITE } from "@/lib/site/content";

/** How long a step holds before the sequence moves on. Long enough to read the
 * command and look at the picture; the progress rule under the command shows
 * how much of it is left. */
const DWELL_MS = 7000;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = globalThis.matchMedia?.(REDUCED_MOTION);
  query?.addEventListener("change", onChange);
  return () => {
    query?.removeEventListener("change", onChange);
  };
}

/** Read as a store rather than in an effect, so the answer arrives with the
 * first client render and changes as soon as the reader changes the setting. */
function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia?.(REDUCED_MOTION).matches ?? false,
    () => false
  );
}

/* On a phone the steps are a scrolling row, so the one the sequence has
   reached has to be brought into view or it advances out of sight. Only the
   row scrolls: `scrollIntoView` would also scroll the page, dragging a reader
   halfway down back up to the hero every seven seconds. Attached as a ref, so
   it runs exactly when the selected step changes. Down the desktop column the
   row does not scroll and this moves nothing. */
function centreStep(node: HTMLButtonElement | null) {
  const row = node?.parentElement;
  if (!node || !row) {
    return;
  }
  const offset =
    node.getBoundingClientRect().left - row.getBoundingClientRect().left;
  row.scrollTo({
    left: row.scrollLeft + offset - (row.clientWidth - node.offsetWidth) / 2,
  });
}

function StepList({
  index,
  onChoose,
}: {
  readonly index: number;
  readonly onChoose: (next: number) => void;
}) {
  return (
    /* At desktop the steps read as a list down the column; on a phone the same
       six become a scrolling row above the picture. One set of labels, one
       state model, two shapes. */
    <div
      aria-label="What Motif did to this shelf"
      className="-mx-5 mt-9 flex gap-6 overflow-x-auto px-5 md:mx-0 md:mt-11 md:flex-col md:gap-3.5 md:overflow-visible md:px-0"
      role="tablist"
    >
      {HERO_STEPS.map((item, position) => (
        <button
          aria-controls="hero-plate"
          aria-selected={position === index}
          className="site-tab type-body shrink-0 whitespace-nowrap md:self-start md:whitespace-normal"
          key={item.id}
          onClick={() => {
            onChoose(position);
          }}
          ref={position === index ? centreStep : null}
          role="tab"
          /* Three states rather than two: what has already run sits a rung
             above what has not, so the list reads as a sequence. */
          style={position < index ? { color: "var(--muted)" } : undefined}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

/** The shelf, and the six commands run against it.
 *
 * The sequence advances on its own so the range is visible without asking for
 * a click, and stops for good the moment anyone touches it: a carousel that
 * keeps moving under the reader's hand is worse than one that never moved.
 * Where the reader has asked for less motion it never starts. */
export function Hero() {
  const still = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const running = !still && !stopped;
  const step = HERO_STEPS[index] ?? HERO_STEPS[0];

  /* One interval rather than a timeout re-armed per step: the sequence stops
     for good on the first interaction, so it never needs restarting. */
  useEffect(() => {
    if (!running) {
      return () => {
        /* Nothing was scheduled, so there is nothing to clear. */
      };
    }
    const ticker = setInterval(() => {
      setIndex((current) => (current + 1) % HERO_STEPS.length);
    }, DWELL_MS);
    return () => {
      clearInterval(ticker);
    };
  }, [running]);

  return (
    <section className="site-gutter flex flex-col gap-10 pt-10 md:flex-row md:gap-12 md:pt-11">
      <div className="flex flex-col md:w-[400px] md:shrink-0">
        <h1 className="type-display">{SITE.name}</h1>
        <p className="type-body max-w-[42ch] pt-7">{SITE.standfirst}</p>

        <StepList
          index={index}
          onChoose={(next) => {
            setStopped(true);
            setIndex(next);
          }}
        />

        {/* The command sits in a slot of its own below the list, so choosing a
            different step never moves the steps. */}
        <div className="pt-5 md:min-h-[86px]">
          <code
            className="type-mono block max-w-[380px] whitespace-pre-wrap"
            style={{ color: "var(--muted)" }}
          >
            {step.command}
          </code>
          <div
            className="mt-2.5 h-px max-w-[380px]"
            style={{ background: "var(--rule)" }}
          >
            <div
              className="h-px"
              key={running ? step.id : "still"}
              style={{
                animation: running
                  ? `hero-progress ${DWELL_MS}ms linear`
                  : undefined,
                background: "var(--accent)",
                width: running ? 0 : "40%",
              }}
            />
          </div>
        </div>
      </div>

      <div
        className="flex flex-col gap-3.5 md:min-w-0 md:flex-1 md:pt-35"
        id="hero-plate"
      >
        <div className="relative">
          {step.video === undefined ? (
            <Plate
              fadeKey={step.id}
              eager={index === 0}
              ratio="1000 / 530"
              sizes="(max-width: 767px) 100vw, 1000px"
              source={step.plate}
            />
          ) : (
            <div
              className="site-plate site-fade"
              style={{ aspectRatio: "1000 / 530" }}
            >
              {/* Mounted only while its own step is showing, so `autoPlay`
                  starts it and unmounting stops it. */}
              <video
                autoPlay
                loop
                muted
                playsInline
                poster={step.plate.src}
                src={step.video}
              />
            </div>
          )}
          {step.answer === undefined ? null : (
            <p className="site-answer">{step.answer}</p>
          )}
        </div>
        <p className="type-small" style={{ color: "var(--muted)" }}>
          {step.caption}
        </p>
      </div>
    </section>
  );
}
