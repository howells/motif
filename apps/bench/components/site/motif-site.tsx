import Image from "next/image";

import { CodeBlock } from "@/components/site/code-block";
import { CommandLine, OptionFlag } from "@/components/site/command-line";
import { DemoView } from "@/components/site/demo";
import { newsreader } from "@/components/site/fonts";
import { mayBeTransparent, Picture } from "@/components/site/picture";
import {
  AGENT_SURFACE,
  CAPABILITIES,
  CAPABILITY_GROUPS,
  LOOK_ENTRIES,
  MOOD_ENTRIES,
  SITE,
} from "@/lib/site/content";
import type { Asset, Capability, Demo } from "@/lib/site/content";

import styles from "@/components/site/site.module.css";

/** The public page, set like a darkroom contact sheet: a warm near-black
 * ground, and the whole page first as a sheet of thumbnails, one for every
 * command, look and mood. Each thumbnail links to its frame below, where the
 * result sits at full size beside its source with the command underneath. */

const chapterNumber = (index: number) => String(index + 1).padStart(2, "0");

/** The capabilities in page order, numbered once across all groups. */
const PARTS = (() => {
  let next = 0;
  return CAPABILITY_GROUPS.flatMap((group) => {
    const chapters = CAPABILITIES.filter(
      (capability) => capability.group === group.id
    ).map((capability) => {
      const chapter = { capability, index: next };
      next += 1;
      return chapter;
    });
    return chapters.length === 0 ? [] : [{ chapters, group }];
  });
})();

const CHAPTERS = PARTS.flatMap((part) => part.chapters);

/** The verb of a command: `motif erase …` is "erase", `motif "prompt"` is
 * "generate", `motif --last` is "--last". A command run as several lines is
 * named by its last `motif` line, which is the one that did the job. */
const verbOf = (command: string): string => {
  const line =
    command
      .split("\n")
      .findLast((candidate) => candidate.startsWith("motif")) ?? "";
  const verb = /^motif\s+(series run|series|--[a-z]+|[a-z-]+)/u.exec(line);
  return verb?.[1] ?? "generate";
};

/** The one image that stands for a demo's result on the sheet. A command that
 * only prints has no image, so it is named under the sheet instead. */
const heroOf = (demo: Demo): Asset | undefined => {
  switch (demo.kind) {
    case "pair": {
      return demo.after;
    }
    case "set": {
      return demo.outputs[0];
    }
    case "boxes":
    case "text": {
      return demo.source;
    }
    case "video": {
      return demo.poster;
    }
    case "series": {
      return demo.scenes[0]?.image;
    }
    case "terminal": {
      return undefined;
    }
    default: {
      return undefined;
    }
  }
};

const lookNames = (acceptsMood: boolean) =>
  LOOK_ENTRIES.filter((look) => look.acceptsMood === acceptsMood)
    .map((look) => look.name)
    .join(", ");

const LINK =
  "text-(--site-accent) underline decoration-(--site-accent)/40 underline-offset-2 hover:decoration-(--site-accent)";

/** One square on the sheet. The first row or two are in the first viewport,
 * so those load eagerly. */
function Thumb({
  asset,
  eager = false,
  href,
  label,
  sub,
}: {
  readonly asset: Asset;
  readonly eager?: boolean;
  readonly href: string;
  readonly label: string;
  readonly sub: string;
}) {
  return (
    <a className="group flex min-w-0 flex-col gap-2 no-underline" href={href}>
      <span
        className={`block aspect-square overflow-hidden ${
          mayBeTransparent(asset) ? styles.checker : "bg-(--site-plate)"
        }`}
      >
        <Image
          alt={asset.alt}
          className="h-full w-full object-cover transition-opacity group-hover:opacity-80"
          height={asset.height}
          loading={eager ? "eager" : "lazy"}
          src={asset.src}
          unoptimized
          width={asset.width}
        />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-mono text-[12px] leading-[1.4] text-(--site-muted)">
          {sub}
        </span>
        <span className="text-[13px] leading-[1.4] text-(--site-ink) group-hover:underline">
          {label}
        </span>
      </span>
    </a>
  );
}

function SheetHead({ children }: { readonly children: string }) {
  return <h3 className="pb-4 text-[14px] text-(--site-muted)">{children}</h3>;
}

const THUMB_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-8 lg:gap-x-4";

/** A command at full size: the result and its source, with the title,
 * caption and command beside them, and a way back to the sheet. */
