import {
  FieldCarousel,
  SourceAndTakes,
} from "@/components/site/catalogue-carousel";
import { MotionClip } from "@/components/site/catalogue-clip";
import { HeldCompare } from "@/components/site/catalogue-compare";
import { Cover, Note, Still } from "@/components/site/catalogue-still";
import { StudioField } from "@/components/site/catalogue-studio";
import type { CatalogueEntry, LedgerRow, Plate } from "@/lib/site/catalogue";

const FIELD_SIZES = "(max-width: 61.999rem) 92vw, 1048px";
const HALF_SIZES = "(max-width: 61.999rem) 46vw, 480px";

function Caption({
  ink,
  mono,
  text,
}: {
  readonly ink?: boolean;
  readonly mono?: boolean;
  readonly text: string | undefined;
}) {
  if (text === undefined) {
    return null;
  }
  return (
    <Note ink={ink} mono={mono}>
      {text}
    </Note>
  );
}

function PairField({
  legend,
  plain,
  result,
  source,
}: {
  readonly legend?: string;
  readonly plain?: boolean;
  readonly result: Plate;
  readonly source: Plate;
}) {
  return (
    <div className="site-pair">
      <div
        className={
          plain === true
            ? "site-pair-source site-pair-source-plain"
            : "site-pair-source"
        }
      >
        <Still picture={source} sizes={HALF_SIZES} />
        <Caption text={source.caption} />
      </div>
      <div className="site-pair-result">
        <Still picture={result} plain={plain} sizes={FIELD_SIZES} />
        <Caption text={result.caption} />
        <Caption mono text={legend} />
      </div>
    </div>
  );
}

function MatchedPair({
  result,
  source,
}: {
  readonly result: Plate;
  readonly source: Plate;
}) {
  return (
    <div className="site-matched">
      <div>
        <Cover picture={source} size={480} sizes="480px" />
        <Caption mono text={source.caption} />
      </div>
      <div>
        <Cover picture={result} size={480} sizes="480px" />
        <Caption ink mono text={result.caption} />
      </div>
    </div>
  );
}

function RepeatField({ result }: { readonly result: Plate }) {
  return (
    <div className="site-repeat">
      <div>
        <Cover picture={result} size={240} sizes="240px" />
        <Note>{result.caption ?? "the tile"}</Note>
      </div>
      <div
        aria-hidden
        className="site-repeat-field"
        style={{ backgroundImage: `url(${result.src})` }}
      />
    </div>
  );
}

function SetField({ frames }: { readonly frames: readonly Plate[] }) {
  const items = [];
  for (const frame of frames) {
    items.push(
      <div key={frame.src}>
        <Cover picture={frame} size={318} sizes="318px" />
        <Caption mono text={frame.caption} />
      </div>
    );
  }
  return <div className="site-set">{items}</div>;
}

/** One decomposition: the flattened picture leads at full measure, and the
 * three transparent layers sit beneath it in a single quiet row — no boxes,
 * no labels, nothing between the parts and the page. */
function StackField({
  frames,
  source,
}: {
  readonly frames: readonly Plate[];
  readonly source: Plate;
}) {
  const layers = [];
  for (const frame of frames) {
    layers.push(
      <div className="site-stack-layer" key={frame.src}>
        <Still picture={frame} plain sizes="(min-width: 64rem) 420px, 90vw" />
      </div>
    );
  }
  return (
    <div className="site-stack">
      <div className="site-stack-flat">
        <Still picture={source} sizes={FIELD_SIZES} />
        <Note>{source.caption ?? "the flattened picture"}</Note>
      </div>
      <div className="site-stack-layers">{layers}</div>
    </div>
  );
}

function LiftedField({
  plain,
  result,
  source,
}: {
  readonly plain?: boolean;
  readonly result: Plate;
  readonly source: Plate;
}) {
  return (
    <div className="site-lifted">
      <div>
        <Still picture={source} sizes="512px" />
        <Note>{source.caption ?? "the photograph"}</Note>
      </div>
      <div>
        <div className={plain === true ? undefined : "site-stack-mount"}>
          <Still picture={result} plain={plain} sizes="512px" />
        </div>
        <Caption ink mono text={result.caption} />
      </div>
    </div>
  );
}

