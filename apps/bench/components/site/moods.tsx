"use client";

import { useState } from "react";

import { ChapterHead } from "@/components/site/chapter";
import { Plate } from "@/components/site/plate";
import { MOOD_COMMAND, MOODS } from "@/lib/site/page";

type MoodId = (typeof MOODS)[number]["id"];

/** One kitchen, one prompt, one seed, six lights.
 *
 * Holding the seed is the whole demonstration: nothing in the scene moves
 * between plates, so the only thing a reader can attribute the difference to
 * is `--mood`. The command underneath updates with the choice, so the flag
 * and its effect are never more than a glance apart. */
export function Moods() {
  const [id, setId] = useState<MoodId>(MOODS[4].id);
  const mood = MOODS.find((item) => item.id === id) ?? MOODS[0];

  return (
    <section className="site-chapter site-gutter">
      <ChapterHead
        body="One kitchen, one prompt, one seed. Only the light changes."
        id="moods"
        title="Moods"
      />

      <div className="flex flex-col pt-16">
        <Plate
          fadeKey={mood.id}
          ratio="1312 / 560"
          sizes="(max-width: 767px) 100vw, 1312px"
          source={mood.plate}
        />

        <div
          aria-label="Moods"
          className="-mx-5 flex gap-8 overflow-x-auto px-5 pt-7 md:mx-0 md:gap-10 md:px-0"
          role="tablist"
        >
          {MOODS.map((item) => (
            <button
              aria-selected={item.id === mood.id}
              className="site-tab type-body shrink-0"
              key={item.id}
              onClick={() => {
                setId(item.id);
              }}
              role="tab"
              type="button"
            >
              {item.name}
            </button>
          ))}
        </div>

        <code
          className="site-command type-mono mt-6 self-start whitespace-pre-wrap"
          style={{ color: "var(--ink)" }}
        >
          {MOOD_COMMAND.replace("{mood}", mood.id)}
        </code>
      </div>
    </section>
  );
}
