import { ChapterSection, WideWords, Words } from "@/components/home/chapter";
import { Figure } from "@/components/home/figure";
import { Cell, Grid } from "@/components/home/grid";
import { imageSizes } from "@/components/home/image-sizes";
import {
  ASK,
  LAYERS,
  MAPS,
  MATERIALS,
  MESH,
  READ_AND_CONVERT,
  SEGMENT,
  SHEET,
  VECTORIZE,
} from "@/lib/site/home/read-and-convert";

/** The photo, then the question and Motif's answer beside it, ruled off like
 * a reply, then the entry's own words. */
function Ask() {
  const [photo] = ASK.figures;
  const { answer, question } = ASK.exchange;
  return (
    <article id={ASK.id}>
      <Grid className="items-start gap-y-6">
        <Figure
          crop={{ phoneRatio: "350 / 200", ratio: "760 / 424" }}
          desk={{ span: 7, start: 1 }}
          figure={photo}
          sizes={imageSizes(53, 100)}
        />
        <Cell
          className="flex flex-col gap-6 lg:gap-8"
          desk={{ span: 4, start: 9 }}
        >
          <div className="flex flex-col gap-2">
            <p className="home-text text-muted">{question.speaker}</p>
            <p className="home-text">{question.text}</p>
          </div>
          <div className="flex flex-col gap-2 border-l border-(--rule) pl-3.25 lg:pl-5.75">
            <p className="home-text text-muted">{answer.speaker}</p>
            <p className="home-text home-answer">{answer.text}</p>
          </div>
          <Words entry={ASK} />
        </Cell>
      </Grid>
    </article>
  );
}

function Segment() {
  const [picture] = SEGMENT.figures;
  return (
    <article className="flex flex-col gap-(--home-text-gap)" id={SEGMENT.id}>
      <Grid>
        <Figure
          crop={{
            phonePosition: "62% 50%",
            phoneRatio: "350 / 200",
            ratio: "1320 / 736",
          }}
          figure={picture}
          sizes={imageSizes(92, 100)}
        />
      </Grid>
      <WideWords entry={SEGMENT} />
    </article>
  );
}

/** Indented by a column on both boards, the exploded layers with the words
 * beside them on desktop and below them on a phone. */
function Layers() {
  const [layers] = LAYERS.figures;
  return (
    <article id={LAYERS.id}>
      <Grid className="items-start gap-y-4">
        <Figure
          crop={{ phoneRatio: "259 / 304", ratio: "648 / 752" }}
          desk={{ span: 6, start: 2 }}
          figure={layers}
          phone={{ span: 3, start: 2 }}
          sizes={imageSizes(45, 75)}
        />
        <Cell
          className="lg:pt-24"
          desk={{ span: 3, start: 9 }}
          phone={{ span: 3, start: 2 }}
        >
          <Words entry={LAYERS} />
        </Cell>
      </Grid>
    </article>
  );
}

/** Three maps falling in size, their bottoms on one line. */
function Maps() {
  const [depth, pose, edges] = MAPS.figures;
  return (
    <article className="flex flex-col gap-(--home-text-gap)" id={MAPS.id}>
      <Grid row>
        <Figure
          crop={{ ratio: "1 / 1" }}
          desk={{ span: 5, start: 1 }}
          figure={depth}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(38, 45)}
        />
        <Figure
          crop={{ phoneRatio: "77 / 80", ratio: "1 / 1" }}
          desk={{ span: 3, start: 6 }}
          figure={pose}
          phone={{ span: 1, start: 3 }}
          sizes={imageSizes(22, 20)}
        />
        <Figure
          crop={{ phoneRatio: "77 / 80", ratio: "1 / 1" }}
          desk={{ span: 2, start: 9 }}
          figure={edges}
          phone={{ span: 1, start: 4 }}
          sizes={imageSizes(14, 20)}
        />
      </Grid>
      <WideWords entry={MAPS} />
    </article>
  );
}

/** The words hang from the top of the row on desktop; on a phone they come
 * first and the three maps follow. */
