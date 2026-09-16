# Series

Series keep a visual style and generate several images that look like they belong together. Part of the [CLI agent guide](../AGENTS.md). The domain terms (Series, Series Run, Reference, Theme, Scene Prompt) are defined in [CONTEXT.md](../../../CONTEXT.md).

## Quick start

```bash
# One-shot themed run: plan six images before spending credits
motif series run "brutalist architecture" --count 6 --dry-run --format json

# Create a series from a cover image
motif series create "Luna's Adventure" --from cover.png --style "children's book, watercolour, soft pastels" -a 3:2

# Pin a house look and mood; the look also sets the aspect (3:2) because -a isn't given
motif series create "Kitchen Stories" --style "warm family kitchens" --look lived-in --mood overcast

# Add tagged references
motif series ref-add luna-s-adventure character-luna.png --tag character -d "Luna front view"
motif series ref-add luna-s-adventure forest-clearing.png --tag location -d "Forest clearing"

# Generate with the style prompt and references included
motif series gen luna-s-adventure "Luna discovers a glowing mushroom in the clearing" --refs character,location --dry-run

# Inspect
motif series show luna-s-adventure
motif series history luna-s-adventure
```

## Stdin JSON

```bash
echo '{"command":"series-run","theme":"brutalist architecture","numImages":6,"dryRun":true}' | motif series --format json
echo '{"command":"series-create","name":"Kitchen Stories","creative":{"look":"lived-in","mood":"overcast"}}' | motif series --format json
```

## How it works

1. **A series run** turns a theme into one shared style prompt and one scene prompt per image.
2. **A series has no Model of its own.** Each generation chooses one the way `generate` does: a look's Model, else a pinned `tasks.generate.model` in config, else the ranking. `series run` takes `--tier`; `series gen` and `series run` take `-m` to override.
3. **Pinned look and mood** are stored on the series and added to every scene prompt in `series gen` and `series run`. A `--look` or `--mood` flag on gen or run replaces the pinned value for that call. The `--style` prompt goes first, then the scene, then the look and mood sentences. `series create` validates the pair with the same rules as `generate`, so a mood on a flat look fails with `INVALID_OPTION`. `--no-mood` on gen or run drops the pinned mood for that call. A `series run` without `--series` creates a Series that pins the look and mood the run used.
4. **References** (tagged) are passed to the Model as references. Several references rule out Models that can't take that many.
5. **Outputs** are tracked per series with the prompt, references used and cost.
6. **Live runs** reuse the first image as a style anchor for later images when the Model takes references.

## Rules

- **Dry-run first.** Series generations cost real money.
- **Add references before generating** the images that depend on them.
- **Use `--refs` to pick tags** rather than sending every reference.
- Series data lives in `~/.motif/series/<slug>/`.

## All series commands

```bash
motif series create <name> [--from <img>] [--style <prompt>] [--look id] [--mood id] [-a aspect] [-r res]
motif series list
motif series show <slug>
motif series ref-add <slug> <image> [-t tag] [-d description]
motif series ref-remove <slug> <filename>
motif series gen <slug> "prompt" [--refs tags] [--look id] [--mood id] [--no-mood] [-m model] [-a aspect] [-r res] [-n count] [-o output] [--dry-run]
motif series run "theme" [--count n] [--series slug] [--style prompt] [--refs tags] [--look id] [--mood id] [--no-mood] [--tier tier] [-m model] [-a aspect] [-r res] [--dry-run]
motif series history <slug> [--limit n] [--offset n]
motif series delete <slug>
```