function AskField({
  answer,
  question,
  source,
}: {
  readonly answer: string;
  readonly question: string;
  readonly source: Plate;
}) {
  return (
    <div className="site-ask">
      <div className="site-ask-photo">
        <Still picture={source} sizes="620px" />
      </div>
      <div className="site-ask-exchange">
        <code
          className="type-small block font-mono"
          style={{ color: "var(--faint)" }}
        >
          {question}
        </code>
        <p className="type-title pt-6">{answer}</p>
      </div>
    </div>
  );
}

function SpecimenField({
  result,
  specimen,
}: {
  readonly result?: Plate;
  readonly specimen: readonly string[];
}) {
  const lines = [];
  for (const [index, line] of specimen.entries()) {
    lines.push(
      <code
        className="type-small block font-mono whitespace-pre-wrap"
        key={String(index)}
      >
        {line === "" ? " " : line}
      </code>
    );
  }
  if (result === undefined) {
    return (
      <div className="site-specimen-lines" style={{ color: "var(--muted)" }}>
        {lines}
      </div>
    );
  }
  return (
    <div className="site-specimen-row">
      <div className="site-specimen-lines" style={{ color: "var(--muted)" }}>
        {lines}
      </div>
      <div className="site-specimen-plate">
        <Still picture={result} sizes="320px" />
      </div>
    </div>
  );
}

function LedgerField({ rows }: { readonly rows: readonly LedgerRow[] }) {
  const body = [];
  for (const row of rows) {
    body.push(
      <div className="site-ledger-row" key={row.id}>
        <code
          className="type-small font-mono"
          style={{ color: "var(--faint)" }}
        >
          {row.id}
        </code>
        <p className="type-body">{row.prompt}</p>
        <code
          className="type-small font-mono"
          style={{ color: "var(--muted)" }}
        >
          {row.model}
        </code>
        <code className="type-small site-ledger-cost font-mono">
          {row.cost}
        </code>
      </div>
    );
  }
  return (
    <div className="site-ledger">
      <code
        className="type-small block font-mono"
        style={{ color: "var(--ink)" }}
      >
        motif --history --limit 10 --fields id,prompt,model,cost
      </code>
      <div className="site-ledger-head">
        <p className="type-small">id</p>
        <p className="type-small">prompt</p>
        <p className="type-small">model</p>
        <p className="type-small site-ledger-cost">cost</p>
      </div>
      {body}
    </div>
  );
}

function SinglePlate({ result }: { readonly result: Plate }) {
  return (
    <div className="site-single">
      <Still picture={result} sizes={FIELD_SIZES} />
    </div>
  );
}

function renderField(entry: CatalogueEntry) {
  switch (entry.treatment) {
    case "carousel": {
      return (
        <FieldCarousel
          captioned={entry.id === "map" || entry.id === "material"}
          frames={entry.frames ?? []}
          id={`carousel-${entry.id}`}
        />
      );
    }
    case "takes": {
      return <TakesField entry={entry} />;
    }
    case "set": {
      return <SetField frames={entry.frames ?? []} />;
    }
    case "plate": {
      return <PlateField entry={entry} />;
    }
    case "motion": {
      return <MotionField entry={entry} />;
    }
    case "repeat": {
      return <RepeatOf entry={entry} />;
    }
    case "pair": {
      return <PairOf entry={entry} />;
    }
    case "held": {
      return <HeldOf entry={entry} />;
    }
    case "matched": {
      return <MatchedOf entry={entry} />;
    }
    case "stack": {
      return <StackOf entry={entry} />;
    }
    case "lifted": {
      return <LiftedOf entry={entry} />;
    }
    case "trio": {
      return <TrioOf entry={entry} />;
    }
    case "ask": {
      return <AskOf entry={entry} />;
    }
    case "specimen": {
      return (
        <SpecimenField result={entry.result} specimen={entry.specimen ?? []} />
      );
    }
    case "studio": {
      return <StudioField />;
    }
    case "ledger": {
      return <LedgerField rows={entry.ledger ?? []} />;
    }
    default: {
      const missed: never = entry.treatment;
      void missed;
      return null;
    }
  }
}

