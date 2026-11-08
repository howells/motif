import "./edit.css";
import Image from "next/image";

import { ChapterSection, WideWords, Words } from "@/components/home/chapter";
import { Figure } from "@/components/home/figure";
import { Cell, Grid } from "@/components/home/grid";
import { imageSizes } from "@/components/home/image-sizes";
import type { Crop } from "@/components/home/plate";
import { Plate } from "@/components/home/plate";
import { EDIT } from "@/lib/site/home/edit";
import { entryWithId, figureAt } from "@/lib/site/home/lookup";
import type { Figure as FigureContent } from "@/lib/site/home/types";

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
  const erase = entryWithId(EDIT, "remove-an-object");
  return (
    <article id={erase.id}>
      <Grid className="home-edit-erase items-start">
        <Figure
          crop={{ phoneRatio: "168 / 96", ratio: "424 / 240" }}
          desk={{ span: 4, start: 1 }}
          figure={figureAt(erase, 0)}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(30, 43)}
        />
        <Cell
          className="home-edit-after mt-6 lg:mt-0"
          desk={{ span: 8, start: 5 }}
        >
          <Figure
            crop={{ phoneRatio: "350 / 200", ratio: "872 / 488" }}
            figure={figureAt(erase, 1)}
            sizes={imageSizes(61, 90)}
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
  const cutout = entryWithId(EDIT, "remove-the-background");
  const cut = figureAt(cutout, 1);
  return (
    <article id={cutout.id}>
      <Grid row>
        <Figure
          crop={{ phoneRatio: "77 / 168", ratio: "200 / 440" }}
          desk={{ span: 2, start: 4 }}
          figure={figureAt(cutout, 0)}
          phone={{ span: 1, start: 1 }}
          sizes={imageSizes(14, 20)}
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
            sizes={imageSizes(21, 49)}
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
  const reframe = entryWithId(EDIT, "extend-the-frame");
  return (
    <article id={reframe.id}>
      <Grid row>
        <Cell className="home-edit-frame" desk={{ span: 7, start: 1 }}>
          <Plate
            crop={{ phoneRatio: "350 / 352", ratio: "1 / 1" }}
            image={figureAt(reframe, 0).image}
            sizes={imageSizes(53, 90)}
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
  const upscale = entryWithId(EDIT, "upscale");
  return (
    <article id={upscale.id}>
      <Grid className="home-edit-shared" row>
        <Figure
          crop={{ phoneRatio: "77 / 104", ratio: "88 / 120" }}
          desk={{ span: 1, start: 7 }}
          figure={figureAt(upscale, 0)}
          phone={{ span: 1, start: 1 }}
          sizes={imageSizes(7, 20)}
        />
        <Figure
          crop={{ phoneRatio: "259 / 344", ratio: "536 / 712" }}
          desk={{ span: 5, start: 8 }}
          figure={figureAt(upscale, 1)}
          phone={{ span: 3, start: 2 }}
          sizes={imageSizes(38, 67)}
        />
        <Cell
          className="home-hang mt-4 lg:mt-0"
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
  const relight = entryWithId(EDIT, "relight");
  return (
    <article className="flex flex-col gap-(--home-text-gap)" id={relight.id}>
      <Grid>
        <Split
          crop={{ phoneRatio: "350 / 352", ratio: "1320 / 744" }}
          figure={figureAt(relight, 0)}
          sides={relight.sides}
          sizes={imageSizes(92, 90)}
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
  const restyle = entryWithId(EDIT, "match-the-style");
  return (
    <article className="flex flex-col gap-(--home-text-gap)" id={restyle.id}>
      <Grid className="home-edit-restyle gap-y-6">
        <Cell className="home-edit-fill" desk={{ span: 8, start: 1 }}>
          <Plate
            crop={{ phoneRatio: "350 / 200", ratio: "872 / 472" }}
            image={figureAt(restyle, 0).image}
            sizes={imageSizes(61, 90)}
          />
        </Cell>
        <Figure
          crop={RESTYLE_SOURCE}
          desk={{ span: 4, start: 9 }}
          figure={figureAt(restyle, 1)}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(30, 43)}
        />
        <Figure
          crop={RESTYLE_SOURCE}
          desk={{ span: 4, start: 9 }}
          figure={figureAt(restyle, 2)}
          phone={{ span: 2, start: 3 }}
          sizes={imageSizes(30, 43)}
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
  const tryOn = entryWithId(EDIT, "put-on-a-garment");
  return (
    <article id={tryOn.id}>
      <Grid className="home-edit-shared home-edit-tryon" row>
        <Figure
          crop={{ phoneRatio: "350 / 440", ratio: "648 / 808" }}
          desk={{ span: 6, start: 1 }}
          figure={figureAt(tryOn, 0)}
          sizes={imageSizes(45, 90)}
        />
        <Figure
          crop={TRY_ON_SOURCE}
          desk={{ span: 3, start: 7 }}
          figure={figureAt(tryOn, 1)}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(22, 43)}
        />
        <Figure
          crop={TRY_ON_SOURCE}
          desk={{ span: 3, start: 10 }}
          figure={figureAt(tryOn, 2)}
          phone={{ span: 2, start: 3 }}
          sizes={imageSizes(22, 43)}
        />
        <Cell className="home-hang mt-4 lg:mt-0" desk={{ span: 4, start: 7 }}>
          <Words entry={tryOn} />
        </Cell>
      </Grid>
    </article>
  );
}

function Restore() {
  const restore = entryWithId(EDIT, "repair-a-damaged-photo");
  return (
    <article className="flex flex-col gap-(--home-text-gap)" id={restore.id}>
      <Grid>
        <Cell desk={{ span: 10, start: 1 }}>
          <Split
            crop={{ phoneRatio: "350 / 232", ratio: "1096 / 728" }}
            figure={figureAt(restore, 0)}
            sides={restore.sides}
            sizes={imageSizes(76, 90)}
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
