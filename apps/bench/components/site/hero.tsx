"use client";

import { Fragment, useEffect, useState, useSyncExternalStore } from "react";

import { Plate } from "@/components/site/plate";
import { HERO_STEPS, SITE } from "@/lib/site/content";

/** How long a step holds before the sequence moves on. Long enough to read the
 * command and look at the picture; the rule under the command shows how much
 * of it is left. */
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

/** The command the selected step runs, with the dwell timer drawn under it.
 *
 * The boards set this directly beneath the step it belongs to, so the two read
 * as one thing. The list below it moves down while a step is selected, which
 * is what the boards draw. */
function StepCommand({
  command,
  running,
  stepId,
}: {
  readonly command: string;
  readonly running: boolean;
  readonly stepId: string;
}) {
  return (
    <div className="hidden md:block">
      <code
        className="type-mono block max-w-[380px] whitespace-pre-wrap"
        style={{ color: "var(--muted)" }}
      >
        {command}
      </code>
      <div
        className="mt-2.5 h-px max-w-[380px]"
        style={{ background: "var(--rule)" }}
      >
        <div
          className="h-px"
          key={running ? stepId : "still"}
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
  );
}

/** The shelf, and the six commands run against it.
 *
 * The sequence advances on its own so the range is visible without asking for
 * a click, and stops for good the moment anyone touches it: a carousel that
 * keeps moving under the reader's hand is worse than one that never moved.
 * Where the reader has asked for less motion it never starts.
 *
 * Two layouts, from the two boards. At desktop the steps run down a column
 * with the command set under the selected one. On a phone the same six become
 * a row of one-word labels above the picture, and the command moves into a
 * block below it; the install line rides here too, because the phone board
 * has no masthead. */
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

  function choose(next: number) {
    setStopped(true);
    setIndex(next);
  }

  return (
    <section className="site-gutter site-bleed flex flex-col pt-11 md:flex-row md:items-start md:gap-12">
      <div className="flex flex-col pt-1 md:w-[400px] md:shrink-0">
        <h1 className="type-display">{SITE.name}</h1>
        <p className="type-body max-w-[380px] pt-7">{SITE.standfirst}</p>
        <code
          className="site-install type-mono pt-4 md:hidden"
          style={{ color: "var(--faint)" }}
        >
          {SITE.install}
        </code>

        <div
          aria-label="What Motif did to this shelf"
          className="flex gap-5 pt-9 md:flex-col md:gap-3.5 md:pt-11"
          role="tablist"
        >
          {HERO_STEPS.map((item, position) => (
            <Fragment key={item.id}>
              <button
                aria-controls="hero-plate"
                aria-selected={position === index}
                className="site-tab site-step type-body shrink-0 md:self-start"
                onClick={() => {
                  choose(position);
                }}
                role="tab"
                type="button"
              >
                <span className="md:hidden">{item.short}</span>
                <span className="hidden md:inline">{item.label}</span>
              </button>
              {position === index ? (
                <StepCommand
                  command={item.command}
                  running={running}
                  stepId={item.id}
                />
              ) : null}
            </Fragment>
          ))}
        </div>
      </div>

      <div
        className="flex flex-col gap-3 pt-6 md:min-w-0 md:flex-1 md:gap-3.5 md:pt-35"
        id="hero-plate"
      >
        <div className="relative">
          {step.video === undefined ? (
            <Plate
              eager={index === 0}
              fadeKey={step.id}
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

        {/* On a phone the command sits in a block under the picture, where the
            390 board puts it. */}
        <code
          className="site-command type-mono block whitespace-pre-wrap md:hidden"
          style={{ color: "var(--ink)" }}
        >
          {step.command}
        </code>

        <p className="type-small" style={{ color: "var(--muted)" }}>
          {step.caption}
        </p>
      </div>
    </section>
  );
}
