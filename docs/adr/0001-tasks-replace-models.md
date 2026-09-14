# Tasks replace models as the public API

Motif's public surface - CLI verbs, `--describe` and the SDK exports - is organised by **Task** (erase, reframe, upscale, relight), and Motif chooses the **Model** behind each one: the highest-ranked Model that can do what the request asks for, at the chosen **Tier**, without reading the prompt. We chose this over keeping model-keyed exports because users and agents had to know fal's catalogue to use Motif, models churn faster than tasks, and the same job was reachable several ways under different model names.

## Considered Options

- **Task API alongside the model-keyed exports.** Rejected: two ways to do everything, and the model names would keep leaking through the second one.
- **A CLI-only task layer.** Rejected: the SDK owns model metadata, so the ranking has to live there for both surfaces to agree.
- **`motif tool` kept as an escape hatch.** Rejected: it lists 74 fal endpoints by model name. Every useful endpoint becomes a Task or an option of one, and `--model` on that Task is the only way to name a Model.
- **Routing on prompt content.** Rejected: the same command could pick different Models, which makes results hard to explain or repeat.

## Consequences

- A major version of both packages. `FalClient`, `MODELS`, `FAL_TOOLS` and the other model-keyed exports go.
- The resolved Model is still recorded in JSON output and history, so a run can be repeated, costed and varied. It is absent from human output, help and docs.
- `--rmbg`, `--up` and `--vary` become verbs (`cutout`, `upscale`, `vary`), which breaks scripts that use the flags.
- A Task accepts a video input where a video Model exists, instead of video getting separate commands.
- Rankings are data in the SDK. Bench comparisons set the order where they exist; other Tasks are hand-ranked from price and quality, marked as such, until the bench covers them.
- A ranking change ships as a minor release, so outputs can change on upgrade. `--model` or a pinned Model in config holds them steady.
- Options any capable Model can honour (ratio, count, seed, transparency, References, mask, negative, output format) are Task options, and `--quality`, `--rendering-speed` and `--thinking` fold into `--tier`. Model-only options, such as Recraft styles or FLUX steps, are accepted only with an explicit Model, through `--param key=value`.
- `--quality` values finer than the Tiers, such as GPT's `xhigh`, survive only as `--param quality=...` with `--model`.
- The image layer's per-provider tier maps (`GOOGLE_TIER_MODELS` and the rest) go. Its providers only carry requests; Task resolution is the one place a Model is chosen.
- A Series has no Model of its own; the pin that holds any other result steady holds a Series too.
- `sheet`, `series`, `history`, `last`, `describe` and `studio` stay commands but are not Tasks: none chooses a Model.
