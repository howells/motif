# @howells/motif-cli

Images and video through fal.ai, by task. Say what you want done and Motif chooses the Model that does it best at the Tier you ask for. Every call can be priced with a dry run before it spends anything.

## Install

```bash
npm install -g @howells/motif-cli
export FAL_KEY="your-fal-key"
```

## Quick start

```bash
motif "a ceramic desk lamp on an oak desk" --dry-run    # choose the Model and price it
motif "a ceramic desk lamp on an oak desk"              # make it
motif "a ceramic desk lamp" --tier fast --dry-run        # a cheaper, quicker choice
motif erase "the cable" lamp.png                         # take something out
motif upscale lamp-erase.png --scale 2                   # make it larger
```

`--tier fast|balanced|quality` moves the choice; the default is `balanced`. Run `motif` with no arguments for help, and `motif <verb> --help` for one Task.

## For agents

```bash
motif --describe tasks --format json   # task words mapped to verbs, and what to use instead
motif --describe --format json         # full schema: Tasks, looks, moods, errors
```

Add `--format json` to any command for structured output. The guide ships with this package: [AGENTS.md](AGENTS.md), and every verb's modes, flags and examples are in [docs/verbs.md](docs/verbs.md).
