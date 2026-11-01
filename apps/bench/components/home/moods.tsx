"use client";

import Image from "next/image";
import { useState } from "react";

import {
  HOME,
  HOME_MOOD_DEFAULT,
  HOME_MOOD_ORDER,
  MOODS,
} from "@/lib/site/content";

type MoodId = (typeof MOODS)[number]["id"];

const ORDERED = HOME_MOOD_ORDER.flatMap((id) => {
  const found = MOODS.find((item) => item.id === id);
  return found === undefined ? [] : [found];
});

/** One kitchen, six lights. All six pictures sit in one box and the chosen
 * one is shown, so a swap is an opacity change and never waits on a download;
 * the box has a fixed ratio so nothing below it moves. */
export function HomeMoods() {
  const [current, setCurrent] = useState<MoodId>(HOME_MOOD_DEFAULT);

  return (
    <section
      aria-labelledby="home-moods"
      className="home-gutter home-section flex flex-col gap-4 md:gap-8"
    >
      <h2 className="type-body" id="home-moods">
        {HOME.moodsTitle}
      </h2>
      <div className="site-plate -mx-4 aspect-square md:mx-0 md:aspect-[2/1]">
        {ORDERED.map((mood) => (
          <Image
            alt={mood.id === current ? mood.plate.alt : ""}
            aria-hidden={mood.id === current ? undefined : true}
            className="home-layer object-[60%_50%] md:object-[50%_55%]"
            data-active={mood.id === current ? "" : undefined}
            height={mood.plate.height}
            key={mood.id}
            sizes="(max-width: 767px) 100vw, 1344px"
            src={mood.plate.src}
            width={mood.plate.width}
          />
        ))}
      </div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between">
        <fieldset className="home-strip m-0 -mx-4 flex min-w-0 gap-6 border-0 px-4 py-0 md:mx-0 md:gap-8 md:p-0">
          <legend className="sr-only">Moods</legend>
          {ORDERED.map((mood) => (
            <button
              aria-pressed={mood.id === current}
              className="type-body text-muted aria-pressed:text-ink hover:text-ink min-h-control shrink-0 cursor-pointer"
              key={mood.id}
              onClick={() => {
                setCurrent(mood.id);
              }}
              type="button"
            >
              {mood.name}
            </button>
          ))}
        </fieldset>
        <code className="type-small text-ink min-h-control flex items-center font-mono">
          {`--mood ${current}`}
        </code>
      </div>
    </section>
  );
}
