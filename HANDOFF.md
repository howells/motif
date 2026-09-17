# Handoff

Working notes for whoever picks this up next. The repo's standing rules are in `CLAUDE.md`; issues live in Linear (team `MOT`), and Linear wins where the two disagree.

## The work

The public page at `/` — `apps/bench/app/page.tsx`, drawn from the Paper file "Motif". Two passes landed in `0933211`:

- **A layout audit.** Three places where resizing put content out of reach: the provider table unfolded at 768px but asks for 900px, the hero's step row overflowed below 390px with no wrap or scroller, and the chapter head pinned its standfirst so the longest heading pushed it off-screen at 768px. Physical `left`/`right` properties became logical throughout.
- **A light, four-role rebuild.** Paper ground, achromatic type, no accent colour. The type case went from five roles to four (`type-display`, `type-title`, `type-body`, `type-small`), with `font-mono` as the one sanctioned modifier beside them.

## State

Committed on `main`, **not pushed**. Working tree clean, no stashes. `pnpm lint` and `pnpm typecheck` both pass.

Verified in a browser at 15 widths from 320 to 1920, the RTL mirror, and 200% page zoom. axe (wcag2a + wcag2aa) reports zero violations at 390 and 768.

## Next action

Push, then deploy from the repo root:

```bash
vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod
```

Nothing is mid-flight. A dev server may still be running on port 4400 — kill it by port, never with `pkill -f`, because other sessions share this machine.

## Paths

Recently edited here:

- `apps/bench/app/site.css` — the scoped design system for the page: the four type roles, the palette, and the page furniture.
- `apps/bench/components/site/**` — the page's components.
- `oxlint.config.ts` — carries the override that holds the type case.

## Open, deliberately

- **The type case is enforced for the site only.** `howells/no-raw-type-utilities` is scoped to `apps/bench/components/site/**`. The bench app at `/bench` is a different design system on its own tokens and has not been migrated; it still carries raw typography utilities and arbitrary values.
- **The provider table scrolls sideways as a last resort.** It is inert at every normal text size — the folded table fits from 320px up, so the wrapper never becomes a scroll region. It engages only when a reader has raised their browser's default font, where the folded table asks for 485px. It carries no `tabIndex`, which axe's `scrollable-region-focusable` wants on a scroll container holding nothing focusable, because jsx-a11y's `no-noninteractive-tabindex` rejects it on both `div` and `section`. The proper fix is in the rule rather than here.
- **Differences from the Paper boards**, recorded rather than fixed: the three demo rows do not bleed off the right edge; the Looks strip's Back/Forward controls are an addition; two Looks descriptions are not the boards' words.
