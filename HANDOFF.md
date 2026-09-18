# Handoff

Working notes for whoever picks this up next. The repo's standing rules are in `CLAUDE.md`; issues live in Linear (team `MOT`), and Linear wins where the two disagree.

## The work

The public page at `/` — `apps/bench/app/page.tsx`, drawn from the Paper file "Motif".

**The catalogue.** Every command Motif has — 27, not the 21 the page used to list — set as a plate book: a mount, the signature you would type, what the command does, and what it is not for. Where a command changes a picture the source and the result share one mount, side by side. The seven whose result is text (`ask`, `series`, `studio`, `--last`, `--history`, `--describe`, `--describe errors`) get a type specimen instead of a photograph; every line in one is a real subcommand, schema field or error code, taken from the CLI rather than written for the page. The wording is the CLI's own: `summary` and `notFor` are what `motif --describe tasks` prints. This replaced the bare three-column index and the three showpiece rows, so nothing is said twice. Data in `apps/bench/lib/site/catalogue.ts`, component in `apps/bench/components/site/catalogue.tsx`.

Two earlier passes landed in `0933211`:

- **A layout audit.** Three places where resizing put content out of reach: the provider table unfolded at 768px but asks for 900px, the hero's step row overflowed below 390px with no wrap or scroller, and the chapter head pinned its standfirst so the longest heading pushed it off-screen at 768px. Physical `left`/`right` properties became logical throughout.
- **A light, four-role rebuild.** Paper ground, achromatic type, no accent colour. The type case went from five roles to four (`type-display`, `type-title`, `type-body`, `type-small`), with `font-mono` as the one sanctioned modifier beside them.

## State

Committed on `main`. Working tree clean, no stashes. `pnpm lint` and `pnpm typecheck` both pass.

Verified in a browser: the catalogue at 320, 390, 768, 992 and 1440, with the mount heights measured for uniformity and every specimen checked for clipping; axe (wcag2a + wcag2aa) reports zero violations at 390. At 1440 it reports the one long-standing artefact described below. The console is clean on a fresh load, LCP is the hero plate at 80ms and CLS is 0.

The earlier passes were verified at 15 widths from 320 to 1920, the RTL mirror, and 200% page zoom.

## Next action

Nothing outstanding. To deploy again from the repo root:

```bash
vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod
```

The Vercel CLI is linked to the `danielhowells` scope rather than the shell's default `material-instruments`, so `vercel inspect` needs `--scope danielhowells`.

A dev server may still be running on port 4400 — kill it by port, never with `pkill -f`, because other sessions share this machine.

## Paths

Recently edited here:

- `apps/bench/lib/site/catalogue.ts` — the catalogue's 27 entries. Its own module because it is half the page's words; `content.ts` imports it so the provider table says what a command does in the same wording.
- `apps/bench/components/site/catalogue.tsx` — the plate grid.
- `apps/bench/app/site.css` — the scoped design system for the page: the four type roles, the palette, and the page furniture.
- `apps/bench/components/site/**` — the page's components.
- `oxlint.config.ts` — carries the override that holds the type case.

## Open, deliberately

- **The type case is enforced for the site only.** `howells/no-raw-type-utilities` is scoped to `apps/bench/components/site/**`. The bench app at `/bench` is a different design system on its own tokens and has not been migrated; it still carries raw typography utilities and arbitrary values.
- **The provider table scrolls sideways as a last resort.** It is inert at every normal text size — the folded table fits from 320px up, so the wrapper never becomes a scroll region. It engages only when a reader has raised their browser's default font, where the folded table asks for 485px. It carries no `tabIndex`, which axe's `scrollable-region-focusable` wants on a scroll container holding nothing focusable, because jsx-a11y's `no-noninteractive-tabindex` rejects it on both `div` and `section`. The proper fix is in the rule rather than here.
- **axe reports one contrast violation at desktop widths, and it is an artefact.** Only `figure:nth-child(3)` of the Looks strip fails. It sits outside the viewport inside `overflow: clip`; cards 1 and 2 with identical markup pass, and the three colours measure 16:1, 6.5:1 and 5.3:1 on paper. Unchanged by the catalogue work.
- **Differences from the Paper boards**, recorded rather than fixed: the three demo rows do not bleed off the right edge; the Looks strip's Back/Forward controls are an addition; two Looks descriptions are not the boards' words.
