import { CommandLink } from "@/components/home/command";
import { Cell, Grid } from "@/components/home/grid";
import { HOME } from "@/lib/site/home/content";

const { close, wordmark } = HOME;

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      className="text-muted shrink-0"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M4 12 L12 4 M6 4 H12 V10"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** The close, on the mount: the closing line as large as the wordmark with
 * the install line under it, the ways onward, and the credit. */
export function Close() {
  return (
    <footer className="home-chapter home-mount pb-8 lg:pb-12">
      <Grid className="items-end gap-y-24 lg:gap-y-32">
        <Cell
          className="flex flex-col gap-6 lg:gap-8"
          desk={{ span: 7, start: 1 }}
        >
          <h2 className="home-close-line">{close.line}</h2>
          <div>
            <CommandLink command={close.install} />
          </div>
        </Cell>
        <Cell desk={{ span: 4, start: 9 }}>
          <ul className="home-links">
            {close.links.map((link) => (
              <li key={link.label}>
                <a className="home-text" href={link.href}>
                  <span>{link.label}</span>
                  <Arrow />
                </a>
              </li>
            ))}
          </ul>
        </Cell>
        <Cell className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <p className="home-headline">{wordmark}</p>
          <p className="home-text text-muted">{close.credit}</p>
        </Cell>
      </Grid>
    </footer>
  );
}
