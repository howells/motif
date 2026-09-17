import { ChapterHead } from "@/components/site/chapter";
import type { MatrixFal } from "@/lib/site/content";
import { MATRIX, matrixRows } from "@/lib/site/content";

const PROVIDERS = ["OpenAI", "Google", "Replicate"] as const;

function FalCell({ fal }: { readonly fal: MatrixFal }) {
  if (fal.kind === "note") {
    return (
      <span className="type-small" style={{ color: "var(--muted)" }}>
        {fal.text}
      </span>
    );
  }
  return (
    <span className="flex items-baseline gap-2">
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
       rather than against the page. */
    <span className="type-small relative" style={{ color: "var(--faint)" }}>
      <span aria-hidden>–</span>
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
 * On a phone the three direct providers fold into one column. Their cells are
 * identical on every row, so nothing is lost, and the table fits the screen
 * instead of hiding columns behind a sideways scroll. */
export function Matrix() {
  const rows = matrixRows();

  return (
    <section className="site-chapter site-gutter">
      <ChapterHead body={MATRIX.body} id="providers" title={MATRIX.title} />

      <table className="mt-16 w-full border-collapse text-left md:min-w-225">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--rule)" }}>
            <th
              className="type-small pb-3.5 font-normal md:w-105"
              scope="col"
              style={{ color: "var(--faint)" }}
            >
              Command
            </th>
            <th className="type-small pb-3.5 font-normal md:w-55" scope="col">
              fal
            </th>
            <th
              className="type-small pb-3.5 font-normal md:hidden"
              scope="col"
              style={{ color: "var(--muted)" }}
            >
              OpenAI, Google, Replicate
            </th>
            {PROVIDERS.map((provider) => (
              <th
                className="type-small hidden pb-3.5 font-normal md:table-cell md:w-45"
                key={provider}
                scope="col"
                style={{ color: "var(--muted)" }}
              >
                {provider}
              </th>
            ))}
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
                className="py-2.5 pr-4 text-left align-baseline font-normal md:pr-6"
                scope="row"
              >
                <code
                  className="type-mono block align-baseline md:inline-block md:w-29"
                  style={{ color: "var(--accent)" }}
                >
                  {row.verb}
                </code>
                <span className="type-body align-baseline">{row.summary}</span>
              </th>
              <td className="py-2.5 pr-4 align-baseline">
                <FalCell fal={row.fal} />
              </td>
              <td className="py-2.5 align-baseline md:hidden">
                <DirectCell direct={row.direct} />
              </td>
              {PROVIDERS.map((provider) => (
                <td
                  className="hidden py-2.5 align-baseline md:table-cell"
                  key={provider}
                >
                  <DirectCell direct={row.direct} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p
        className="type-small mt-10 max-w-[76ch] pt-8"
        style={{ borderTop: "1px solid var(--rule)", color: "var(--muted)" }}
      >
        {MATRIX.footnote}
      </p>
    </section>
  );
}
