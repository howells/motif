# Design spec — Motif Bench, app shell

**Supersedes the layout half of `design-bench.md`.** The Patternmode theme (warm
paper, Inter 450, forest accent, mono numerics, dark image plate) is unchanged
and still canonical. This spec replaces the *structure*: two scrolling
documents become one app shell.

## The problem, named

The current build is a **web page pretending to be a tool**:

1. **The document scrolls.** Picking models scrolls the Run button off-screen;
   reading the comparison table scrolls the images away. You can never see the
   thing you are choosing and the thing you are choosing it with at the same
   time.
2. **Configuring and reading are separate pages.** `/` composes, `/runs/[id]`
   reports. Changing one setting and re-running means a full round trip, and
   you cannot see the previous result while setting up the next.
3. **The model picker dominates.** 24 chips in three tiers is the largest
   element on screen for a decision made once, while the prompt — the actual
   subject of the experiment — is one field above it.
4. **Preview is a wall.** A dry-run table you must scroll past to reach Run.
5. **History is invisible from a run.** A tool for comparing runs offers no way
   to move between them.

## The shape

**One screen. Three regions. The document never scrolls.**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Motif Bench   [ a well-lit modern living room…            ]  [Run ▸] │ 56px, fixed
│               12 models · 1:1 · 1K · ~$0.42          Models ▾        │
├───────────────┬──────────────────────────────────────────────────────┤
│ RUNS          │  fastest 1.3s   cheapest $0.003   best ★4.2          │ 64px, fixed
│               │  flux-fast      flux-fast         banana2            │
│ ● 24 models   ├──────────────────────────────────────────────────────┤
│   2m · $1.13  │ ▓▓▓ dark plate ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│               │ ▓ ┌────┐┌────┐┌────┐┌────┐┌────┐                  ▓ │
│   23 models   │ ▓ │    ││    ││    ││    ││    │                  ▓ │ scrolls
│   1h · $1.13  │ ▓ └────┘└────┘└────┘└────┘└────┘                  ▓ │ (its own
│               │ ▓ flux-fast  grok  seedream4  qwen  gpt           ▓ │  frame)
│   2 models    │ ▓ 1.3s ★★★★  6.8s  9.5s ★★★   6.0s  34s           ▓ │
│   3h · $0.02  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
│               ├──────────────────────────────────────────────────────┤
│ scrolls       │ Images · Table · Cost/quality           ← tabs        │ 40px, fixed
└───────────────┴──────────────────────────────────────────────────────┘
```

- **Top bar (fixed, 56px):** the prompt is the hero — a single wide field. The
  primary action sits beside it and is *always reachable*. The run's shape
  (`12 models · 1:1 · 1K · ~$0.42`) is a live summary line, and `Models ▾`
  opens the picker as a popover, not a page section.
- **Left rail (fixed width 220px, scrolls independently):** every run, newest
  first. Selecting one loads it into the main pane without leaving the screen.
  This is what makes it a *bench* rather than a form.
- **Main pane:** verdicts pinned at the top (they are the answer), contact
  sheet filling the rest inside its own scroll frame. Table and scatter move
  behind tabs — they are secondary readings of the same data and should not
  push the images off-screen.

## Why this is simpler, not just different

- Run is always one click away, from any state.
- Changing a setting and re-running never leaves the results you are comparing
  against — the previous run stays in the rail, one click back.
- The images — the actual output — get the largest region on screen, which was
  never true before.
- The model picker stops being the visual subject. Default selection is the
  **five cheapest models** so a first-time user can press Run immediately and
  spend under a penny.
- Preview stops being a wall: the cost estimate lives in the summary line and
  updates live. The dry-run detail moves inside the Models popover, where the
  decision it informs actually happens.

## Structure rules — countable

- `html, body { overflow: hidden; height: 100% }`. **The document must never
  scroll.** Exactly three scroll containers exist: the runs rail, the contact
  sheet, and (when its tab is active) the table pane.
- Every scroll region is a `ScrollFrame` from `@patternmode/scrollframe`
  (2.0.1, on npm) with measured edge fades — so a partially-scrolled pane reads
  as continuing rather than ending.
- Fixed regions: top bar 56px, verdict strip 64px, tab bar 40px, rail 220px.
  Everything else is `1fr` and clips.
- **Zero page-level `<Section>` stacking.** The old vertical rhythm of stacked
  full-width sections is what made it a document; it does not survive.

## Interaction

- `⌘K` focuses the prompt. `⌘↵` runs. `Esc` closes the models popover or the
  lightbox. Keyboard-first is the difference between a tool and a form.
- Selecting a run in the rail swaps the main pane and updates the URL
  (`/runs/[id]` still works as a deep link, but is no longer a separate layout).
- A running run streams into the contact sheet in place — frames fill as
  samples land, no navigation, no full-pane spinner.
- Tabs (`Images · Table · Cost/quality`) swap the *lower* region only; verdicts
  stay pinned, because they are the answer to the question the tool exists for.

## States

- **No runs yet:** rail shows one line — "No runs yet." The main pane shows the
  prompt hint and the default five models, so the first action is obvious and
  costs under a penny.
- **Running:** the rail entry shows a live count (`7 of 24`); frames fill in
  place; Run becomes `Running…` and is disabled.
- **Failed sample:** the frame carries its error code and one plain sentence,
  in place, same size as a success. A failure is a result, not an absence.
- **Not rated:** star row is empty and interactive; the quality verdict reads
  "rate some images" rather than a zero.

## Guardrails — countable

- **Zero** document-level scrollbars at any viewport ≥ 768px.
- **Exactly 3** scroll containers, all `ScrollFrame`.
- **Zero** `<Section>` wrappers in the run view.
- **At most 2** accent-filled elements on screen (Run, best-in-row marks).
- **Zero** `box-shadow` outside shadcn primitives.
- Every comparable number mono + `tabular-nums`.
- Contact sheet frames stay fixed 240px (160px below `sm`) — unchanged.

## Mobile (< 768px)

The shell collapses to a single column: top bar, verdict strip, contact sheet.
The rail becomes a sheet behind a `Runs` button. Document scroll is *permitted*
below 768px — a phone has no room for independent panes, and fighting that is
worse than allowing it.

## Verification checklist

- [ ] `document.documentElement.scrollHeight === clientHeight` at 1440×900.
- [ ] Run button visible in every state without scrolling.
- [ ] Switching runs in the rail never navigates away or loses scroll position
      in the rail itself.
- [ ] Contact sheet scrolls while verdicts stay pinned.
- [ ] `⌘↵` runs from anywhere; `Esc` closes overlays.
- [ ] Default selection is the five cheapest models and the summary line reads
      under $0.01 before any change.
- [ ] Deep-linking `/runs/[id]` loads the shell with that run selected.
