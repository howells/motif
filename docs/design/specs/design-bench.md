# Design spec — Motif Bench

**Surface:** `apps/bench` · **Type:** app UI, developer tool · **Stack:** Next 16, React 19, Tailwind v4, shadcn/ui (new-york)

**Inherits:** the Patternmode house theme (`~/Sites/patternmode`). This app should feel like it belongs beside the user's other work, not like a separate product.

## Intent

- **Who:** a designer-engineer choosing an image model for room renders. Technically fluent; model aliases and fal endpoints are their objects, not leakage.
- **Task:** configure a run, watch it land, compare 23 models on speed / quality / cost, decide.
- **Feel:** quiet, warm, precise. A well-made instrument on a paper desk — not a dashboard, not a control room.
- **Hidden:** workflow mechanics, Mastra step names, span ids, table names. Diagnostics behind one trace link.

## Inherited house theme — do not re-litigate

Taken directly from Patternmode so the two apps read as siblings:

- **Warm paper ground**, not white. Warm-grey borders. Near-black warm ink.
- **Inter at 14px / weight 450** — the 450 is deliberate and distinctive; do not round it to 400 or 500.
- Font features `"cpsp", "cv01", "cv02", "cv11"` on body. These give Inter its Patternmode character (single-storey a alternates, straight-tail l). Non-negotiable.
- **One accent: deep forest green** `#315c4b`. Restrained — it is a ring/accent colour, not a fill-everything brand colour.
- Radius 8px. Borders-only depth, no shadows.
- Prose line-height 1.65, UI line-height 1.5.

## The one deliberate departure

**The image comparison surface is a neutral dark plate, not warm paper.**

You cannot judge image quality against warm white. A bright, slightly-yellow surround shifts perceived contrast and colour temperature — which is exactly the judgement this tool asks the user to make across 23 models. Photographers evaluate on neutral grey; Lightroom and Capture One ship light chrome with a neutral canvas for this reason.

So: **house theme for all chrome, neutral dark plate for the contact sheet and lightbox only.** This is one scoped exception with a stated reason, not a second theme. Everything outside the image bed follows Patternmode exactly.

## Tokens — Tailwind v4 `@theme`

```css
@theme {
  /* ── Inherited from Patternmode (exact) ───────────────────────── */
  --color-background:   oklch(0.9875 0.0026 106.4); /* #fbfbf9 warm paper */
  --color-surface:      oklch(1.0000 0.0000 90);    /* #ffffff panels */
  --color-surface-soft: oklch(0.9698 0.0054 95.1);  /* #f6f5f1 inset rows */
  --color-ink:          oklch(0.2300 0.0038 106.7); /* #1d1d1b */
  --color-muted:        oklch(0.5617 0.0123 95.3);  /* #77756d secondary */
  --color-border:       oklch(0.9099 0.0071 88.6);  /* #e3e1dc */
  --color-border-soft:  oklch(0.9432 0.0070 88.6);  /* #eeece7 interior rules */
  --color-accent:       oklch(0.4380 0.0563 166.3); /* #315c4b forest */
  --color-accent-soft:  oklch(0.9308 0.0133 159.9); /* #e1ebe5 */

  /* ── Bench-only: the image plate ──────────────────────────────── */
  --color-plate:        oklch(0.2450 0.0020 106);   /* neutral, near-achromatic */
  --color-plate-edge:   oklch(0.3200 0.0020 106);   /* gutter between frames */
  --color-plate-ink:    oklch(0.9200 0.0020 106);   /* annotation on plate */
  --color-plate-muted:  oklch(0.6600 0.0020 106);

  /* ── Semantic ─────────────────────────────────────────────────── */
  --color-ok:   oklch(0.4380 0.0563 166.3);         /* completed — reuse accent */
  --color-warn: oklch(0.5900 0.1000 75);            /* partial, contended, inconclusive */
  --color-bad:  oklch(0.5100 0.1600 27);            /* failed */

  --radius: 8px;
  --radius-frame: 0px;  /* image frames never round */
}
```

The plate tokens are near-achromatic on purpose (chroma ≤ 0.002). Any hue in the image surround biases colour judgement.

## Typography

- UI: **Inter**, 14px, weight 450, line-height 1.5. Feature settings as above.
- Data: the Patternmode mono stack (`SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace`) with `font-variant-numeric: tabular-nums`.
- **Every comparable number is mono + tabular** — latency, cost, dimensions, scores. Columns that don't align can't be compared.
- Verdict readouts: mono, 28px, weight 500.
- Headings: Inter 14px weight 500. **No display type anywhere** — Patternmode keeps headings at body size and earns hierarchy through spacing and rules, and so does this.
- Mono small-caps: verdict labels and table column headers only. Nowhere else.

## Components — shadcn/ui, new-york

Install into `apps/bench` with `components.json` matching Patternmode's: `style: new-york`, `rsc: true`, `baseColor: neutral`, `cssVariables: true`, `iconLibrary: lucide`.

Use: `button`, `input`, `select`, `checkbox`, `switch`, `badge`, `table`, `dialog`, `skeleton`, `tooltip`.

Map shadcn's variables onto the tokens above so the primitives inherit the house theme rather than shipping default neutral.

Do **not** use `card` for the contact sheet or the verdict band. Both are deliberately card-free.

## Layout

### `/` — composer

