import { CommandLink } from "@/components/home/command";
import { Responsive } from "@/components/home/figure";
import { Cell, Grid } from "@/components/home/grid";
import { PRICE } from "@/lib/site/home/price";

/** The Price chapter: the rule across the page, then the promise on the left
 * (title, the dry-run line, the flag) and the price table on the right. Each
 * row of the table is 64px on desktop and 56px on a phone, rule included, so
 * the table keeps the 8px rhythm. On a phone it stacks, the table 48px under
 * the flag. */
export function Price() {
  return (
    <section
      aria-labelledby={`${PRICE.id}-title`}
      className="home-chapter pb-(--home-chapter-gap)"
      id={PRICE.id}
    >
      <Grid className="items-start">
        <div className="border-t border-(--rule) pb-(--home-rule-gap)" />
        <Cell className="flex flex-col gap-4" desk={{ span: 5, start: 1 }}>
          <h2 className="home-chapter-title" id={`${PRICE.id}-title`}>
            {PRICE.title}
          </h2>
          {/* On desktop the line runs four of the cell's five columns. */}
          <div className="lg:grid lg:grid-cols-5 lg:gap-x-(--home-gutter)">
            <p className="home-text lg:col-span-4">{PRICE.intro}</p>
          </div>
          <div>
            <CommandLink command={PRICE.command} />
          </div>
        </Cell>
        <Cell className="pt-12 lg:pt-0" desk={{ span: 6, start: 7 }}>
          <dl>
            {PRICE.rows.map((row) => (
              <div
                className="flex items-baseline justify-between gap-(--home-gutter) border-t border-(--rule) pt-3.75 pb-4 last:border-b last:pb-3.75 lg:pt-4.75 lg:pb-5 lg:first:border-t-0 lg:first:pt-5 lg:last:pb-4.75"
                key={row.job}
              >
                <dt className="home-text">
                  <Responsive desk={row.job} phone={row.phone?.job} />
                </dt>
                <dd className="home-text tabular-nums">{row.price}</dd>
              </div>
            ))}
          </dl>
          <p className="home-text text-muted pt-4">{PRICE.note}</p>
        </Cell>
      </Grid>
    </section>
  );
}
