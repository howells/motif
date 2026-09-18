# Handoff

Working notes for whoever picks this up next. Standing rules are in `CLAUDE.md`; issues live in Linear (team `MOT`), and Linear wins where the two disagree.

## State

`main`, clean: no worktrees, no stashes, no side branches. Four commits ahead of `origin/main`, none pushed, nothing deployed. `9e8c30f` predates this pass; the three below are its work.

| commit    | what                                                             |
| --------- | ---------------------------------------------------------------- |
| `bde95b6` | Reset the house looks to nine                                    |
| `97d1368` | Homepage: catalogue bands, real demos, Looks and Moods carousels |
| tip       | Give the nine looks one register, and the page one chapter head  |

Cursor was working in this checkout and was stopped mid-flight. Its looks-taxonomy work was sound and is commit `bde95b6`; its editor directory (`.cursor/`) is deleted. The plate work it left behind was not kept, see below.

## The nine looks

Canonical source: `packages/motif-sdk/src/creative.ts`. Docs, the CLI and the site all read from it.

Photographic (`acceptsMood: true`): `editorial`, `still-life`, `interior` (was `lived-in`), `architectural`, `portrait`. Flat (`acceptsMood: false`): `object`, `surface` (was `plate`), `abstract` (was `canvas`), `illustration` (was `drawing`, still `experimental`).

Removed: `homeowner`, `engraved`, `ephemera`. With `ephemera` gone no look renders lettering; `-m ideogram4` is the route for type.

**The clauses were rewritten for one register.** Daniel's note on the first architectural plate, "looks like a decrepit farmhouse in the Northeast", was a clause problem rather than a prompt problem: the old clause said "honest materials meeting precise detailing" with no reference points, so `banana` drew a working farm. All seven non-default clauses now name the same references his own shorthand uses (Aesop, Kinfolk, House & Garden) and carry a shared spine: muted mineral colour, soft natural daylight, generous negative space, shot on film with fine grain. `editorial` already had it. `packages/motif-sdk/tests/creative.test.ts` pins the `interior` clause verbatim and was updated with it.

**This is a breaking enum change.** `LookId` and `--look` both change: `@howells/motif-sdk` 5.0.0 and `@howells/motif-cli` 4.0.0. Versions are **not** bumped and nothing is tagged. Ask Daniel before either.

## Plates

All nine looks are illustrated on the page. Five plates were generated this pass against the new clauses; the other four are existing accepted plates.

| plate               | model      | cost                 |
| ------------------- | ---------- | -------------------- |
| `architectural.jpg` | banana     | $0.30 (two attempts) |
| `abstract.jpg`      | banana     | $0.15                |
| `illustration.jpg`  | gpt2       | $0.211               |
| `portrait.jpg`      | seedream45 | $0.04                |
| `surface.jpg`       | banana     | $0.031               |

The first architectural attempt (a rendered farmhouse) was rejected and regenerated. `surface` and `portrait` were regenerated after "generally need consistency in our looks": the old `surface` was a deep terracotta outlier against a page of bone and plaster. An earlier session's generated candidates were deleted before this pass and are not recoverable.

The architectural plate carries the most saturated colour in the set, a mown summer lawn and clipped limes. It is what the clause asks for and reads as House & Garden rather than as an outlier, but it is the plate to look at first if the register ever needs tightening again.

## Demo images

- **restore** is a genuine `--softness` run in the page's own register. `motif generate --look still-life` ($0.031) made a celadon jug on a plaster shelf; a local Gaussian blur (no fal) made `damaged.jpg`; `motif restore damaged.jpg --softness` (topaz-sharpen, $0.08) made `restored.jpg`. Verified by opening all three at a 450px detail crop: the throw-lines, the glaze speckle and the plaster texture come back, and nothing in the frame moves. The previous demo, a near-black portrait of a weathered fisherman, was deleted: its output had _worse_ background than its input (sharpening amplified JPEG blocking into hard-edged blotches) and its tone fought a bone-and-plaster page.
- **sheet** is a real `motif sheet` run over all nine look plates ($0, no model).
- **pose** (`map` band) was a portrait skeleton on black that the square crop cut the head and feet from; the file is re-cropped square around the skeleton, 1024².
- **upscale** and **restore** use a `detail` treatment: both files drawn at one magnification and clipped to the same region. Two squares at the same rendered size hid the difference they exist to show.
- **relight** is a held slider rather than two squares. Measured difference between source and `--even`: mean absolute 23/255 per channel, mean luminance 114.7 to 134.7.
- **`.site-cover`** is `width: var(--cover); max-width: 100%`, deliberately not `width: min(var(--cover), 100%)`. The percentage in the `min()` resolves against a flex item that is itself content-sized, which is circular, and it collapses the detail panes to their caption width. The definite-width form gives 480px panes at 1440 and 350px at 390.
- **layers** is a fan of three fixed-width planes stepping down and right, each on the holding colour with a hairline. Without the hairline two overlapping transparent planes merge into one slab; without the fixed width the drift resizes the planes instead of moving them, because a percentage margin on an auto-width block changes its width.

