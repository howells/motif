# Series

Series let you lock a visual style and generate multiple images that look like they belong together. Part of the [CLI agent guide](../AGENTS.md). The domain terms (Series, Series Run, Reference, Theme, Scene Prompt) are defined in [CONTEXT.md](../../../CONTEXT.md).

## Quick Start

```bash
# One-shot themed run: plan 6 cohesive images before spending credits
motif series run "brutalist architecture" --count 6 --dry-run --format json

# Create a series from a cover image
motif series create "Luna's Adventure" --from cover.png \
  --style "children's book, watercolor, soft pastels" -m banana -a 3:2

# Pin a house look and mood; the look also sets the model and aspect
# (flux2-pro, 3:2) because -m and -a are not given
motif series create "Kitchen Stories" --style "warm family kitchens" \
  --look lived-in --mood overcast

# Add character references
motif series ref-add luna-s-adventure character-luna.png --tag character -d "Luna front view"
motif series ref-add luna-s-adventure forest-clearing.png --tag location -d "Forest clearing"

# Generate with consistent styling (style prompt + refs auto-included)
motif series gen luna-s-adventure "Luna discovers a glowing mushroom in the forest clearing" \
  --refs character,location --dry-run

# After validating, generate for real
motif series gen luna-s-adventure "Luna discovers a glowing mushroom" --refs character,location

# View series state
motif series show luna-s-adventure
motif series history luna-s-adventure
```

## Stdin JSON

```bash
echo '{"command":"series-run","theme":"brutalist architecture","numImages":6,"dryRun":true}' | motif series --format json
echo '{"command":"series-generate","series":"luna-s-adventure","prompt":"Luna meets the fox","refs":"character"}' | motif series
echo '{"command":"series-create","name":"Kitchen Stories","creative":{"look":"lived-in","mood":"overcast"}}' | motif series --format json
```

## How It Works

1. **Series run** turns a theme into one shared style prompt and one scene prompt per requested image
2. **Pinned look and mood** are stored on the series as `look` and `mood`, shown by `series show` and `series list`, and added to every scene prompt in `series gen` and `series run`. A `--look` or `--mood` flag on gen or run replaces the pinned value for that call only (flag, then stdin `creative`, then the pinned value). The `--style` prompt still goes first as the prefix, then the scene, then the look and mood sentences. `series create` validates the pair with the same rules as `generate`, so a mood on a flat look fails with `INVALID_OPTION`. A look fills in the series' model and aspect only where `-m` or `-a` wasn't given; after that, gen and run use the series settings, not the look's. `--no-mood` on gen or run drops the pinned mood for that call. A `series run` without `--series` creates a Series that pins the look and mood the run used.
3. **Reference images** (tagged) are passed as `--edit` images to the model
4. **Outputs** are tracked per-series with full provenance (prompt, refs used, cost)
5. **Live series runs** reuse the first generated image as a style anchor for later images when the model supports references
6. **banana model** is recommended for series (14 reference images, best consistency)

## Series Invariants

- **Always `--dry-run` first.** Series generations cost real money.
- **Build refs before generating.** Style and character refs must exist before chapter illustrations.
- **Use `--refs` to select specific tags.** Don't send all refs if the model has a low limit.
- **banana supports 14 refs**, gpt supports 4, gemini/gemini3 support 4.
- Series data stored in `~/.motif/series/<slug>/`.

## All Series Commands

```bash
motif series create <name> [--from <img>] [--style <prompt>] [--look id] [--mood id] [-m model] [-a aspect] [-r res]
motif series list
motif series show <slug>
motif series ref-add <slug> <image> [-t tag] [-d description]
motif series ref-remove <slug> <filename>
motif series gen <slug> "prompt" [--refs tags] [--look id] [--mood id] [--dry-run] [-m model] [-a aspect] [-o output]
motif series run "theme" [--count n] [--series slug] [--refs tags] [--look id] [--mood id] [--dry-run] [-m model] [-a aspect]
motif series history <slug> [--limit n] [--offset n]
motif series delete <slug>
```
