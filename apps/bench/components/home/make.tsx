import Image from "next/image";

import {
  ChapterSection,
  EntryBody,
  EntryCommand,
  EntryHeadline,
  WideWords,
  Words,
} from "@/components/home/chapter";
import { Figure } from "@/components/home/figure";
import { Film } from "@/components/home/film";
import { Cell, Grid } from "@/components/home/grid";
import { imageSizes } from "@/components/home/image-sizes";
import { Plate } from "@/components/home/plate";
import { entryWithId, figureAt } from "@/lib/site/home/lookup";
import { MAKE } from "@/lib/site/home/make";

/** The Make chapter, laid out entry by entry as the desktop (1440) and phone
 * (390) artboards draw it. Spans count the 12 desktop and 4 phone columns. */

/** Three pictures of different heights on one bottom line; the phone gives
 * the first the full width and pairs the other two. */
function FromASentence() {
  const item = entryWithId(MAKE, "from-a-sentence");
  return (
    <article className="flex flex-col gap-(--home-text-gap)" id={item.id}>
      <Grid className="items-end gap-y-4">
        <Figure
          crop={{ phoneRatio: "350 / 352", ratio: "536 / 536" }}
          desk={{ span: 5, start: 1 }}
          figure={figureAt(item, 0)}
          sizes={imageSizes(38, 90)}
        />
        <Figure
          crop={{ phoneRatio: "168 / 208", ratio: "312 / 416" }}
          desk={{ span: 3, start: 6 }}
          figure={figureAt(item, 1)}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(22, 43)}
        />
        <Figure
          crop={{ phoneRatio: "168 / 208", ratio: "424 / 528" }}
          desk={{ span: 4, start: 9 }}
          figure={figureAt(item, 2)}
          phone={{ span: 2, start: 3 }}
          sizes={imageSizes(30, 43)}
        />
      </Grid>
      <WideWords entry={item} />
    </article>
  );
}

/** The still life on the left; on the right the words at its top and the
 * four References at its foot, with the command hanging below the image
 * line like a caption. The phone runs picture, References, words. */
function FromYourPhotos() {
  const item = entryWithId(MAKE, "from-your-photos");
  const references = [1, 2, 3, 4].map((index) => figureAt(item, index));
  return (
    <article id={item.id}>
      <Grid className="gap-y-4">
        <Cell className="lg:pb-8" desk={{ span: 6, start: 1 }}>
          <Plate
            crop={{ phoneRatio: "350 / 440", ratio: "648 / 816" }}
            image={figureAt(item, 0).image}
            sizes={imageSizes(45, 90)}
          />
        </Cell>
        <Cell
          className="flex h-full flex-col gap-4 lg:gap-2"
          desk={{ span: 6, start: 7 }}
        >
          <div className="flex flex-col gap-2 lg:mb-auto">
            <EntryHeadline entry={item} />
            <div className="lg:w-[calc((100%+var(--home-gutter))*2/3-var(--home-gutter))]">
              <EntryBody entry={item} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-(--home-gutter) max-lg:order-first lg:grid-cols-2">
            {references.map((reference) => (
              <Plate
                crop={{ phoneRatio: "77 / 80", ratio: "312 / 224" }}
                image={reference.image}
                key={reference.image.src}
                sizes={imageSizes(22, 20)}
              />
            ))}
          </div>
          <div>
            <EntryCommand entry={item} />
          </div>
        </Cell>
      </Grid>
    </article>
  );
}

/** The words beside three captioned pictures, the command level with the
 * captions. The phone pairs the first two, sets the third under the second,
 * then the words. */
function Variations() {
  const item = entryWithId(MAKE, "variations");
  return (
    <article id={item.id}>
      <Grid row>
        <Cell className="home-foot" desk={{ span: 3, start: 1 }}>
          <Words entry={item} />
        </Cell>
        <Figure
          className="max-lg:order-first max-lg:mb-6"
          crop={{ phoneRatio: "168 / 208", ratio: "200 / 256" }}
          desk={{ span: 2, start: 5 }}
          figure={figureAt(item, 0)}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(14, 43)}
        />
        <Figure
          className="max-lg:order-first max-lg:mb-6"
          crop={{ phoneRatio: "168 / 208", ratio: "312 / 416" }}
          desk={{ span: 3, start: 7 }}
          figure={figureAt(item, 1)}
          phone={{ span: 2, start: 3 }}
          sizes={imageSizes(22, 43)}
        />
        <Figure
          className="max-lg:order-first max-lg:mb-4"
          crop={{ phoneRatio: "168 / 208", ratio: "312 / 416" }}
          desk={{ span: 3, start: 10 }}
          figure={figureAt(item, 2)}
          phone={{ span: 2, start: 3 }}
          sizes={imageSizes(22, 43)}
        />
      </Grid>
    </article>
  );
}

