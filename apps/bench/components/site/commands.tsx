import { ChapterHead, Command, Label } from "@/components/site/chapter";
import { Plate } from "@/components/site/plate";
import { COMMAND_GROUPS, DEMO_ROWS, TILE_ROW } from "@/lib/site/page";

/** Every command, grouped, then three of them shown working.
 *
 * The index is the whole surface in one view; the rows below it are the proof.
 * Three rows rather than twenty-one: the page is making the case that one verb
 * names one job, and it only takes a few to make it. */
export function Commands() {
  return (
    <section className="site-chapter">
      <div className="site-gutter">
        <ChapterHead
          body="One verb per job. Motif chooses the model and prices the run before it spends anything."
          id="commands"
          title="Every command"
        />

        <div className="grid gap-x-10 gap-y-10 pt-14 md:grid-cols-3">
          {COMMAND_GROUPS.map((group) => (
            <div className="flex flex-col gap-1.5" key={group.name}>
              <h3 className="type-small pb-1" style={{ color: "var(--faint)" }}>
                {group.name}
              </h3>
              {group.commands.map((command) => (
                <div className="flex gap-4" key={command.verb}>
                  <code
                    className="type-mono w-[92px] shrink-0"
                    style={{ color: "var(--accent)" }}
                  >
                    {command.verb}
                  </code>
                  <span className="type-body">{command.summary}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {DEMO_ROWS.map((row) => (
        <div
          className="site-gutter flex flex-col gap-8 pt-20 md:flex-row md:gap-14"
          key={row.id}
        >
          <div className="flex w-full flex-col gap-3 md:w-[320px] md:shrink-0">
            <Label>{row.label}</Label>
            <h3 className="type-title">{row.title}</h3>
            <p
              className="type-body max-w-[34ch]"
              style={{ color: "var(--muted)" }}
            >
              {row.body}
            </p>
            <Command>{row.command}</Command>
          </div>
          <div
            className={
              row.plates.length === 1
                ? "flex min-w-0 flex-1 justify-center md:justify-start"
                : "grid flex-1 grid-cols-3 gap-3"
            }
          >
            {row.plates.map((plate) => (
              <Plate
                key={plate.src}
                ratio="1 / 1"
                sizes={
                  row.plates.length === 1
                    ? "(max-width: 767px) 100vw, 560px"
                    : "(max-width: 767px) 33vw, 330px"
                }
                source={plate}
                className={
                  row.plates.length === 1 ? "w-full max-w-[560px]" : ""
                }
              />
            ))}
          </div>
        </div>
      ))}

      {/* The tile row proves itself by repetition: the same file, once and
          then nine times, with the joins there to be looked for. */}
      <div className="site-gutter flex flex-col gap-8 pt-20 md:flex-row md:gap-14">
        <div className="flex w-full flex-col gap-3 md:w-[320px] md:shrink-0">
          <Label>{TILE_ROW.label}</Label>
          <h3 className="type-title">{TILE_ROW.title}</h3>
          <p
            className="type-body max-w-[34ch]"
            style={{ color: "var(--muted)" }}
          >
            {TILE_ROW.body}
          </p>
          <Command>{TILE_ROW.command}</Command>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3">
          <Plate
            ratio="1 / 1"
            sizes="(max-width: 767px) 50vw, 360px"
            source={TILE_ROW.plate}
          />
          {/* The same file as the plate beside it, so it carries no alt of
              its own: the caption already says what the repetition shows. */}
          <div
            aria-hidden
            className="site-plate"
            style={{
              aspectRatio: "1 / 1",
              backgroundImage: `url(${TILE_ROW.plate.src})`,
              backgroundSize: "33.333% 33.333%",
            }}
          />
        </div>
      </div>
    </section>
  );
}
