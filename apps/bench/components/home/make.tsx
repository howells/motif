import Image from "next/image";

import { ChapterSection, Headline, Text } from "@/components/home/chapter";
import { CommandLink } from "@/components/home/command";
import { Figure, Responsive } from "@/components/home/figure";
import { Film } from "@/components/home/film";
import { Cell, Grid } from "@/components/home/grid";
import { Plate } from "@/components/home/plate";
import { MAKE } from "@/lib/site/home/make";
import type { Entry, Figure as FigureContent } from "@/lib/site/home/types";

/** The Make chapter, laid out entry by entry as the desktop (1440) and phone
 * (390) artboards draw it. Spans count the 12 desktop and 4 phone columns. */

function entry(id: string): Entry {
  const found = MAKE.entries.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`The Make chapter has no entry "${id}"`);
  }
  return found;
}

function figure(item: Entry, index: number): FigureContent {
  const found = item.figures[index];
  if (found === undefined) {
    throw new Error(`Make entry "${item.id}" has no figure ${String(index)}`);
  }
  return found;
}

/** The `sizes` attribute for a picture `desk` and `phone` viewport widths
 * wide, in percent. */
function sizes(desk: number, phone: number): string {
  return `(width >= 64rem) ${String(desk)}vw, ${String(phone)}vw`;
}

/** The entry's command, with the phone's shorter line where it has one. */
function EntryCommand({ item }: { readonly item: Entry }) {
  const phone = item.phone?.command;
  if (phone === undefined) {
    return <CommandLink command={item.command} />;
  }
  return (
    <>
      <span className="hidden lg:inline">
        <CommandLink command={item.command} />
      </span>
      <span className="lg:hidden">
        <CommandLink command={phone} />
      </span>
    </>
  );
}

function Body({ item }: { readonly item: Entry }) {
  return (
    <Text>
      <Responsive desk={item.body} phone={item.phone?.body} />
    </Text>
  );
}

/** Headline, body and command stacked in one column, as beside a picture. */
function Stack({ item }: { readonly item: Entry }) {
  return (
    <div className="flex flex-col gap-2">
      <Headline>{item.headline}</Headline>
      <Body item={item} />
      <div className="pt-2">
        <EntryCommand item={item} />
      </div>
    </div>
  );
}

/** Headline across six columns and the body and command across the next
 * four, under a row of pictures. The phone stacks them. */
function Spread({ item }: { readonly item: Entry }) {
  return (
    <Grid className="gap-y-2">
      <Cell desk={{ span: 6, start: 1 }}>
        <Headline>{item.headline}</Headline>
      </Cell>
      <Cell
        className="flex flex-col gap-4 lg:pt-2"
        desk={{ span: 4, start: 7 }}
      >
        <Body item={item} />
        <div>
          <EntryCommand item={item} />
        </div>
      </Cell>
    </Grid>
  );
}

/** Three pictures of different heights on one bottom line; the phone gives
 * the first the full width and pairs the other two. */
function FromASentence() {
  const item = entry("from-a-sentence");
  return (
    <article className="flex flex-col gap-4 lg:gap-6" id={item.id}>
      <Grid className="items-end gap-y-4">
        <Figure
          crop={{ phoneRatio: "350 / 352", ratio: "536 / 536" }}
          desk={{ span: 5, start: 1 }}
          figure={figure(item, 0)}
          sizes={sizes(38, 90)}
        />
        <Figure
          crop={{ phoneRatio: "168 / 208", ratio: "312 / 416" }}
          desk={{ span: 3, start: 6 }}
          figure={figure(item, 1)}
          phone={{ span: 2, start: 1 }}
          sizes={sizes(22, 43)}
        />
        <Figure
          crop={{ phoneRatio: "168 / 208", ratio: "424 / 528" }}
          desk={{ span: 4, start: 9 }}
          figure={figure(item, 2)}
          phone={{ span: 2, start: 3 }}
          sizes={sizes(30, 43)}
        />
      </Grid>
      <Spread item={item} />
    </article>
  );
}

/** The still life on the left; on the right the words at its top and the
 * four References at its foot, with the command hanging below the image
 * line like a caption. The phone runs picture, References, words. */
function FromYourPhotos() {
  const item = entry("from-your-photos");
  const references = [1, 2, 3, 4].map((index) => figure(item, index));
  return (
    <article id={item.id}>
      <Grid className="gap-y-4">
        <Cell className="lg:pb-8" desk={{ span: 6, start: 1 }}>
          <Plate
            crop={{ phoneRatio: "350 / 440", ratio: "648 / 816" }}
            image={figure(item, 0).image}
            sizes={sizes(45, 90)}
          />
        </Cell>
        <Cell
          className="flex h-full flex-col gap-4 lg:gap-2"
          desk={{ span: 6, start: 7 }}
        >
          <div className="flex flex-col gap-2 lg:mb-auto">
            <Headline>{item.headline}</Headline>
            <div className="lg:w-[calc((100%+var(--home-gutter))*2/3-var(--home-gutter))]">
              <Body item={item} />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-(--home-gutter) max-lg:order-first lg:grid-cols-2">
            {references.map((reference) => (
              <Plate
                crop={{ phoneRatio: "77 / 80", ratio: "312 / 224" }}
                image={reference.image}
                key={reference.image.src}
                sizes={sizes(22, 20)}
              />
            ))}
          </div>
          <div>
            <EntryCommand item={item} />
          </div>
        </Cell>
      </Grid>
    </article>
  );
}