/** Six frames of a Series Run in a row; the phone shows four of them, two
 * by two. */
function MatchingSet() {
  const item = entryWithId(MAKE, "matching-set");
  /** The frames the phone keeps, in its two by two order. */
  const onPhone = [0, 2, 3, 5];
  return (
    <article className="flex flex-col gap-(--home-text-gap)" id={item.id}>
      <Grid className="gap-y-4">
        {item.figures.map((frame, index) => (
          <Figure
            className={onPhone.includes(index) ? "" : "max-lg:hidden"}
            crop={{ phoneRatio: "168 / 208", ratio: "200 / 256" }}
            desk={{ span: 2, start: 1 + index * 2 }}
            figure={frame}
            key={frame.image.src}
            phone={{ span: 2, start: onPhone.indexOf(index) % 2 === 0 ? 1 : 3 }}
            sizes={imageSizes(14, 43)}
          />
        ))}
      </Grid>
      <WideWords entry={item} />
    </article>
  );
}

/** A cut-out sprig on the page itself, no plate behind it, with the words
 * level with its middle. */
function NoBackground() {
  const item = entryWithId(MAKE, "no-background");
  const { image } = figureAt(item, 0);
  return (
    <article id={item.id}>
      <Grid className="gap-y-4 lg:grid-flow-dense lg:items-center">
        <Cell
          className="aspect-350/352 lg:aspect-square"
          desk={{ span: 7, start: 6 }}
        >
          <Image
            alt={image.alt}
            className="size-full object-contain"
            height={image.height}
            sizes={imageSizes(53, 90)}
            src={image.src}
            width={image.width}
          />
        </Cell>
        <Cell desk={{ span: 3, start: 1 }}>
          <Words entry={item} />
        </Cell>
      </Grid>
    </article>
  );
}

/** The label set in from the left, the words beside it on its bottom line.
 * The phone indents both by one column. */
function Lettering() {
  const item = entryWithId(MAKE, "lettering");
  return (
    <article id={item.id}>
      <Grid row>
        <Figure
          className="max-lg:mb-4"
          crop={{ phoneRatio: "259 / 328", ratio: "536 / 672" }}
          desk={{ span: 5, start: 3 }}
          figure={figureAt(item, 0)}
          phone={{ span: 3, start: 2 }}
          sizes={imageSizes(38, 66)}
        />
        <Cell desk={{ span: 3, start: 8 }} phone={{ span: 3, start: 2 }}>
          <Words entry={item} />
        </Cell>
      </Grid>
    </article>
  );
}

/** One travertine tile laid four times across the screen, edge to edge; two
 * by two on the phone. The first copy carries the description; the others
 * repeat it and are hidden from screen readers. */
function SeamlessTextures() {
  const item = entryWithId(MAKE, "seamless-textures");
  const { image } = figureAt(item, 0);
  return (
    <article className="flex flex-col gap-(--home-text-gap)" id={item.id}>
      <Grid>
        <Cell
          className="grid grid-cols-2 lg:grid-cols-4"
          desk="bleed"
          phone="bleed"
        >
          {[0, 1, 2, 3].map((copy) => (
            <Plate
              crop={{ phoneRatio: "195 / 196", ratio: "1 / 1" }}
              image={copy === 0 ? image : { ...image, alt: "" }}
              key={copy}
              sizes={imageSizes(25, 50)}
            />
          ))}
        </Cell>
      </Grid>
      <WideWords entry={item} />
    </article>
  );
}

/** The words top left, the film to their right across eight columns; the
 * phone puts the film first. */
function FilmFromAStill() {
  const item = entryWithId(MAKE, "film");
  const poster = figureAt(item, 0);
  const { film } = poster;
  if (film === undefined) {
    throw new Error('Make entry "film" has no film');
  }
  return (
    <article id={item.id}>
      <Grid className="gap-y-4 lg:grid-flow-dense lg:items-start">
        <Cell desk={{ span: 8, start: 5 }}>
          <Film
            crop={{ phoneRatio: "350 / 440", ratio: "872 / 616" }}
            figure={{ ...poster, film }}
            sizes={imageSizes(61, 90)}
          />
        </Cell>
        <Cell desk={{ span: 3, start: 1 }}>
          <Words entry={item} />
        </Cell>
      </Grid>
    </article>
  );
}

export function Make() {
  return (
    <ChapterSection chapter={MAKE}>
      <FromASentence />
      <FromYourPhotos />
      <Variations />
      <MatchingSet />
      <NoBackground />
      <Lettering />
      <SeamlessTextures />
      <FilmFromAStill />
    </ChapterSection>
  );
}