function TakesField({ entry }: { readonly entry: CatalogueEntry }) {
  const source = entry.source;
  if (source === undefined) {
    return null;
  }
  return (
    <SourceAndTakes
      frames={entry.frames ?? []}
      id={`carousel-${entry.id}`}
      source={source}
    />
  );
}

function PlateField({ entry }: { readonly entry: CatalogueEntry }) {
  const result = entry.result;
  if (result === undefined) {
    return null;
  }
  return <SinglePlate result={result} />;
}

function MotionField({ entry }: { readonly entry: CatalogueEntry }) {
  const result = entry.result;
  const video = entry.video;
  if (result === undefined) {
    return null;
  }
  if (video === undefined) {
    return null;
  }
  return (
    <MotionClip
      duration={entry.duration ?? "0:05"}
      poster={result}
      video={video}
    />
  );
}

function RepeatOf({ entry }: { readonly entry: CatalogueEntry }) {
  const result = entry.result;
  if (result === undefined) {
    return null;
  }
  return <RepeatField result={result} />;
}

function PairOf({ entry }: { readonly entry: CatalogueEntry }) {
  const result = entry.result;
  const source = entry.source;
  if (result === undefined) {
    return null;
  }
  if (source === undefined) {
    return null;
  }
  return (
    <PairField
      legend={entry.legend}
      plain={entry.plain}
      result={result}
      source={source}
    />
  );
}

function HeldOf({ entry }: { readonly entry: CatalogueEntry }) {
  const result = entry.result;
  const source = entry.source;
  if (result === undefined) {
    return null;
  }
  if (source === undefined) {
    return null;
  }
  return <HeldCompare cap={entry.frameCap} result={result} source={source} />;
}

function MatchedOf({ entry }: { readonly entry: CatalogueEntry }) {
  const result = entry.result;
  const source = entry.source;
  if (result === undefined) {
    return null;
  }
  if (source === undefined) {
    return null;
  }
  return <MatchedPair result={result} source={source} />;
}

function StackOf({ entry }: { readonly entry: CatalogueEntry }) {
  const source = entry.source;
  if (source === undefined) {
    return null;
  }
  return <StackField frames={entry.frames ?? []} source={source} />;
}

function LiftedOf({ entry }: { readonly entry: CatalogueEntry }) {
  const result = entry.result;
  const source = entry.source;
  if (result === undefined) {
    return null;
  }
  if (source === undefined) {
    return null;
  }
  return <LiftedField plain={entry.plain} result={result} source={source} />;
}

function TrioOf({ entry }: { readonly entry: CatalogueEntry }) {
  const frames = entry.frames ?? [];
  const cells = [];
  for (const [index, frame] of frames.entries()) {
    cells.push(
      <div key={frame.src}>
        <Still picture={frame} sizes="(min-width: 64rem) 300px, 90vw" />
        {index === frames.length - 1 ? (
          <Caption ink mono text={frame.caption} />
        ) : (
          <Caption mono text={frame.caption} />
        )}
      </div>
    );
  }
  return <div className="site-trio">{cells}</div>;
}

function AskOf({ entry }: { readonly entry: CatalogueEntry }) {
  const source = entry.source;
  const question = entry.question;
  const answer = entry.answer;
  if (source === undefined) {
    return null;
  }
  if (question === undefined) {
    return null;
  }
  if (answer === undefined) {
    return null;
  }
  return <AskField answer={answer} question={question} source={source} />;
}

export function Field({ entry }: { readonly entry: CatalogueEntry }) {
  return renderField(entry);
}
