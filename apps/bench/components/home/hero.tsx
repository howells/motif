import { CommandLink } from "@/components/home/command";
import { Responsive } from "@/components/home/figure";
import { Cell, Grid } from "@/components/home/grid";
import { Plate } from "@/components/home/plate";
import { HOME } from "@/lib/site/home/content";

const { hero, wordmark } = HOME;

/** The wordmark, the one-line intro and the install line, then the still
 * life full width with the sentence that made it. On a phone the picture is
 * a portrait crop that runs edge to edge, and its caption quotes the
 * sentence instead of showing the command. */
export function Hero() {
  const { figure } = hero;
  return (
    <section aria-labelledby="home-title">
      <Grid className="items-end gap-y-4 py-12 lg:pt-24">
        <Cell desk={{ span: 8, start: 1 }}>
          <h1 className="home-wordmark" id="home-title">
            {wordmark}
          </h1>
        </Cell>
        <Cell className="flex flex-col gap-4" desk={{ span: 4, start: 9 }}>
          <p className="home-text">{hero.intro}</p>
          <div>
            <CommandLink command={hero.install} />
          </div>
        </Cell>
      </Grid>
      <figure>
        <Grid>
          <Cell phone="bleed">
            <Plate
              crop={{ phoneRatio: "390 / 488", ratio: "1320 / 744" }}
              eager
              image={figure.image}
              phone={figure.phone?.image}
              sizes="(width >= 64rem) 92vw, 100vw"
            />
          </Cell>
        </Grid>
        <figcaption>
          <Grid className="pt-2 lg:pt-4">
            <Cell desk={{ span: 6, start: 1 }}>
              <p className="home-text text-muted">
                <Responsive
                  desk={figure.caption}
                  phone={figure.phone?.caption}
                />
              </p>
            </Cell>
            <Cell className="hidden lg:block" desk={{ span: 6, start: 7 }}>
              <CommandLink command={figure.command} />
            </Cell>
          </Grid>
        </figcaption>
      </figure>
    </section>
  );
}