Fal spend this pass: **$0.732** on plates + **$0.111** on restore = **$0.843**. Cap was $1.50.

## Still honest gaps, recorded rather than papered over

1. **reframe** - the expansion asset predates this page and cannot be verified as derived from this exact source file. The band is captioned with both sizes and the operation reads correctly.
2. **restyle** - a pair, not a three-up. `public/demo/restyle/reference.jpg` (the old `drawing` look plate, moved here by Cursor) is on disk but unreferenced. Wiring it in as the `--like` reference would make the band a genuine three-up and fill its dead column.
3. **map** - four named frames from three subjects, not four maps of one picture. The two landscape frames now crop to square like the rest rather than letterboxing; source and depth crop identically, so the comparison still holds.
4. **relight** - the `--mood`-style relight has no honest path with the current roster: the alternative models are mode-gated rather than `-m`-addressable, and every iclight attempt regenerated the room. The dawn example stays text-only.
5. **vary** - the row mixes `vase/vary-*.jpg` (1000²) with `vary/vary-*.png` (2048²). Two different shoots of the same vase; worth unifying.
6. **favicon** - `/favicon.ico` 404s on every load. The app has no icon route. Worth an `app/icon.svg`, but it would also change `/bench`, so it was left for a decision rather than invented here.

## Assets

`apps/bench/public/demo` was 47MB and is now 20MB. Eleven unreferenced files were deleted. Photographs stored as PNG with no alpha in use were converted to JPEG. Four look plates arrived from fal at 2.5k to 4k pixels and were capped at 2048, which is generous for a 2x screen given nothing on the page renders a plate above 1048 CSS px. Genuine cut-outs keep their alpha: `layers/*.png`, `segment/bowl.png`, `mesh/rigged.png`, `vase/nobg.png`.

Declared `width`/`height` in `lib/site/catalogue-plates.ts` must match the files on disk, or `next/image` reserves the wrong box. They were updated with the cap.

## Verification this pass

`pnpm check` green (10 packages). `pnpm --filter @motif/bench-web lint` carries no warnings under `components/site/**` or `lib/site/**`. In the browser at 1440 and 390: 84 images, none broken, none without alt; no horizontal body overflow at 390; the Moods tab, slide counter and command line agree on load and after a tab change; the Looks carousel reads 01 / 09 over nine slides. `a11y --tags wcag2a,wcag2aa`: 0 violations. The 24 nodes axe returns as incomplete are it failing to resolve a `lab()` ground, not real failures; measured directly, `ink` is 16.3:1, `muted` 6.3:1 and `faint` 5.3:1 on `--ground`, and 4.7:1 at worst on `--surface`.

## Next action

1. Push when asked. Nothing is deployed.
2. Ask before bumping versions or tagging (see the breaking change above).
3. Linear MOT-43 is retitled and carries a comment describing the reset. It is still In Progress.

```bash
vercel pull --yes --environment=production && vercel build --prod && vercel deploy --prebuilt --prod
```

The Vercel CLI is linked to the `danielhowells` scope rather than the shell's default `material-instruments`, so `vercel inspect` needs `--scope danielhowells`.

A dev server may be running on port 4400. Kill it by port, never with `pkill -f`, because other sessions share this machine.

## Deliberately open

- The type case is lint-enforced for `apps/bench/components/site/**` only. `/bench` is a different design system on its own tokens and still carries raw typography utilities.
- The provider table scrolls sideways only when a reader has raised their browser's default font. It carries no `tabIndex`, which axe's `scrollable-region-focusable` wants: jsx-a11y's `no-noninteractive-tabindex` rejects it on both `div` and `section`, and the proper fix is in the rule.