function Materials() {
  const [colour, bumps, shine] = MATERIALS.figures;
  return (
    <article id={MATERIALS.id}>
      <Grid row>
        <Cell className="home-hang max-lg:mb-6" desk={{ span: 3, start: 1 }}>
          <Words entry={MATERIALS} />
        </Cell>
        <Figure
          crop={{ phoneRatio: "168 / 224", ratio: "312 / 552" }}
          desk={{ span: 3, start: 4 }}
          figure={colour}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(22, 45)}
        />
        <Figure
          crop={{ phoneRatio: "77 / 160", ratio: "312 / 432" }}
          desk={{ span: 3, start: 7 }}
          figure={bumps}
          phone={{ span: 1, start: 3 }}
          sizes={imageSizes(22, 20)}
        />
        <Figure
          crop={{ phoneRatio: "77 / 96", ratio: "1 / 1" }}
          desk={{ span: 3, start: 10 }}
          figure={shine}
          phone={{ span: 1, start: 4 }}
          sizes={imageSizes(22, 20)}
        />
      </Grid>
    </article>
  );
}

/** The SVG stands higher than the original on purpose: a stagger, so the
 * pair is not a row and the captions follow their pictures. */
function Vectorize() {
  const [original, svg] = VECTORIZE.figures;
  return (
    <article className="flex flex-col gap-6 lg:gap-12" id={VECTORIZE.id}>
      <WideWords entry={VECTORIZE} />
      <Grid className="items-end">
        <Figure
          crop={{ phoneRatio: "168 / 224", ratio: "424 / 568" }}
          desk={{ span: 4, start: 5 }}
          figure={original}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(30, 45)}
        />
        <Figure
          className="pb-16 lg:pb-32"
          crop={{ phoneRatio: "168 / 224", ratio: "424 / 568" }}
          desk={{ span: 4, start: 9 }}
          figure={svg}
          phone={{ span: 2, start: 3 }}
          sizes={imageSizes(30, 45)}
        />
      </Grid>
    </article>
  );
}

/** The photo and the model on a paper mat, with the words at the end of the
 * row on desktop, their command level with the captions, and below the pair
 * on a phone. */
function Mesh() {
  const [photo, model] = MESH.figures;
  return (
    <article id={MESH.id}>
      <Grid row>
        <Figure
          crop={{
            phonePosition: "45% 50%",
            phoneRatio: "168 / 256",
            ratio: "312 / 480",
          }}
          desk={{ span: 3, start: 1 }}
          figure={photo}
          phone={{ span: 2, start: 1 }}
          sizes={imageSizes(22, 45)}
        />
        <Figure
          className="home-matte"
          crop={{ phoneRatio: "168 / 256", ratio: "536 / 760" }}
          desk={{ span: 5, start: 4 }}
          figure={model}
          phone={{ span: 2, start: 3 }}
          sizes={imageSizes(32, 40)}
        />
        <Cell className="home-foot max-lg:mt-4" desk={{ span: 3, start: 10 }}>
          <Words entry={MESH} />
        </Cell>
      </Grid>
    </article>
  );
}

/** The sheet first on a phone, with the words under it; on desktop the words
 * sit at the left, level with the sheet's foot. */
function Sheet() {
  const [sheet] = SHEET.figures;
  return (
    <article id={SHEET.id}>
      <Grid className="items-end gap-y-4 lg:[&>*]:row-start-1">
        <Figure
          crop={{ phoneRatio: "350 / 384", ratio: "648 / 704" }}
          desk={{ span: 6, start: 6 }}
          figure={sheet}
          sizes={imageSizes(45, 100)}
        />
        <Cell desk={{ span: 3, start: 1 }}>
          <Words entry={SHEET} />
        </Cell>
      </Grid>
    </article>
  );
}

/** Read and convert, on the mount: what Motif reads from a picture and what
 * it turns one into. */
export function ReadAndConvert() {
  return (
    <ChapterSection chapter={READ_AND_CONVERT}>
      <Ask />
      <Segment />
      <Layers />
      <Maps />
      <Materials />
      <Vectorize />
      <Mesh />
      <Sheet />
    </ChapterSection>
  );
}