```
┌──────────────────────────────────────────────────────────────────┐
│ Motif Bench                                    23 models · fal   │
├────────────────────────────────────────────┬─────────────────────┤
│ Prompt                                     │ Recent              │
│ ┌────────────────────────────────────────┐ │ ─────────────────── │
│ │                                        │ │ 3 models  14:23     │
│ └────────────────────────────────────────┘ │ completed    $0.05  │
│                                            │ ─────────────────── │
│ Models                   5 of 23 selected  │ 2 models  14:18     │
│ Budget    ▢flux-fast ▢flux2-turbo ▢qwen    │ partial      $0.00  │
│ Standard  ▢seedream4 ▢ideogram ▢recraft    │                     │
│ Premium   ▢banana2 ▢gpt ▢gemini3           │                     │
│                                            │                     │
│ Samples 1   Parallel 1   1:1   1K          │                     │
│ Seed ▢ 42            Judge after ▣         │                     │
│ Stop above $2.00                           │                     │
│                                            │                     │
│ [Preview]                                  │                     │
│ ───────────────────────────────────────    │                     │
│ Model       Sends       Drops     Est      │                     │
│ flux-fast   square_hd   resltn    $0.0030  │                     │
│ grok-image  3:2         —         $0.0200  │                     │
│                                            │                     │
│ [ Run — $0.023 ]  ← accent, only fill      │                     │
└────────────────────────────────────────────┴─────────────────────┘
```

Model chips are `checkbox`-backed toggles: 1px border, `--color-surface-soft` when selected with an accent left edge. Tier labels sentence-case in `--color-muted` — not uppercase eyebrows.

### `/runs/[id]` — results

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Runs   "a well-lit modern living room…"     completed · mock   │
│ 3 models × 1 sample · 1:1 · 1K · $0.05                           │
├──────────────────────────────────────────────────────────────────┤
│  FASTEST     │  BEST QUALITY  │  CHEAPEST   │  BEST VALUE        │
│  1.53s       │  2.59          │  $0.0028    │  1087 pts/$        │
│  seedream4   │  seedream4     │  flux-fast  │  flux-fast         │
├──────────────────────────────────────────────────────────────────┤
│ ▓▓▓▓ dark plate ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│ ▓ ┌────────┐┌────────┐┌────────┐                               ▓ │
│ ▓ │        ││        ││        │  1px gutter, no radius        ▓ │
│ ▓ └────────┘└────────┘└────────┘                               ▓ │
│ ▓ flux-fast   grok-image  seedream4   ← mono, on plate         ▓ │
│ ▓ 3.12s       5.66s       1.53s                                ▓ │
│ ▓ $0.0028     $0.0200     $0.0300                              ▓ │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├──────────────────────────────────────────────────────────────────┤
│ Comparison                                                       │
│ Metric          flux-fast     grok-image    seedream4            │
│ Latency p50     3.12s         5.66s         1.53s ◂              │
│ Cost / image    $0.0028 ◂     $0.0200       $0.0300              │
└──────────────────────────────────────────────────────────────────┘
```

The plate bleeds to the container edge — it is a surface the images sit on, not a card. Verdict band: hairline rules between readouts, no boxes.

Mobile: single column, contact sheet 2-up, verdict band 2×2 keeping the rules.

## States

- **Generating:** `skeleton` at the frame's aspect on the plate. No spinner, no layout shift when the image lands.
- **Failed:** frame fills `--color-plate`, error code in mono `--color-bad`, one plain sentence. Never provider text.
- **Not judged:** `not judged` in `--color-plate-muted`. Never `—`, never 0.
- **Inconclusive:** `--color-warn` with the reason on hover. A real outcome, not an error.
- **Empty history:** "No runs yet. Pick a few models and preview a dry run — it costs nothing."
- **Contended** (parallel > 1) and **±3s** (gpt2 queue granularity) marks sit beside the affected latency, because those numbers aren't comparable to the rest.

## Abstraction rules

Visible (the user's objects): model alias, endpoint, dropped/coerced params, latency, cost, dimensions, error code, judge level.

Hidden or translated: workflow and step names, Mastra internals, span/trace ids (one "trace" link), table and column names, raw state enums (`partial` → "partial — some models failed").

## Complexity guardrails — countable

- **Zero** `box-shadow`.
- **Zero** `border-radius` on image frames.
- **At most 2** accent-filled elements per screen.
- **At most 4** type sizes per screen.
- **Zero** nested cards; zero `Card` around the contact sheet or verdict band.
- **Zero** `transition-all`.
- Every comparable number is mono + `tabular-nums`.
- Exactly **one** dark surface on the page: the image plate.

## Verification checklist

- [ ] Images sit only on `--color-plate`, never on paper or white.
- [ ] Chrome matches Patternmode: `#fbfbf9` ground, Inter 450/14px, `cv01 cv02 cv11` applied, `#315c4b` accent, 8px radius.
- [ ] Verdict band and contact sheet contain no card wrappers.
- [ ] Accent-filled elements ≤ 2 per screen.
- [ ] Contrast: ink on paper ≥ 12:1; muted ≥ 4.5:1; plate-ink on plate ≥ 11:1.
- [ ] Every status carries a text label, never colour alone.
- [ ] Focus ring visible on every control (accent, 2px offset).
- [ ] No layout shift when a sample resolves.
- [ ] Reduced-motion: skeleton shimmer becomes a static tint.
