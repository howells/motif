# @howells/motif-cli

Agent-first fal.ai CLI with structured output, dry runs, stdin JSON, local history, series, utility tools, and terminal Studio.

## Install

```bash
npm install -g @howells/motif-cli
```

## Agent Entry Points

The agent guide ships with this package: [`AGENTS.md`](AGENTS.md), with reference pages in [`docs/`](docs/). Start there before driving the CLI.

```bash
motif --help                           # every command, listed by task
motif --describe tasks --format json   # when to use each command, and what to use instead
motif --describe --format json         # full schema: models, looks, moods, errors
```

Pick the command that names the task. Each one makes the right fal call, opens what it writes, and puts the saved path at the top level of its JSON.

```bash
motif "prompt" --model banana2 --dry-run --format json   # make an image; price it first
motif "prompt" --look editorial --dry-run --format json  # a house look picks its own model
motif erase "the car" street.png --dry-run --format json # remove an object and fill the gap
motif reframe --og photo.png --dry-run --format json     # extend the canvas to a new ratio
motif segment "shoe" ./image.png --dry-run --format json # cut out or mask a named thing
motif ask "how many chairs?" room.png --format json      # caption, count or ask about an image
motif sheet a.png b.png c.png --format json              # captioned contact sheet
motif series run "theme" --count 6 --dry-run --format json
```

Anything a command doesn't cover is in `motif tool list`.

## Package Development

```bash
pnpm --filter @howells/motif-cli test
pnpm --filter @howells/motif-cli typecheck
pnpm --filter @howells/motif-cli build
```

See `apps/cli/AGENTS.md` for the detailed agent integration guide.
