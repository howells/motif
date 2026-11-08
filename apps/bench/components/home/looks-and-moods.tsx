import "./looks-and-moods.css";
import { ChapterSection, Headline } from "@/components/home/chapter";
import { CommandLink } from "@/components/home/command";
import { Figure } from "@/components/home/figure";
import { Cell, Grid } from "@/components/home/grid";
import { imageSizes } from "@/components/home/image-sizes";
import {
  LOOK_ROW,
  LOOK_STRIP_LABEL,
  LOOKS_AND_MOODS,
  MOOD_ROW,
} from "@/lib/site/home/looks-and-moods";

/** The nine Looks as a strip of tall plates that runs off the right edge and
 * scrolls sideways, then the six Moods of one kitchen, three to a row (two
 * on a phone). The two rows sit closer than entries elsewhere, a chapter
 * head's distance apart, as the board sets them. */
export function LooksAndMoods() {
  return (
    <ChapterSection chapter={LOOKS_AND_MOODS}>
      <div className="grid gap-y-(--home-head-gap)">
        <div className="grid gap-y-(--home-text-gap)" id={LOOK_ROW.id}>
          <Grid>
            <Cell desk="bleed" phone="bleed">
              <section
                aria-label={LOOK_STRIP_LABEL}
                className="home-look-strip"
                // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling region must take focus for a keyboard to scroll it; Chrome and Firefox focus a scroller with nothing focusable inside, Safari does not
                tabIndex={0}
              >
                {LOOK_ROW.figures.map((figure) => (
                  <Figure
                    crop={{ phoneRatio: "168 / 208", ratio: "312 / 392" }}
                    figure={figure}
                    key={figure.image.src}
                    sizes={imageSizes(22, 44)}
                  />
                ))}
              </section>
            </Cell>
          </Grid>
          <Grid>
            <div>
              <CommandLink command={LOOK_ROW.command} />
            </div>
          </Grid>
        </div>
        <div className="grid gap-y-(--home-text-gap)" id={MOOD_ROW.id}>
          <Grid>
            <Headline>{MOOD_ROW.headline}</Headline>
          </Grid>
          <Grid className="gap-y-6 lg:gap-y-12">
            {MOOD_ROW.figures.map((figure, index) => (
              <Figure
                crop={{ phoneRatio: "168 / 128", ratio: "424 / 320" }}
                desk={{ span: 4, start: (index % 3) * 4 + 1 }}
                figure={figure}
                key={figure.image.src}
                phone={{ span: 2, start: (index % 2) * 2 + 1 }}
                sizes={imageSizes(30, 44)}
              />
            ))}
          </Grid>
          <Grid>
            <div>
              <CommandLink command={MOOD_ROW.command} />
            </div>
          </Grid>
        </div>
      </div>
    </ChapterSection>
  );
}
