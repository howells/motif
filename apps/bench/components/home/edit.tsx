import Image from "next/image";

import { ChapterSection, Headline, Text } from "@/components/home/chapter";
import { CommandLink } from "@/components/home/command";
import { Figure } from "@/components/home/figure";
import { Cell, Grid } from "@/components/home/grid";
import type { Crop } from "@/components/home/plate";
import { Plate } from "@/components/home/plate";
import { EDIT } from "@/lib/site/home/edit";
import type { Entry, Figure as FigureContent } from "@/lib/site/home/types";

const [erase, cutout, reframe, upscale, relight, restyle, tryOn, restore] =
  EDIT.entries;

/** Headline, body and command stacked, as most entries set them. */
function Words({ entry }: { readonly entry: Entry }) {
  return (
    <div className="flex flex-col gap-2">
      <Headline>{entry.headline}</Headline>
      <Text>{entry.body}</Text>
      <div className="pt-2">
        <CommandLink command={entry.command} />
      </div>
    </div>
  );
}

/** Under a wide picture: the headline across six columns on the left, the
 * body and command in four beside it. Stacked on a phone. */
function WideWords({ entry }: { readonly entry: Entry }) {
  return (
    <Grid className="mt-(--home-text-gap) items-start gap-y-2">
      <Cell desk={{ span: 6, start: 1 }}>
        <Headline>{entry.headline}</Headline>
      </Cell>
      <Cell
        className="flex flex-col gap-4 lg:pt-2"
        desk={{ span: 4, start: 7 }}
      >
        <Text>{entry.body}</Text>
        <div>
          <CommandLink command={entry.command} />
        </div>
      </Cell>
    </Grid>
  );
}

/** One picture split down the middle, each half named beneath it. */
function Split({
  crop,
  figure,
  sides,
  sizes,
}: {
  readonly crop: Crop;
  readonly figure: FigureContent;
  readonly sides: readonly [string, string];
  readonly sizes: string;
}) {
  return (
    <figure>
      <Plate
        crop={crop}
        image={figure.image}
        phone={figure.phone?.image}
        sizes={sizes}
      />
      <figcaption className="home-text text-muted grid grid-cols-2 pt-(--home-caption-gap)">
        <span>{sides[0]}</span>
        <span>{sides[1]}</span>
      </figcaption>
    </figure>
  );
}

/** Small Before high on the left with the words under it, large After
 * lower on the right: a deliberate stagger, not a shared bottom edge. */
function Erase() {
  const [before, after] = erase.figures;
  return (
    <article id={erase.id}>
      <Grid className="home-edit-erase items-start">
        <Figure
          crop={{ phoneRatio: "168 / 96", ratio: "424 / 240" }}
          desk={{ span: 4, start: 1 }}
          figure={before}
          phone={{ span: 2, start: 1 }}
          sizes="(width >= 64rem) 30vw, 43vw"
        />
        <Cell
          className="home-edit-after mt-6 lg:mt-0"
          desk={{ span: 8, start: 5 }}
        >
          <Figure
            crop={{ phoneRatio: "350 / 200", ratio: "872 / 488" }}
            figure={after}
            sizes="(width >= 64rem) 61vw, 90vw"
          />
        </Cell>
        <Cell className="mt-4 lg:mt-16" desk={{ span: 3, start: 1 }}>
          <Words entry={erase} />
        </Cell>
      </Grid>
    </article>
  );
}

/** The photo, then the cut-out on its card, sharing a bottom edge. */
function Cutout() {
  const [photo, cut] = cutout.figures;
  return (
    <article id={cutout.id}>
      <Grid row>
        <Figure
          crop={{ phoneRatio: "77 / 168", ratio: "200 / 440" }}
          desk={{ span: 2, start: 4 }}
          figure={photo}
          phone={{ span: 1, start: 1 }}
          sizes="(width >= 64rem) 14vw, 20vw"
        />
        <Cell
          className="home-edit-backdrop"
          desk={{ span: 4, start: 6 }}
          phone={{ span: 3, start: 2 }}
        >
          <Image
            alt={cut.image.alt}
            height={cut.image.height}
            loading="lazy"
            sizes="(width >= 64rem) 21vw, 49vw"
            src={cut.image.src}
            width={cut.image.width}
          />
        </Cell>
        <Cell
          className="mt-(--home-text-gap)"
          desk={{ span: 4, start: 6 }}
          phone={{ span: 3, start: 2 }}
        >
          <Words entry={cutout} />
        </Cell>
      </Grid>
    </article>
  );
}

/** The square result with the wide original outlined on it, the words
 * beside it on their foot. */
function Reframe() {
  const [square] = reframe.figures;
  return (
    <article id={reframe.id}>
      <Grid row>
        <Cell className="home-edit-frame" desk={{ span: 7, start: 1 }}>
          <Plate
            crop={{ phoneRatio: "350 / 352", ratio: "1 / 1" }}
            image={square.image}
            sizes="(width >= 64rem) 53vw, 90vw"
          />
          <div className="home-edit-original">
            <p className="home-text">{reframe.original}</p>
          </div>
        </Cell>
        <Cell className="mt-4 lg:mt-0" desk={{ span: 3, start: 9 }}>
          <Words entry={reframe} />
        </Cell>
      </Grid>
    </article>
  );
}

