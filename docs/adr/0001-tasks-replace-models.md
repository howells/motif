# 0001. Tasks replace models as the public API

Motif's public surface (CLI verbs, `--describe` and the SDK exports) is organised by Task (erase, reframe, upscale, relight), and Motif chooses the Model behind each one: the highest-ranked Model that can do what the request asks for, at the chosen Tier, without reading the prompt.

Users and agents had to know fal's catalogue to use Motif, models churn faster than tasks, and the same job was reachable several ways under different model names. Rejected: a Task API alongside model-keyed exports (two ways to do everything, model names keep leaking), a CLI-only task layer (the SDK owns model metadata, so the ranking must live there), a `motif tool` escape hatch listing raw fal endpoints, and routing on prompt content (the same command could pick different Models, so results are hard to explain or repeat).

Consequences:

- The resolved Model is recorded in JSON output and history so a run can be repeated, costed and varied, but is absent from the CLI's human output and help, and from the homepage. `--model` is the only way to name one. The docs may list the Models behind a Task with their prices, and the App and Bench may show the Model a run used.
- Rankings are data in the SDK, hand-ranked from price and quality unless a bench comparison sets the order. A ranking change ships as a minor release, so outputs can change on upgrade; `--model` or a pinned Model in config holds them steady.
- Options any capable Model can honour (ratio, count, seed, transparency, References, mask, negative, output format) are Task options, and quality knobs fold into `--tier`. Model-only options are accepted only with an explicit Model, through `--param key=value`.
- Providers in the image layer only carry requests; Task resolution is the one place a Model is chosen.
- `sheet`, `series`, `history`, `last`, `describe` and `studio` are commands but not Tasks, because none chooses a Model.
