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
 * Below 62rem the three direct providers fold into one column. Their cells
 * are identical on every row, so nothing is lost, and the table fits the
 * screen instead of hiding columns behind a sideways scroll. 62rem is where
 * the content stops fitting rather than a device width: the unfolded table
 * asks for 900px, and `--gutter` leaves that much room from 992px up. */
export function Matrix() {
  const rows = matrixRows();

  return (
    <section className="site-chapter site-gutter">
      <ChapterHead body={MATRIX.body} id="providers" title={MATRIX.title} />

      <table className="mt-16 w-full border-collapse text-start min-[62rem]:min-w-225">
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
              className="type-small pb-3.5 text-start min-[62rem]:hidden"
              scope="col"
              style={{ color: "var(--muted)" }}
            >
              OpenAI, Google, Replicate
            </th>
            {PROVIDERS.map((provider) => (
              <th
                className="type-small hidden pb-3.5 text-start min-[62rem]:table-cell min-[62rem]:w-45"
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
                className="py-2.5 pe-4 text-start align-baseline min-[62rem]:pe-6"
                scope="row"
              >
                <code
                  className="type-small block align-baseline font-mono min-[62rem]:inline-block min-[62rem]:w-29"
                  style={{ color: "var(--ink)" }}
                >
                  {row.verb}
                </code>
                <span className="type-body align-baseline">{row.summary}</span>
              </th>
              <td className="py-2.5 pe-4 align-baseline">
                <FalCell fal={row.fal} />
              </td>
              <td className="py-2.5 align-baseline min-[62rem]:hidden">
                <DirectCell direct={row.direct} />
              </td>
              {PROVIDERS.map((provider) => (
                <td
                  className="hidden py-2.5 align-baseline min-[62rem]:table-cell"
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