/** Words top left; the small source and the large result on the right,
 * sharing a bottom edge. On a phone the words follow, indented a column. */
function Upscale() {
  const [small, large] = upscale.figures;
  return (
    <article id={upscale.id}>
      <Grid className="home-edit-shared" row>
        <Figure
          crop={{ phoneRatio: "77 / 104", ratio: "88 / 120" }}
          desk={{ span: 1, start: 7 }}
          figure={small}
          phone={{ span: 1, start: 1 }}
          sizes="(width >= 64rem) 7vw, 20vw"
        />
        <Figure
          crop={{ phoneRatio: "259 / 344", ratio: "536 / 712" }}
          desk={{ span: 5, start: 8 }}
          figure={large}
          phone={{ span: 3, start: 2 }}
          sizes="(width >= 64rem) 38vw, 67vw"
        />
        <Cell
          className="home-edit-top mt-4 lg:mt-0"
          desk={{ span: 3, start: 1 }}
          phone={{ span: 3, start: 2 }}
        >
          <Words entry={upscale} />
        </Cell>
      </Grid>
    </article>
  );
}

function Relight() {
  const [split] = relight.figures;
  return (
    <article id={relight.id}>
      <Grid>
        <Split
          crop={{ phoneRatio: "350 / 352", ratio: "1320 / 744" }}
          figure={split}
          sides={relight.sides}
          sizes="(width >= 64rem) 92vw, 90vw"
        />
      </Grid>
      <WideWords entry={relight} />
    </article>
  );
}

/** The restyled picture large, with your photo and the reference stacked
 * beside it; its foot meets the reference's. On a phone the two sit side by
 * side under it. */
/** Your photo and the reference beside the restyled picture. */
const RESTYLE_SOURCE: Crop = { phoneRatio: "168 / 96", ratio: "424 / 208" };

function Restyle() {
  const [result, photo, reference] = restyle.figures;
  return (
    <article id={restyle.id}>
      <Grid className="home-edit-restyle gap-y-6">
        <Cell className="home-edit-fill" desk={{ span: 8, start: 1 }}>
          <Plate
            crop={{ phoneRatio: "350 / 200", ratio: "872 / 472" }}
            image={result.image}
            sizes="(width >= 64rem) 61vw, 90vw"
          />
        </Cell>
        <Figure
          crop={RESTYLE_SOURCE}
          desk={{ span: 4, start: 9 }}
          figure={photo}
          phone={{ span: 2, start: 1 }}
          sizes="(width >= 64rem) 30vw, 43vw"
        />
        <Figure
          crop={RESTYLE_SOURCE}
          desk={{ span: 4, start: 9 }}
          figure={reference}
          phone={{ span: 2, start: 3 }}
          sizes="(width >= 64rem) 30vw, 43vw"
        />
      </Grid>
      <WideWords entry={restyle} />
    </article>
  );
}

/** Wearing it large on the left; the words at the top right, the person and
 * the jacket at the foot, all three pictures sharing a bottom edge. */
/** The person and the jacket under the words. */
const TRY_ON_SOURCE: Crop = { phoneRatio: "168 / 208", ratio: "312 / 392" };

function TryOn() {
  const [dressed, person, garment] = tryOn.figures;
  return (
    <article id={tryOn.id}>
      <Grid className="home-edit-shared home-edit-tryon" row>
        <Figure
          crop={{
            phoneRatio: "350 / 440",
            position: "50% 40%",
            ratio: "648 / 808",
          }}
          desk={{ span: 6, start: 1 }}
          figure={dressed}
          sizes="(width >= 64rem) 45vw, 90vw"
        />
        <Figure
          crop={{ ...TRY_ON_SOURCE, position: "50% 40%" }}
          desk={{ span: 3, start: 7 }}
          figure={person}
          phone={{ span: 2, start: 1 }}
          sizes="(width >= 64rem) 22vw, 43vw"
        />
        <Figure
          crop={TRY_ON_SOURCE}
          desk={{ span: 3, start: 10 }}
          figure={garment}
          phone={{ span: 2, start: 3 }}
          sizes="(width >= 64rem) 22vw, 43vw"
        />
        <Cell
          className="home-edit-top mt-4 lg:mt-0"
          desk={{ span: 4, start: 7 }}
        >
          <Words entry={tryOn} />
        </Cell>
      </Grid>
    </article>
  );
}

function Restore() {
  const [split] = restore.figures;
  return (
    <article id={restore.id}>
      <Grid>
        <Cell desk={{ span: 10, start: 1 }}>
          <Split
            crop={{ phoneRatio: "350 / 232", ratio: "1096 / 728" }}
            figure={split}
            sides={restore.sides}
            sizes="(width >= 64rem) 76vw, 90vw"
          />
        </Cell>
      </Grid>
      <WideWords entry={restore} />
    </article>
  );
}

/** Edit: eight ways to change a picture you already have, in the order and
 * the layouts of the Paper boards. */
export function Edit() {
  return (
    <ChapterSection chapter={EDIT}>
      <Erase />
      <Cutout />
      <Reframe />
      <Upscale />
      <Relight />
      <Restyle />
      <TryOn />
      <Restore />
    </ChapterSection>
  );
}
