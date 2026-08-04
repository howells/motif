# Design spec — Motif Bench

**Surface:** `apps/bench` · **Type:** app UI, developer tool · **Stack:** Next 16, React 19, Tailwind v4 (to be added)

## Intent

- **Who:** a designer-engineer choosing an image model for room renders. Technically fluent; model aliases and fal endpoints are their objects, not leakage.
- **Task:** configure a run, watch it land, compare 23 models on speed / quality / cost, and decide.
- **Feel:** a laboratory instrument. Calm, precise, trustworthy. Numbers you would quote to someone else.
- **Hidden:** workflow mechanics, Mastra step names, span ids, table names, run-state machines. Diagnostics live behind a trace link, never in the primary read.

## The constraint that drives everything

**You cannot judge image quality against white.** A bright surround shifts perceived contrast and colour — it is why photographers evaluate on neutral grey and why darkrooms are dark. This tool exists to compare images. Putting them on white with grey cards, as the current build does, actively degrades the judgement it is asking the user to make.

So: **neutral dark ground, hairline structure, images unframed.** This is a functional requirement, not a mood.

## Aesthetic direction

- **Tone:** industrial / instrument. Photographic lab, not "dark mode SaaS".
- **Memorable element:** the **contact sheet** — samples at uniform size on neutral ground, hairline gutters, no card chrome, no rounded corners, metadata annotated *beneath* the frame in mono. It reads as a photographic contact sheet because that is exactly what it is.
- **Second move:** the verdict band is **not four cards**. It is four large mono readouts separated by hairline rules — an instrument panel. This removes four wrapper elements and increases legibility.
- **Colour strategy:** warm-neutral near-black ground, one accent (darkroom safelight amber) reserved for the primary action and best-in-row marks.
- **Motion:** almost none. Samples fade in as they resolve (150ms ease-out). Nothing else moves.

## Defaults consciously avoided

1. White background + grey cards (what exists now, and wrong for this domain).
2. Blue primary button.
3. Uniform `rounded-lg` cards in an even grid.

## Typography

**IBM Plex Sans** (UI) + **IBM Plex Mono** (all numerics and data). Plex was drawn for IBM's technical products; it carries engineered character without novelty, and its mono has true tabular figures. Not Geist (now ubiquitous), not Inter (the default), never Instrument Serif.

- UI body: Plex Sans 14px / 1.5, weight 400. Labels 12px weight 500.
- **All numbers, ids, endpoints, aliases, durations, costs, dimensions: Plex Mono with `font-variant-numeric: tabular-nums`.** Columns of numbers must align or comparison is guesswork.
- Verdict readouts: Plex Mono 32px, weight 500, tight tracking.
- No display face. App chrome never uses display type.
- Mono small-caps: permitted **only** on the four verdict labels and column headers — numeric/data-adjacent, ≤2 words. Not on section headings, not on chips, not on card labels.

## Palette — Tailwind v4 `@theme`, OKLCH

```css
@theme {
  /* ground → raised: 2-4% lightness steps, warm-neutral hue 60 */
  --color-ground:     oklch(0.175 0.006 60);  /* canvas */
  --color-plate:      oklch(0.213 0.005 60);  /* panels, contact-sheet bed */
  --color-raised:     oklch(0.252 0.005 60);  /* inputs, hovered rows */
  --color-line:       oklch(0.318 0.006 60);  /* hairlines */
  --color-line-soft:  oklch(0.262 0.006 60);  /* interior rules */

  --color-ink:        oklch(0.955 0.004 60);  /* primary text */
  --color-ink-dim:    oklch(0.735 0.005 60);  /* secondary */
  --color-ink-faint:  oklch(0.560 0.006 60);  /* tertiary, annotations */

  --color-safelight:  oklch(0.790 0.150 68);  /* THE accent — primary action, best-in-row */
  --color-safelight-hover: oklch(0.840 0.150 68);

  --color-good:       oklch(0.720 0.120 152); /* completed */
  --color-warn:       oklch(0.780 0.105 95);  /* partial, contended, inconclusive */
  --color-bad:        oklch(0.640 0.185 27);  /* failed */

  --radius-frame: 0px;   /* images: never rounded */
  --radius-control: 3px; /* buttons, inputs — barely there */
}
```

Accent discipline: **safelight appears at most twice per screen** — the primary action, and best-in-row marks in the comparison table. Everything else is neutral or semantic. Countable rule.

## Spacing & structure

- Base unit 4px. Section gap 32px. Panel padding 20px. Control height 32px.
- Hairline `1px solid var(--color-line)`. **Borders only — no shadows anywhere.** Depth comes from the surface ladder.
- Max content width 1440px; the contact sheet is allowed to use all of it.

## Layout

### `/` — composer

Two columns on desktop. The run form is the work; history is reference.