/** The words beside three captioned pictures, ending on the pictures'
 * bottom line. The phone pairs the first two, sets the third under the
 * second, then the words. */
function Variations() {
  const item = entry("variations");
  return (
    <article id={item.id}>
      <Grid row>
        <Cell desk={{ span: 3, start: 1 }}>
          <Stack item={item} />
        </Cell>
        <Figure
          className="max-lg:order-first max-lg:mb-6"
          crop={{ phoneRatio: "168 / 208", ratio: "200 / 256" }}
          desk={{ span: 2, start: 5 }}
          figure={figure(item, 0)}
          phone={{ span: 2, start: 1 }}
          sizes={sizes(14, 43)}
        />
        <Figure
          className="max-lg:order-first max-lg:mb-6"
          crop={{ phoneRatio: "168 / 208", ratio: "312 / 416" }}
          desk={{ span: 3, start: 7 }}
          figure={figure(item, 1)}
          phone={{ span: 2, start: 3 }}
          sizes={sizes(22, 43)}
        />
        <Figure
          className="max-lg:order-first max-lg:mb-4"
          crop={{ phoneRatio: "168 / 208", ratio: "312 / 416" }}
          desk={{ span: 3, start: 10 }}
          figure={figure(item, 2)}
          phone={{ span: 2, start: 3 }}
          sizes={sizes(22, 43)}
        />
      </Grid>
    </article>
  );
}

/** Six frames of a Series Run in a row; the phone shows four of them, two
 * by two. */
function MatchingSet() {
  const item = entry("matching-set");
  /** The frames the phone keeps, in its two by two order. */
  const onPhone = [0, 2, 3, 5];
  return (
    <article className="flex flex-col gap-4 lg:gap-6" id={item.id}>
      <Grid className="gap-y-4">
        {item.figures.map((frame, index) => (
          <Figure
            className={onPhone.includes(index) ? "" : "max-lg:hidden"}
            crop={{ phoneRatio: "168 / 208", ratio: "200 / 256" }}
            desk={{ span: 2, start: 1 + index * 2 }}
            figure={frame}
            key={frame.image.src}
            phone={{ span: 2, start: onPhone.indexOf(index) % 2 === 0 ? 1 : 3 }}
            sizes={sizes(14, 43)}
          />
        ))}
      </Grid>
      <Spread item={item} />
    </article>
  );
}

/** A cut-out sprig on the page itself, no plate behind it, with the words
 * level with its middle. */
function NoBackground() {
  const item = entry("no-background");
  const { image } = figure(item, 0);
  return (
    <article id={item.id}>
      <Grid className="gap-y-4 lg:grid-flow-dense lg:items-center">
        <Cell desk={{ span: 7, start: 6 }}>
          <Image
            alt={image.alt}
            className="h-auto w-full"
            height={image.height}
            sizes={sizes(53, 90)}
            src={image.src}
            width={image.width}
          />
        </Cell>
        <Cell desk={{ span: 3, start: 1 }}>
          <Stack item={item} />
        </Cell>
      </Grid>
    </article>
  );
}

/** The label set in from the left, the words beside it on its bottom line.
 * The phone indents both by one column. */
function Lettering() {
  const item = entry("lettering");
  return (
    <article id={item.id}>
      <Grid row>
        <Figure
          className="max-lg:mb-4"
          crop={{
            phoneRatio: "259 / 328",
            position: "50% 62%",
            ratio: "536 / 672",
          }}
          desk={{ span: 5, start: 3 }}
          figure={figure(item, 0)}
          phone={{ span: 3, start: 2 }}
          sizes={sizes(38, 66)}
        />
        <Cell desk={{ span: 3, start: 8 }} phone={{ span: 3, start: 2 }}>
          <Stack item={item} />
        </Cell>
      </Grid>
    </article>
  );
}

/** One travertine tile laid four times across the screen, edge to edge; two
 * by two on the phone. The first copy carries the description; the others
 * repeat it and are hidden from screen readers. */
function SeamlessTextures() {
  const item = entry("seamless-textures");
  const { image } = figure(item, 0);
  return (
    <article className="flex flex-col gap-4 lg:gap-6" id={item.id}>
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
              sizes={sizes(25, 50)}
            />
          ))}
        </Cell>
      </Grid>
      <Spread item={item} />
    </article>
  );
}

/** The words top left, the film to their right across eight columns; the
 * phone puts the film first. */
function FilmFromAStill() {
  const item = entry("film");
  const poster = figure(item, 0);
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
            sizes={sizes(61, 90)}
          />
        </Cell>
        <Cell desk={{ span: 3, start: 1 }}>
          <Stack item={item} />
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
