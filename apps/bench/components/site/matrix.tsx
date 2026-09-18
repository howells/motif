import { ChapterHead } from "@/components/site/chapter";
import type { MatrixFal } from "@/lib/site/content";
import { MATRIX, matrixRows } from "@/lib/site/content";

function FalCell({ fal }: { readonly fal: MatrixFal }) {
  if (fal.kind === "note") {
    return (
      <span className="type-small" style={{ color: "var(--muted)" }}>
        {fal.text}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="type-title tabular-nums">{fal.count}</span>
      <span className="type-small" style={{ color: "var(--faint)" }}>
        {fal.noun}
      </span>
    </span>
  );
}

function DirectCell({ direct }: { readonly direct: string | undefined }) {
  if (direct !== undefined) {
    return <span className="type-small">{direct}</span>;
  }
  return (
    /* `relative` keeps the visually hidden label positioned inside its cell
       rather than against the page. A dash would draw a column of marks down
       the table saying nothing; the row is simply blank, and a screen reader
       still hears the header and the answer. */
    <span className="type-small relative">
      <span className="sr-only">Not available</span>
    </span>
  );
}

/** Which provider runs which command.
 *
 * A real table, because this is tabular data and a reader with a screen
 * reader should get the column header read with each cell rather than a row
 * of bare dashes. The counts come from the SDK at build time, so the page
 * cannot claim a number the CLI would not honour.
 *
 * One column for the direct providers at every width. OpenAI, Google and
 * Replicate answer identically on every row, so three columns repeated one
 * answer three times and cost the table the room to breathe. The footnote
 * names them. */
export function Matrix() {
  const rows = matrixRows();

  return (
    <section>
      <ChapterHead body={MATRIX.body} id="providers" title={MATRIX.title} />

      <div className="site-gutter">
        {/* A last resort, inert at every normal text size: three columns fit
            from 320px up, so this never scrolls and never becomes a scroll
            region. It engages only when a reader has raised their browser's
            default font far enough that the content box can no longer hold
            the table, and the columns used to clip away with nothing to
            reach them.

            No `tabIndex` here, though axe's `scrollable-region-focusable`
            wants one on a scroll container holding nothing focusable:
            jsx-a11y's `no-noninteractive-tabindex` rejects it on both `div`
            and `section`, and an override is worse than the gap. */}
        <div className="mt-16 overflow-x-auto">
          <table className="w-full max-w-[52rem] border-collapse text-start">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--rule)" }}>
                <th
                  className="type-small pb-3.5 text-start min-[62rem]:w-105"
                  scope="col"
                  style={{ color: "var(--faint)" }}
                >
                  Command
                </th>
                <th
                  className="type-small pb-3.5 text-start min-[62rem]:w-55"
                  scope="col"
                >
                  fal
                </th>
                <th
                  className="type-small pb-3.5 text-start min-[62rem]:w-45"
                  scope="col"
                  style={{ color: "var(--muted)" }}
                >
                  Direct
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.verb}>
                  {/* Inline children rather than a flex wrapper: a table cell
                  that becomes a flex container leaves the table's column
                  model and the lanes stop lining up. On a phone the verb
                  sits above its summary. */}
                  <th
                    className="py-2.5 pe-4 text-start align-baseline min-[62rem]:pe-6"
                    scope="row"
                  >
                    <code
                      className="type-small block align-baseline font-mono min-[62rem]:inline-block min-[62rem]:w-29"
                      style={{ color: "var(--ink)" }}
                    >
                      {row.verb}
                    </code>
                    <span className="type-body align-baseline">
                      {row.summary}
                    </span>
                  </th>
                  <td className="py-2.5 pe-4 align-baseline">
                    <FalCell fal={row.fal} />
                  </td>
                  <td className="py-2.5 align-baseline">
                    <DirectCell direct={row.direct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p
          className="type-small mt-10 max-w-[76ch] pt-8"
          style={{ borderTop: "1px solid var(--rule)", color: "var(--muted)" }}
        >
          {MATRIX.footnote}
        </p>
      </div>
    </section>
  );
}
