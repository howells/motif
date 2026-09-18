import Image from "next/image";

import { ChapterHead } from "@/components/site/chapter";
import type { CatalogueEntry } from "@/lib/site/catalogue";
import { CATALOGUE, CATALOGUE_HEAD } from "@/lib/site/catalogue";

/** All a mounted picture needs. The file's own width and height stay in the
 * content module — they are worth recording — but the layout does not use
 * them, because the mount sets the box. */
interface MountSource {
  readonly alt: string;
  readonly src: string;
}

/** Plate numbers run across the whole catalogue rather than restarting in each
 * group, so a number names one command and nothing else. Built once here
 * rather than counted during render, which would be a side effect. */
const NUMBERS = new Map<string, number>();

for (const group of CATALOGUE) {
  for (const entry of group.entries) {
    NUMBERS.set(entry.id, NUMBERS.size + 1);
  }
}

/** One picture on its mount.
 *
 * `fill` rather than the file's own width and height: the cell sets the box
 * and `object-fit: contain` fits the picture inside it, so passing intrinsic
 * dimensions would only tell Next a ratio the layout does not use. `sizes`
 * differs with the number of pictures in the mount, because two of them share
 * the width between them. */
function Picture({
  shared,
  source,
}: {
  readonly shared: boolean;
  readonly source: MountSource;
}) {
  return (
    <div className="site-mount-cell">
      <Image
        alt={source.alt}
        fill
        sizes={
          shared
            ? "(max-width: 61.999rem) 46vw, 340px"
            : "(max-width: 61.999rem) 92vw, 690px"
        }
        src={source.src}
      />
    </div>
  );
}

/** What a command whose result is text hands back, set as type.
 *
 * Nothing here is written for the page: every line is a real subcommand, a
 * real field of the schema or a real error code, and the first line is the
 * command that prints them. A picture invented for a command that makes no
 * picture would be the one dishonest thing in the catalogue. */
function Specimen({ entry }: { readonly entry: CatalogueEntry }) {
  return (
    <div className="site-mount-cell flex flex-col justify-center gap-0.5 p-5 min-[62rem]:p-9">
      {(entry.specimen ?? []).map((line, index) => (
        <code
          /* `pre-wrap` rather than `pre`: the runs of spaces that line these
             up as columns have to survive, and the cell clips, so a line
             wider than it — at 320, or at a raised default font — would be
             cut off silently rather than wrapped. */
          className="type-small block font-mono whitespace-pre-wrap"
          key={`${entry.id}-${String(index)}`}
          style={{ color: index === 0 ? "var(--ink)" : "var(--muted)" }}
        >
          {/* A blank line is a rest between the command and its answer; it
              needs a character to hold its height. */}
          {line === "" ? " " : line}
        </code>
      ))}
    </div>
  );
}

/** The mount: one, two or three cells across a 2:1 box.
 *
 * Every other picture on the page fills its box. A catalogue plate does not:
 * it is a reproduction of what the command returned, and a crop is a
 * different picture, so these sit whole on the surface tone with a rule of
 * paper between them. */
function Mount({ entry }: { readonly entry: CatalogueEntry }) {
  const { after, before, repeat, specimen, video } = entry;
  const shared = before !== undefined || repeat === true;

  return (
    <div className="site-mount">
      {specimen === undefined ? null : <Specimen entry={entry} />}

      {before === undefined ? null : <Picture shared source={before} />}

      {after === undefined ? null : video === undefined ? (
        <Picture shared={shared} source={after} />
      ) : (
        <div className="site-mount-cell">
          {/* The one result on the page that moves. Muted and looping, with
              the still it was made from as its poster, so a reader who never
              gets the file still sees the frame. */}
          <video autoPlay loop muted playsInline poster={after.src} src={video}>
            <track kind="captions" />
          </video>
        </div>
      )}

      {repeat === true && after !== undefined ? (
        /* The same file as the picture beside it, nine times over. A seamless
           tile can only prove itself by repeating, and it carries no alt of
           its own because the plate beside it already has one. */
        <div
          aria-hidden
          className="site-mount-cell"
          style={{
            backgroundImage: `url(${after.src})`,
            backgroundSize: "33.333% 33.333%",
          }}
        />
      ) : null}
    </div>
  );
}

/** One catalogue entry: the plate, its number, the signature you would type,
 * what it does, and what it is not for. */
function Entry({ entry }: { readonly entry: CatalogueEntry }) {
  const number = NUMBERS.get(entry.id) ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Mount entry={entry} />

      <div className="flex flex-col gap-2">
        {/* `font-mono` sits on the `code` itself, not only on the row: Tailwind's
            preflight gives `code` its own family, which beats anything the row
            passes down, and the page would quietly fall back to the system
            mono the design moved off. */}
        <span className="type-small flex gap-3.5">
          <span className="font-mono" style={{ color: "var(--faint)" }}>
            {String(number).padStart(2, "0")}
          </span>
          <code
            className="min-w-0 font-mono break-words"
            style={{ color: "var(--ink)" }}
          >
            {entry.usage}
          </code>
        </span>

        <p className="type-body">{entry.summary}</p>

        {/* The CLI's own `notFor`, which is the most useful line in the
            entry: twenty-seven verbs is a lot to choose between, and this is
            the one that sends you to the right one. */}
        <p
          className="type-small max-w-[46ch]"
          style={{ color: "var(--faint)" }}
        >
          {`Not for: ${entry.notFor}`}
        </p>
      </div>
    </div>
  );
}

/** Every command Motif has, illustrated by what it returns.
 *
 * Four groups, twenty-seven plates, in the order the CLI's own help puts
 * them: the ones that make a picture, the ones that change one, the ones that
 * read one, and the ones that manage your work. Two columns from 62rem, one
 * below: 62rem is where a mount is wide enough that the longest specimen
 * still fits inside its ratio, so the mounts across a row stay the same
 * height and the captions under them line up. */
export function Catalogue() {
  return (
    <section className="site-chapter site-gutter">
      <ChapterHead
        body={CATALOGUE_HEAD.body}
        id="commands"
        title={CATALOGUE_HEAD.title}
      />

      {CATALOGUE.map((group) => (
        <div className="pt-20" key={group.name}>
          <div
            className="flex flex-col gap-2 pt-7 md:flex-row md:items-baseline md:gap-8"
            style={{ borderTop: "1px solid var(--rule)" }}
          >
            <h3 className="type-title">{group.name}</h3>
            <p className="type-body" style={{ color: "var(--muted)" }}>
              {group.body}
            </p>
          </div>

          <div className="grid gap-x-8 gap-y-14 pt-12 min-[62rem]:grid-cols-2">
            {group.entries.map((entry) => (
              <Entry entry={entry} key={entry.id} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