```
┌────────────────────────────────────────────────────────────────┐
│ MOTIF BENCH                                    23 models · fal │  ← hairline under
├──────────────────────────────────────┬─────────────────────────┤
│ prompt                               │ RECENT                  │
│ ┌──────────────────────────────────┐ │ ─────────────────────── │
│ │                                  │ │ 3 models   14:23  $0.05 │
│ └──────────────────────────────────┘ │ completed               │
│                                      │ ─────────────────────── │
│ models            5 of 23 selected   │ 2 models   14:18  $0.00 │
│ budget    [chip][chip][chip][chip]   │ partial                 │
│ standard  [chip][chip][chip][chip]   │                         │
│ premium   [chip][chip][chip]         │                         │
│                                      │                         │
│ samples 1   parallel 1   1:1   1K    │                         │
│ seed ○ 42          judge after ●     │                         │
│ stop above $2.00                     │                         │
│                                      │                         │
│ [ preview ]                          │                         │
│ ── dry run ─────────────────────────  │                         │
│ MODEL      SENDS        DROPS   EST  │                         │
│ flux-fast  square_hd    resltn  .003 │                         │
│ grok-image 3:2          —       .020 │                         │
│                                      │                         │
│ [ RUN — $0.023 ]  ← safelight        │                         │
└──────────────────────────────────────┴─────────────────────────┘
```

Model chips: mono alias + mono price, 1px border, `--color-raised` when selected with a safelight-tinted left edge (2px). Tier labels are quiet sentence-case in `--color-ink-faint`, not uppercase eyebrows.

### `/runs/[id]` — results

The contact sheet is the page. Verdict band above it, comparison below.

```
┌────────────────────────────────────────────────────────────────┐
│ ← runs   "a well-lit modern living room…"    completed · mock  │
│ 3 models × 1 sample · 1:1 · 1K · seed unset · $0.05            │
├────────────────────────────────────────────────────────────────┤
│  FASTEST      │  BEST QUALITY  │  CHEAPEST   │  BEST VALUE     │  ← no cards,
│  1.53s        │  2.59          │  $0.0028    │  1087 pts/$     │    hairline rules
│  seedream4    │  seedream4     │  flux-fast  │  flux-fast      │    between
├────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                        │
│ │          │ │          │ │          │   ← images flush, no    │
│ │          │ │          │ │          │     radius, 1px gutter  │
│ └──────────┘ └──────────┘ └──────────┘                        │
│ flux-fast     grok-image    seedream4    ← mono, beneath frame │
│ 3.12s 1024²   5.66s 1024²   1.53s 1024²                       │
│ $0.0028       $0.0200       $0.0300                            │
│ competent     inconclusive  competent                          │
├────────────────────────────────────────────────────────────────┤
│ COMPARISON                                                     │
│ metric         flux-fast    grok-image    seedream4            │
│ latency p50    3.12s        5.66s         1.53s ◂ best         │
│ cost / image   $0.0028 ◂    $0.0200       $0.0300              │
└────────────────────────────────────────────────────────────────┘
```

Mobile: single column; contact sheet becomes 2-up; verdict band stacks to a 2×2 grid keeping the hairline rules.

## States

- **Generating:** the frame holds its aspect and shows a slow neutral shimmer — never a spinner, never a layout shift when the image lands.
- **Failed:** frame fills `--color-plate` with the error code in mono `--color-bad` and one plain-language line. Never provider text.
- **Not judged:** quality slot reads `not judged` in `--color-ink-faint`. Never `—` alone, never zero.
- **Inconclusive:** `--color-warn`, with the reason on hover. This is a real outcome, not an error.
- **Empty history:** "No runs yet. Pick a few models and preview a dry run — it costs nothing."
- **Contended:** when parallel > 1, a `contended` mark sits with the latency, because those numbers are not comparable to serial ones.
- **gpt2:** a `±3s` mark beside its latency — queue polling granularity.

## Abstraction rules

Keep visible (user's objects): model alias, endpoint, dropped/coerced params, latency, cost, dimensions, error code, judge level.

Translate or hide: workflow/step names, Mastra internals, span and trace ids (behind a single "trace" link), table and column names, run-state enum values (`partial` → "partial — some models failed").

## Complexity guardrails — countable

- **Zero** `box-shadow` in the app. Depth is the surface ladder plus hairlines.
- **Zero** `border-radius` on any image frame.
- **At most 2** safelight-coloured elements per screen.
- **At most 4** type sizes per screen.
- **Zero** nested cards. The contact sheet is a grid on a bed, not cards in a card.
- **Zero** `transition-all` — name the properties.
- Every number that can be compared across models is mono + `tabular-nums`.

## Verification checklist

- [ ] Images sit on `--color-plate` or darker, never on white.
- [ ] Verdict band contains no card/panel wrappers.
- [ ] Safelight count ≤ 2 per screen.
- [ ] All comparable numerics mono + tabular.
- [ ] Contrast: `--color-ink` on `--color-ground` ≥ 12:1; `--color-ink-dim` ≥ 5:1; `--color-ink-faint` ≥ 3.5:1 (annotation only, never sole carrier of meaning).
- [ ] Every status also carries a text label, never colour alone.
- [ ] Focus rings visible on every control (2px safelight, 2px offset).
- [ ] No layout shift when a sample resolves.
- [ ] Reduced-motion: shimmer becomes a static tint.
