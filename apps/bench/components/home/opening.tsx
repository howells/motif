"use client";

import { useState } from "react";

import { Plate } from "@/components/site/plate";
import { HERO_STEPS, HOME, SITE } from "@/lib/site/content";

/** The wordmark, the line under it, six edits and the picture each makes.
 *
 * One column on a phone: wordmark, picture, a row of edits, the command. From
 * 768px the edits and the command drop to the foot of the left column, level
 * with the foot of the picture: 4:5 on a phone, 4:3 from 768px, so the
 * landscape plates are never enlarged and the edits stay on the first screen. Choosing an edit swaps the picture and
 * the command; nothing else moves, because every command is mounted in the
 * same grid cell and the tallest sets the height. */
export function HomeOpening() {
  const [index, setIndex] = useState(0);
  const step = HERO_STEPS[index] ?? HERO_STEPS[0];

  return (
    <section
      aria-labelledby="home-title"
      className="home-gutter grid grid-cols-[minmax(0,1fr)] md:grid-cols-[456px_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:gap-x-12 md:pt-12"
    >
      <div className="flex flex-col gap-3 pt-12 pb-8 md:gap-6 md:p-0">
        <h1 className="type-wordmark" id="home-title">
          {SITE.name}
        </h1>
        <p className="type-body">{HOME.line}</p>
      </div>

      <div className="relative -mx-4 md:col-start-2 md:row-span-2 md:row-start-1 md:mx-0">
        {step.video === undefined ? (
          <Plate
            className="home-hero-plate"
            eager={index === 0}
            fadeKey={step.id}
            sizes="(max-width: 767px) 100vw, 840px"
            source={step.plate}
          />
        ) : (
          <div className="site-plate site-fade home-hero-plate">
            {/* Mounted only while its own step is showing, so `autoPlay`
                starts it and unmounting stops it. */}
            <video
              aria-label={step.plate.alt}
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
          <p className="site-answer type-heading">{step.answer}</p>
        )}
      </div>

      <div className="flex flex-col md:col-start-1 md:row-start-2 md:justify-end md:gap-6">
        <fieldset className="home-strip m-0 -mx-4 flex min-w-0 gap-6 border-0 px-4 pt-2 pb-0 md:mx-0 md:flex-col md:gap-0 md:p-0">
          <legend className="sr-only">What Motif can do to this picture</legend>
          {HERO_STEPS.map((item, position) => (
            <button
              aria-pressed={position === index}
              className="type-body text-muted aria-pressed:text-ink hover:text-ink min-h-control shrink-0 cursor-pointer text-start whitespace-nowrap"
              key={item.id}
              onClick={() => {
                setIndex(position);
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </fieldset>
        <div className="home-dock">
          {HERO_STEPS.map((item) => (
            <code
              aria-hidden={item.id === step.id ? undefined : true}
              className="type-small text-ink font-mono whitespace-pre-wrap"
              data-active={item.id === step.id ? "" : undefined}
              key={item.id}
            >
              {item.command}
            </code>
          ))}
        </div>
      </div>
    </section>
  );
}