function Frame({
  capability,
  index,
}: {
  readonly capability: Capability;
  readonly index: number;
}) {
  return (
    <article
      aria-labelledby={`${capability.id}-title`}
      className="grid scroll-mt-6 grid-cols-1 gap-6 border-t border-(--site-rule) py-10 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-20"
      id={capability.id}
    >
      <div className="min-w-0 lg:col-span-8">
        <DemoView demo={capability.demo} />
      </div>
      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:col-span-4 lg:self-start">
        <p className="font-mono text-[13px] text-(--site-muted)">
          {chapterNumber(index)} motif {verbOf(capability.command)}
        </p>
        <h3
          className={`${styles.display} text-[1.75rem] leading-[1.1] tracking-[-0.01em] lg:text-[2rem]`}
          id={`${capability.id}-title`}
        >
          {capability.title}
        </h3>
        <p className="text-[15px] leading-[1.55]">{capability.caption}</p>
        <CommandLine>{capability.command}</CommandLine>
        {capability.notes === undefined ? null : (
          <p className="text-[14px] leading-[1.55] text-(--site-muted)">
            {capability.notes}
          </p>
        )}
        <a className={`${LINK} text-[14px]`} href="#sheet">
          Back to the sheet
        </a>
      </div>
    </article>
  );
}

function SectionHead({
  children,
  id,
  note,
}: {
  readonly children: string;
  readonly id: string;
  readonly note?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-t border-(--site-ink) pt-4 pb-8 sm:flex-row sm:items-baseline sm:justify-between">
      <h2
        className={`${styles.display} text-[2rem] leading-none tracking-[-0.015em] sm:text-[2.5rem]`}
        id={`${id}-heading`}
      >
        {children}
      </h2>
      {note === undefined ? null : (
        <p className="max-w-[30rem] text-[15px] text-(--site-muted)">{note}</p>
      )}
    </header>
  );
}

function Proof({
  command,
  description,
  flag,
  id,
  image,
  name,
}: {
  readonly command: string;
  readonly description: string;
  readonly flag: string;
  readonly id: string;
  readonly image: Asset;
  readonly name: string;
}) {
  return (
    <figure
      className="m-0 flex min-w-0 scroll-mt-6 flex-col gap-3"
      id={`${flag}-${id}`}
    >
      <Picture asset={image} />
      <figcaption className="flex flex-col gap-2">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className={`${styles.display} text-[1.375rem] leading-tight`}>
            {name}
          </span>
          <OptionFlag name={flag} value={id} />
        </span>
        <span className="text-[14px] leading-[1.5] text-(--site-muted)">
          {description}
        </span>
        <CommandLine quiet>{command}</CommandLine>
        <a className={`${LINK} text-[14px]`} href="#sheet">
          Back to the sheet
        </a>
      </figcaption>
    </figure>
  );
}

