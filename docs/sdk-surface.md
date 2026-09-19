# SDK surface and architecture

Dependencies flow toward `packages/motif-sdk`. Never import CLI, local history or filesystem helpers into the SDK: fal endpoint normalisation and model metadata live in the SDK, and local paths, downloads, history and terminal UX live in `apps/cli`.

## The documented API

`createMotif(config?)` from `@howells/motif-sdk` returns one function per Task (`generate`, `erase`, `upscale` and the rest), plus `plan(task, input)` to resolve the Model, build the request and price it without I/O, and `run(task, input)`. Every call returns a `Result<TaskOutput, MotifError>` carrying `model`, `tier`, `chosenBy`, `files` and `cost`.

Task data: `TASKS` (summary, notFor, modes and ranked Models with Tiers per Task), `TASK_IDS`, `TIERS`, and `resolveTask`, the pure function that chooses a Model. `FalClient`, `MODELS`, `FAL_TOOLS` and the other model-keyed exports are no longer exported.

`@howells/motif-sdk/image` is an ESM-only subpath. Its `createMotifImage(config?)` carries provider requests (`generate()`, `edit()`) over google, openai, replicate and fal with per-call cost tracking, and chooses no Models.

## Keys

`FAL_KEY` is the primary public variable, used by `createMotif` and the CLI. The CLI can also read `apiKey` from `~/.motif/config.json`; environment values win.

`@howells/motif-sdk/image` reads one key per adapter: `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENAI_API_KEY`, `REPLICATE_API_TOKEN` and `FAL_KEY`. Each is optional per call, only the key for the provider in use is required, and each falls back from a `MotifImageConfig` override to the environment variable.

## Discovery

`README.md`, `llms.txt`, `apps/cli/docs/`, `docs/security.md`, and `docs/surface/`, which is historical and predates Tasks replacing models.