export function MotifSite() {
  return (
    <main
      className={`${newsreader.variable} ${styles.root} min-h-dvh overflow-x-clip`}
    >
      <div className="mx-auto max-w-[96rem] px-5 sm:px-8 lg:px-12">
        <header className="flex flex-col gap-6 pt-8 pb-10 sm:flex-row sm:items-end sm:justify-between sm:pt-10 sm:pb-14">
          <div className="flex flex-col gap-3">
            <h1
              className={`${styles.display} text-[2.5rem] leading-none tracking-[-0.02em] sm:text-[3rem]`}
            >
              {SITE.name}
            </h1>
            <p className="max-w-[34rem] text-[1.0625rem] leading-[1.5]">
              {SITE.summary}
            </p>
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            <span className="text-[14px] text-(--site-muted)">Install</span>
            <CommandLine>{SITE.install}</CommandLine>
          </div>
        </header>

        <section
          aria-labelledby="sheet-heading"
          className="flex scroll-mt-6 flex-col gap-10 sm:gap-14"
          id="sheet"
        >
          <h2 className="sr-only" id="sheet-heading">
            The sheet
          </h2>
          <div>
            <SheetHead>Commands, one result each</SheetHead>
            <div className={THUMB_GRID}>
              {CHAPTERS.map(({ capability, index }) => {
                const hero = heroOf(capability.demo);
                return hero === undefined ? null : (
                  <Thumb
                    asset={hero}
                    eager={index < 16}
                    href={`#${capability.id}`}
                    key={capability.id}
                    label={capability.title}
                    sub={`${chapterNumber(index)} motif ${verbOf(capability.command)}`}
                  />
                );
              })}
            </div>
            <p className="pt-5 text-[14px] text-(--site-muted)">
              Three more print to the terminal rather than making a file. They
              are{" "}
              <a className={LINK} href="#more">
                at the end
              </a>
              .
            </p>
          </div>
          <div>
            <SheetHead>Looks, one image each</SheetHead>
            <div className={THUMB_GRID}>
              {LOOK_ENTRIES.map((look) => (
                <Thumb
                  asset={look.image}
                  href={`#look-${look.id}`}
                  key={look.id}
                  label={look.name}
                  sub={`--look ${look.id}`}
                />
              ))}
            </div>
          </div>
          <div>
            <SheetHead>Moods, one kitchen under six lights</SheetHead>
            <div className={THUMB_GRID}>
              {MOOD_ENTRIES.map((mood) => (
                <Thumb
                  asset={mood.image}
                  href={`#mood-${mood.id}`}
                  key={mood.id}
                  label={mood.name}
                  sub={`--mood ${mood.id}`}
                />
              ))}
            </div>
          </div>
        </section>

        {PARTS.map((part) => (
          <section
            aria-labelledby={`${part.group.id}-heading`}
            className="scroll-mt-6 pt-16 sm:pt-24"
            id={part.group.id}
            key={part.group.id}
          >
            <SectionHead id={part.group.id}>{part.group.title}</SectionHead>
            {part.chapters.map(({ capability, index }) => (
              <Frame
                capability={capability}
                index={index}
                key={capability.id}
              />
            ))}
          </section>
        ))}

        <section
          aria-labelledby="looks-heading"
          className="scroll-mt-6 pt-16 sm:pt-24"
          id="looks"
        >
          <SectionHead
            id="looks"
            note={
              <>
                Add one to any prompt with{" "}
                <OptionFlag name="look" value="<id>" />. A look sets the medium,
                finish and framing.
              </>
            }
          >
            Looks
          </SectionHead>
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-14">
            {LOOK_ENTRIES.map((look) => (
              <Proof
                command={look.command}
                description={look.prompt}
                flag="look"
                id={look.id}
                image={look.image}
                key={look.id}
                name={look.name}
              />
            ))}
          </div>
        </section>

        <section
          aria-labelledby="moods-heading"
          className="scroll-mt-6 pt-16 sm:pt-24"
          id="moods"
        >
          <SectionHead
            id="moods"
            note={
              <>
                Add one with <OptionFlag name="mood" value="<id>" /> to set the
                light. All six use the same prompt, look and seed, so only the
                light changes.
              </>
            }
          >
            Moods
          </SectionHead>
          <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8">
            {MOOD_ENTRIES.map((mood) => (
              <Proof
                command={mood.command}
                description={mood.description}
                flag="mood"
                id={mood.id}
                image={mood.image}
                key={mood.id}
                name={mood.name}
              />
            ))}
          </div>
          <dl className="m-0 mt-12 grid grid-cols-1 gap-x-12 gap-y-4 border-t border-(--site-rule) pt-6 sm:mt-16 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-[14px] text-(--site-muted)">
                Looks that take a mood
              </dt>
              <dd className="m-0 text-[15px] leading-[1.55]">
                {lookNames(true)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-[14px] text-(--site-muted)">
                Looks that ignore one
              </dt>
              <dd className="m-0 text-[15px] leading-[1.55]">
                {lookNames(false)}
              </dd>
            </div>
          </dl>
        </section>

        <section
          aria-labelledby="agents-heading"
          className="scroll-mt-6 pt-16 pb-16 sm:pt-24 sm:pb-24"
          id="agents"
        >
          <SectionHead
            id="agents"
            note="Every command answers --format json, prices a run with --dry-run and returns a coded error."
          >
            For agents
          </SectionHead>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
            <CodeBlock label="From motif --help">
              {AGENT_SURFACE.help}
            </CodeBlock>
            <div className="flex min-w-0 flex-col gap-8">
              <div className="flex flex-col gap-3">
                <CommandLine plate>
                  {AGENT_SURFACE.didYouMean.command}
                </CommandLine>
                <CodeBlock
                  label={`stderr, exit code ${AGENT_SURFACE.didYouMean.exitCode}`}
                >
                  {AGENT_SURFACE.didYouMean.output}
                </CodeBlock>
              </div>
              <div className="flex flex-col gap-3">
                <CommandLine plate>{AGENT_SURFACE.dryRun.command}</CommandLine>
                <CodeBlock label="Output">
                  {AGENT_SURFACE.dryRun.output}
                </CodeBlock>
              </div>
              <div className="flex flex-col gap-3">
                <CommandLine plate>
                  {AGENT_SURFACE.describeTasksCommand}
                </CommandLine>
                <CodeBlock label="Output, shortened">
                  {AGENT_SURFACE.describeTasksExcerpt}
                </CodeBlock>
              </div>
              <div className="flex flex-col gap-3">
                <CommandLine plate>
                  {AGENT_SURFACE.describeErrors.command}
                </CommandLine>
                <CodeBlock label="Output, 2 of the entries">
                  {AGENT_SURFACE.describeErrors.output}
                </CodeBlock>
              </div>
            </div>
          </div>
        </section>

        <footer className="flex flex-col gap-1 border-t border-(--site-rule) pt-6 pb-16">
          <span className="text-[14px] text-(--site-muted)">Install</span>
          <CommandLine>{SITE.install}</CommandLine>
        </footer>
      </div>
    </main>
  );
}
