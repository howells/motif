# @howells/motif-sdk

## 7.4.1

Released alongside `@howells/motif-cli` 5.4.1.

### Patch Changes

- `maxReferences` now matches what each provider documents: Nano Banana 2 takes 14 references (was 4), GPT Image 1.5 takes 16 (was 4), Grok Imagine Image 2.0 takes 5 (was 3), and FLUX.2 Pro takes 9 (was 10).

## 7.4.0

Released alongside `@howells/motif-cli` 5.4.0.

### Minor Changes

- `resumePlan` collects a queued run from the plan it was made with, and `runsQueued` says whether a run will queue.
- `onSubmitted` reports the request id as soon as fal accepts a queued run.
- A request fal has no record of, or whose result has expired, returns `REQUEST_NOT_FOUND`. A job fal reports as failed carries `details.jobFailed`.

### CLI 5.4.0

- `motif resume <requestId>` collects a queued run fal accepted and finishes it as the original command would: same file names, history and output. `motif resume` alone lists the runs waiting. A queued run that fails after fal accepts it now suggests the exact `motif resume` command.
- Runs waiting to be collected are kept in `~/.motif/pending`, without image data, and removed once saved. Ephemeral runs, synchronous runs, Series scenes and Studio runs are not kept.
- New error codes: `PENDING_RUN_NOT_FOUND` and `REQUEST_NOT_FOUND`.
- `--describe` derives every command's input from the options the command really takes, so `vary` lists `markup` and `generate` lists `negativePrompt`, `outputFormat` and `preset`. Each command carries `cli` (synopsis, options and subcommands), and `common_options` lists what every Task verb shares.
- `--describe` text is no longer passed through the prompt filter, which printed `[FILTERED]` in `animate`'s usage.
- `motif generate --help` shows `motif generate [options] [prompt]` and no longer lists `--version`.

## 7.3.0

Released alongside `@howells/motif-cli` 5.3.0.

### Minor Changes

- An option is now either sent in a form the endpoint accepts or refused with what the Model does take; it is never dropped or sent out of range. This covers output format, scale, count, seed, aspect, resolution and `params`.
- Ranked selection asks the planner whether each Model can carry the request, so a request falls through to the next ranked Model that can do it instead of failing on the first. An explicit, Look or pinned Model is still refused, never swapped. Default choices are unchanged.
- PNG is the default output format for every image Model that takes a format. Thirteen tool Models that returned JPEG by default (the Topaz upscalers and restorers, `seedvr-upscale`, `flux-outpaint`, `iclight-v2`, `ideogram-tiling`, `text-removal`) now return PNG. Pass `outputFormat` for anything else.
- An edit with no `aspect` follows its source: `auto` where the Model takes it, otherwise the nearest ratio it can make. It used to come back square on most Models.
- An explicit `resolution: "2K"` is honoured or refused like any other resolution. It was silently ignored on Models that have one size.
- `transparent` sends PNG, and is refused with an opaque format.
- `gpt` takes only `auto`, `1:1`, `3:2` and `2:3`; other aspects were rounded to one of its three sizes.
- Upscale factors are checked against each endpoint's range: 1 to 4 on Topaz and Clarity, 1 to 10 on SeedVR, 1 to 200 on Crystal. Count is checked against each generation Model's maximum, and Sunburst and Flare make one image at a time as SVG.
- `segment` needs a prompt or boxes; it used to run on the endpoint's own default subject. Pixel boxes are checked against the source size.
- `layers` on `seedream-layerize` sends the endpoint's own size names; `aspect` other than `auto` is refused there.
- `params` on tool Models are checked against the endpoint's parameters: unknown keys and wrong types are refused. A `params` key cannot set a field a Task option owns (`num_images`, `aspect_ratio`, `resolution`, `output_format`, `seed`, `image_size`) past that option's limits, and `num_images` is refused in favour of `count`.
- Crystal is priced at $0.016 per megapixel of output, as fal bills it, in place of a flat $0.02.
- A run or queue submission is attempted once. A timeout, connection error or 5xx on it returns `SUBMISSION_UNCERTAIN`, because fal may have accepted and billed it; it used to be retried up to three times. Polling and result fetches still retry.
- A response that is not valid JSON returns `INVALID_RESPONSE` instead of throwing. Every failure after fal accepts a run carries `requestId` and `endpoint`.
- `estimateCost` throws for an unknown Model, or one with no per-image price, instead of returning a guessed $0.10 per image.
- `plan()` results carry `size`, the exact pixels requested when Motif knows them. `modelProfile()` carries `sizing`, `maxCount` and `scaleRange`.
- `plan().queued` says whether the Model always queues. It no longer reflects `onProgress` or `onSubmitted`; `run` behaves as before.
- `FORMAT_PRESETS` gains `feed`, `reel`, `wallpaper` and `ultra`, and each preset carries a `description`. New exports: `FormatPreset`, `refusedOption`, `SUBMISSION_UNCERTAIN`, `INVALID_RESPONSE`. `FalToolPrice` gains the `output-second` kind.

### CLI 5.3.0

- Nothing opens in a viewer unless `--open` is passed. `--no-open` is removed and fails as an unknown option, the stdin field `noOpen` is replaced by `open`, and the `openAfterGenerate` config key is ignored. `--no-open` never worked on `series`.
- `motif series` reads its arguments only. The stdin JSON form (`{"command":"series-run",...}` and the other `series-*` commands) is removed, along with the wait on stdin that could hang a `series` command under `execFile`.
- An unusable `config.json`, `.motifrc`, `history.json` or `series.json` fails with `CORRUPT_FILE` (exit 2) and is left untouched. These files used to be replaced with defaults or an empty history on the next write. An unreadable one fails with `FILE_ACCESS_FAILED`.
- History and Series files are checked before a paid request, not after. If recording fails after a run, the result is still printed, with `historyRecorded: false` and a `historyFailure`.
- `series run` plans every scene before the first request and refuses the run if any scene cannot be made. It records history after each scene, so a failed run keeps the scenes already paid for, and every scene is requested at the same size. Its dry run reports each scene's Model and size.
- When more than one file comes back, each is saved under its own name; a batch could overwrite itself. If some files fail to save, the rest are kept and recorded, and `FILES_NOT_SAVED` lists each failure with its URL and the request id.
- A file is never written over another that the command did not name, output directories are checked before spending, and an output path cannot leave the output root through a symlink.
- `-o out.jpg` or `-o out.webp` asks the Model for that format, and is refused if the Model cannot make it. It used to save PNG bytes under a renamed file.
- Dry runs report `size`. `--describe` rankings report `sizing`, `maxCount` and `scaleRange` per Model. Runs report `requestId`.
- `--limit` and `--offset` reject values that are not whole numbers.
- `series gen --resolution 2K` sends the resolution, as `series run` does.
- Studio applies a key or setting saved in Settings straight away, and no longer copies project `.motifrc` values into `~/.motif/config.json`. It always opens results. Upscale and cutout files are named `-upscale` and `-cutout`, as the commands name them.
- New error codes: `CORRUPT_FILE`, `FILE_ACCESS_FAILED`, `FILES_NOT_SAVED`, `SUBMISSION_UNCERTAIN`, `INVALID_RESPONSE`.

## 7.2.0

Released alongside `@howells/motif-cli` 5.2.0.

### Minor Changes

- Sunburst and Flare (GPT Image 2.6) take `resolution`. `image_size` is now an exact `{ width, height }` for the aspect at that resolution, inside fal's limits, instead of a 1024px preset such as `landscape_4_3`. A resolution above the limits gives the largest size in the ratio: `4:3` at `4K` is 3264×2448. The default is 2K, so default output is larger and costs more.
- An edit on Sunburst or Flare with `resolution` but no `aspect` throws, because it is sized from its source image.

## 7.1.0

Released alongside `@howells/motif-cli` 5.1.0.

### Minor Changes

- `ModelProfile` carries the Model's display `name`, e.g. `GPT Image 2.6 Sunburst`.
- Arena benchmarks for Sunburst and Flare carry a `note`: the scores were measured on GPT Image 2.5, and Motif runs GPT Image 2.6, which Arena has not scored yet.

## 7.0.0

Released alongside `@howells/motif-cli` 5.0.0.

### Major Changes

- Remove the retained predecessor Models: `gemini`, `gemini3`, `seedream4`, `seedream45`, `flux2-max`, `flux2-dev`, `flux`, `flux-fast`, `recraft`, `recraft4`, `ideogram` and `qwen`, along with the unranked `reve`. Pins, Looks and calls that name them now fail with `UNKNOWN_MODEL`. `LEGACY_GENERATION_MODELS`, `UTILITY_MODELS`, `VIDEO_MODELS`, `RECRAFT_STYLES` and `IDEOGRAM_STYLES` are gone, and `GenerationModelName` is the curated Models only.
- The `portrait` Look runs on Seedream 5 Pro (`seedream5`).
- Only `gpt` streams; `flux2-dev` streamed before.
- Remove the `enhancePrompt`, `imagePromptStrength`, `raw` and `style` generation options and their `ModelConfig.supports*` flags: no remaining Model accepts them.
- Remove the pre-Task direct methods `upscale`, `removeBackground`, `submitVideo` and `getVideoResult` from the internal `FalClient`, with their option types, and the `rmbg` and `bria` registry entries.
- The image layer's fal price table no longer prices the removed Models' endpoints (`fal-ai/flux-pro/v1.1-ultra`, `fal-ai/flux/schnell`, `fal-ai/flux-2-max`, `fal-ai/flux-2`, `fal-ai/gemini-25-flash-image`, `fal-ai/gemini-3-pro-image-preview`, Seedream 4 and 4.5, Recraft v3 and v4, Ideogram v3, `fal-ai/qwen-image`); their cost reports as unknown.
- Ticket ids no longer appear in `TASKS.generate.basis` and `TASKS.vary.basis`.

### Minor Changes

- Add the `@howells/motif-sdk/registry` subpath: `MODELS`, `FAL_TOOLS`, `isFalToolId`, `FAL_PRESET_SIZES`, `estimateCost` and their types, for callers that show or price Models themselves.

### CLI 5.0.0

- Flags and commands from before Tasks (`--rmbg`, `--up`, `--vary`, `--video`, `enhance`, `tool` and the rest) no longer get a `REMOVED_COMMAND` error naming their replacement; they fail like any unknown option, with `INVALID_OPTION` and exit `2`. `REMOVED_COMMAND` is gone from the error catalogue.
- Config written before Tasks (`defaultModel`, `upscaler`, `backgroundRemover`) is no longer migrated, and history files without unknown-cost counts are no longer filled in.

## 6.0.0

Released alongside `@howells/motif-cli` 4.0.0.

### Major Changes

- Remove `gpt2` (GPT Image 2). Sunburst and Flare rank above it on every board at the same token price. Pins, Looks and calls that name `gpt2` now fail with `UNKNOWN_MODEL`; use `sunburst` or `flare`.
- The Task client runs on fal only. The OpenAI transparency route is gone, with `ModelConfig.transparencyRoute`, `ProviderRoute`, `MotifClientConfig.openAiKey` and `getOpenAiKeyFromEnv`. `TaskPlan.provider` is always `"fal"`. Transparent output at `quality` runs on Sunburst through fal.
- The `illustration` Look runs on Flare.
- The image layer (`@howells/motif-sdk/image`) keeps its OpenRouter, OpenAI, Replicate and fal providers.

## 5.4.0

Released alongside `@howells/motif-cli` 3.3.0.

### Minor Changes

- Sunburst and Flare run GPT Image 2.6 on fal (`openai/gpt-image-2.6/{sunburst,flare}/text-to-image` and `/edit`), with animated GIF and SVG output and `markup`. GPT Image 2.5 is no longer routed.
- `xhigh` and `max` are sent as fal's `quality`, matching its 2.6 schema; Motif no longer sends `reasoning_effort`. `ModelConfig.supportsReasoningEffort` is removed.
- The direct OpenAI image layer documents `gpt-image-2.6-flare` and `gpt-image-2.6-sunburst`.

## 5.2.0

Released alongside `@howells/motif-cli` 3.1.0, the first CLI release on the 5.x SDK.

### Minor Changes

- Refresh image curation from the 7 October 2026 Artificial Analysis v2 snapshot and Arena's 6 October results. Generation now recommends 21 Models: add Nano Banana 2.1 (`banana21`) and MAI Image 2.5 (`mai-image-2.5`), and archive 12 predecessors from automatic selection while retaining explicit Models, pins, history reuse and existing Looks.
- Use separate generation and editing rankings. Generation with References follows the editing order. Quality starts with Sunburst at the benchmarked `max` setting, balanced starts with Nano Banana 2.1 on preliminary Arena evidence, and fast starts with Banana Lite for generation or Grok for editing. Flare also defaults to `max`; explicit quality overrides remain available.
- Enable Banana Lite's verified edit route. Nano Banana 2.1 supports 14 References and 1K/2K/4K output, with no 0.5K output. Token-billed Banana 2.1, Lite and MAI 2.5 plans report unknown total costs.
- Refresh leaderboard metadata and remove stale or unverified family scores. The [curation audit](https://github.com/howells/motif/blob/main/docs/research/image-model-curation-2026-10-07.md) records all rankings, specialist exceptions and provider coverage gaps.

## 5.0.0 to 5.1.1

### Major Changes

- The house looks are reset from twelve to nine. Each of the twelve was lifted from one client's work, so the taste carried subjects most callers will never ask for. The register is unchanged: quiet, material, shot on film, generous with space.
- Renamed, same clause and defaults: `lived-in` is now `interior`, `plate` is now `surface`. `canvas` is now `abstract` and is the painting itself rather than one hung on a wall, at 3:2 instead of 3:4. `drawing` is now `illustration` and no longer says "of the room", so it draws any subject.
- `architectural` keeps its id, aspect and Model but now photographs a building from outside with its setting, rather than a room with one product installed in it.
- Removed: `homeowner` (a deliberately unstyled phone snapshot), `engraved` (grey-ink botanical plates) and `ephemera` (1940s printed matter). `ephemera` was the only look that permitted lettering; for type in the picture, override the Model with `-m ideogram4`.
- The flat looks that refuse a mood are now `object`, `surface`, `abstract` and `illustration`. `illustration` carries `experimental: true`; no other look does.
- Every look's Model can now edit, so vary honours all nine. `resolveTask` still falls back to the ranking for a Look whose Model a Task doesn't offer; no look reaches that branch today.

### Patch Changes

- Dependencies updated to latest, including `ai` 7.0.113 and the `@ai-sdk/*` providers. Image cost and request id are read from each model call (`result.calls`) instead of the aggregate fields the AI SDK has deprecated; provider-reported costs across calls are summed.

## 4.0.0

Released alongside `@howells/motif-cli` 3.0.0: "tasks replace models" (ADR 0001, MOT-63). Callers name a Task and Motif chooses the Model.

### Major Changes

- Requires Node.js 22.12 or newer (`engines`), since the CommonJS entry loads the ESM-only `ai` package through `require`.
- The public index no longer exports the per-model registry or the fal client (MOT-54); run Tasks through `createMotif` instead. Removed: `FalClient`, `FalClientConfig`, `MODELS`, `GENERATION_MODELS`, `GenerationModelName`, `EDIT_CAPABLE_MODELS`, `UTILITY_MODELS`, `VIDEO_MODELS`, `RECRAFT_STYLES`, `IDEOGRAM_STYLES`, `IMAGE_TEXT_TO_IMAGE_TOP_20`, `IMAGE_EDITING_TOP_20`, `VIDEO_TEXT_TO_VIDEO_TOP_15`, `VIDEO_IMAGE_TO_VIDEO_TOP_15`, `LeaderboardEntry`, `LeaderboardSnapshot`, `FAL_TOOLS`, `FAL_TOOL_IDS`, `FAL_TOOLS_CHECKED_AT`, `FAL_TOOL_PARAMETERS`, `falToolParameters`, `isFalToolId`, `buildFalToolRequest`, `FalToolConfig`, `FalToolId`, `FalToolInputKind`, `FalToolPrice`, `FalToolRequest`, `FalToolRunOptions`, `FalToolParameter`, `buildGenerateBody`, `estimateCost`, `estimateVideoCost`, `projectedToolCost`, `measuredToolCost`, `MODEL_OUTPUT`, `modelOutput`, `describeModelOutput`, `losslessAvailability`, `LosslessAvailability`, `ModelOutputShape`, `OPTION_CAPABILITIES`, `supportedOptions`, `modelsSupporting`, `ModelOption`, `UnsupportedOptionError`, `aspectToFalImageSize`, `aspectToGptSize`, and the types `ModelConfig`, `ModelType`, `ProviderRoute`, `GenerateOptions`, `MotifResponse`, `MotifImage`, `QueuedJob`, `QueuedToolJob`, `JobStatus`, `UpscaleOptions`, `RemoveBackgroundOptions`, `VideoOptions`, `VideoResponse`, `ToolRunOptions`, `ToolResponse`, `ImageSize`, `ImageQuality`, `ImageOutputFormat`, `BackgroundMode`, `SizeMode`, `ThinkingLevel`, `GptImageSize` and `FalImageSizePreset`. `ModelProfile` is now exported.
- `@howells/motif-sdk/image` no longer chooses a model. `tier` and the `ImageTier` type are gone from `generate()` and `edit()`, `model` is required, and `GOOGLE_TIER_MODELS`, `OPENAI_TIER_MODELS`, `REPLICATE_TIER_MODELS` and `FAL_TIER_MODELS` are no longer exported. Task resolution is the one place a Model is chosen.

### Minor Changes

- Add the Task registry, `TASKS`, placing every existing Model in one of 19 Tasks: animate, ask, cutout, erase, generate, layers, map, material, mesh, reframe, relight, restore, restyle, segment, tile, try-on, upscale, vectorize and vary. `sam3-3d-align` is not placed.
- A Task can have modes (`TaskMode`), named variants a caller asks for, such as erasing text or restoring colour. A ranked entry can declare a mode, capabilities it adds for that Task (`supports`) and inputs it needs (`requires`, such as a mask). `TaskRequest.mode` selects one; an unknown mode is refused with `blockedBy: "mode"`.
- Each Task ranks its Models best-first as data, tagged with a Tier (`fast`, `balanced`, `quality`), and records where the order came from (`rankedFrom`, `rankedAt`, `basis`). Every Task is hand-ranked today.
- Add `resolveTask(task, request, environment)`, a pure function that chooses the Model: an explicit Model, then a Look's Model, then a Model pinned per Task, then the highest-ranked Model that can do what the request asks for at the Tier. A Model whose provider key is missing is skipped; naming one explicitly fails. The result carries `model`, `tier`, `rankedFrom` and `chosenBy`.
- Add the `NO_MODEL_AVAILABLE` result for when no Model qualifies, with `blockedBy` (the capability, `key`, `mode` or `unknown-model`), `unblockedBy` (`model`, `key`, `option`, or `input` when a Model needs an input the request lacks) and `missingKey`. A Look fixes the Model only for generate and vary. A pin that serves the Task under another mode, or a Look whose Model the Task doesn't offer, gives way to the ranking; a pin the Task doesn't know fails.
- Add `tierChangesChoice`, `modelProfile`, `TASK_IDS`, `isTaskId`, `TIERS`, `DEFAULT_TIER` and the `TaskId`, `Tier`, `RankedFrom`, `RankedModel`, `TaskDefinition`, `TaskRequest`, `TaskEnvironment`, `TaskResolution`, `Capability`, `Blocker`, `Unblocker` and `ChosenBy` types.
- Add `createMotif(config)`, the Task client: one function per Task (`generate`, `erase`, `upscale` and the other 16) plus `run(task, input)`. Each resolves the Model through `resolveTask`, builds the request that Model takes, runs it on fal and returns `files` (with the output key and any registry label), the non-file `data`, `cost`, `model`, `tier`, `chosenBy` and `requestId`. `plan(task, input, { dryRun })` returns the endpoint, body and projected cost without any I/O, and without a key on a dry run. `upload` and `deletePayloads` wrap fal storage.
- `TaskInput` takes `boxes`, always whole pixels of the source (converted to fractions for a Model that takes them, using the size read from a data URL or `sourceSize`), and `margin` (reframe `margin` mode). `params` can't replace a field the request set or any source, mask or reference URL, and a request missing a parameter fal requires is refused.
- relight (MOT-55): relight takes a `mood` as well as or instead of a prompt, joined after the prompt as a sentence, on IC-Light; any Mood applies to any Source. A relight with no prompt, no mood and no mode is refused on `prompt`.
- restore gains a `dark` mode, brightening a dark or underexposed photo on Control Light (`control-light`, $0.03/MP).
- Add the restyle Task (MOT-56): redraw a Source in the style of exactly one Reference, on TeleStyle v2 (`telestyle-v2`, $0.035/MP). Any other number of references is refused on `references`.
- mesh (MOT-57): Meshy v7 (`meshy-v7`, $1.20 textured) leads the quality tier ahead of Hunyuan3D v3. `TaskInput.rig` asks for a rigged mesh and resolves to a Model that takes `enable_rigging`, today Meshy v7; the new `rig` capability is read from the generated parameters. A call price can carry `extras`, USD added when the body turns an option on, so a rig projects and records $1.40. A per-image call price (`perImage`) is multiplied by the body's `num_images`, so two try-on images project and record $0.15.
- Add the try-on Task (MOT-58): dress the person in the Source in the garment from exactly one Reference, on Google's virtual try-on (`virtual-try-on`, $0.075/image). Any other number of references is refused on `references`.
- `MotifImageConfig` accepts `fetch` and `maxRetries`, passed to every provider.
- The Task client refuses rather than drops: a field the chosen Model can't carry, `params` without `model`, or a missing source image fails with `INVALID_OPTION` and `details.field`; a request no Model can serve fails with `NO_MODEL_AVAILABLE` and the resolution's `blockedBy`, `unblockedBy` and `missingKey` in `details`; running without a fal key fails with `MISSING_API_KEY`.
- A transparent request on GPT Image 2 runs through OpenAI via the image layer, as the CLI already did.
- Add `mai-image-2.5-pro`, MAI Image 2.5 Pro (`microsoft/mai-image-2.5-pro`, edits on `/edit` with one image, ~$0.17 an image), first on Artificial Analysis's editing board. It ranks in generate's quality tier, and so in vary's.
- Add `ideogram3-transparent`, Ideogram V3 Transparent (`fal-ai/ideogram/v3/generate-transparent`, $0.06 at the default speed). It only makes transparent images, marked by the new `ModelConfig.transparentOutput`, and generate chooses it for a transparent request at the balanced Tier, so transparency needs no OpenAI key.
- Add `banana2-lite`, Nano Banana 2 Lite (`google/nano-banana-2-lite`, token-metered, fixed 1K output, no editing), ranked in generate's balanced tier.
- Add `recraft41`, Recraft V4.1 (`fal-ai/recraft/v4.1/text-to-image`, $0.035), ranked in generate's balanced tier.
- Add `grok-image-2`, Grok Imagine Image 2.0 (`xai/grok-imagine-image/v2.0/text-to-image`, edits on `/v2.0/edit` with up to 3 images; $0.06 at 1K, $0.08 at 2K), ranked in generate's balanced tier.
- Add `kling-turbo`, Kling v3 Turbo Pro image-to-video (`fal-ai/kling-video/v3/turbo/pro/image-to-video`, $0.14/sec), animate's fast pick. It takes the start frame as `image_url` and has no audio or negative prompt. `estimateVideoCost` takes an optional `model`.
- Add `bria-video-rmbg-v3`, Bria VRMBG 3.0 (`bria/video/background-removal/v3`, $0.05/sec), which now leads cutout for video.
- `MotifError` gains an optional `details` record.
- `FalClientConfig` accepts `fetch`, which replaces global fetch for every request, including upload PUTs. Retries and timeouts still apply.
- Add the `MotifClient`, `MotifClientConfig`, `TaskInput`, `TaskPlan`, `TaskOutput`, `TaskFile`, `TaskFunction`, `PlanOptions` and `FalFetch` types.

### Patch Changes

- A per-megapixel tool (IC-Light, TeleStyle, Control Light and the others that return the source's size) now projects its cost on a dry run when the source's size is known from a data URL or `sourceSize`, instead of reporting none. Tools that upscale still project none. `projectedToolCost` takes an optional `outputs`.
- Match three Models to fal's schemas: `recraft4` refuses `style`, which fal's V4 endpoint doesn't take; `grok-image` accepts at most 3 references, fal's limit; `gpt2` refuses `inputFidelity`, which its `/edit` endpoint doesn't take.
- A mesh run that rigs returns `rigged_character_glb` as its first file, ahead of the unrigged `model_glb`.
- mesh `objects` mode no longer sends `prompt: "car"` when the caller gives no prompt; it refuses with `INVALID_OPTION` on `prompt`.
- Move Model endpoints to the paths fal lists, each with the same request schema as the old path (MOT-59): `gpt2` edits to `openai/gpt-image-2/edit` (the old `/image-to-image` returns 404) with the mask sent as `mask_url`; `qwen3` to `alibaba/qwen-image-3/text-to-image`, now priced at fal's $0.04 an image at 1K; `seedream5-lite` to `bytedance/seedream/v5/lite/*`; `recraft` to `fal-ai/recraft/v3/text-to-image`. `bria-video-rmbg` is priced at fal's $0.14/sec.

- Generation Models that take `image_size` now get exact `{ width, height }` for a ratio no fal preset holds, instead of the nearest preset (MOT-46). 3:2 on FLUX.2 Pro was sent as 4:3. The size keeps the presets' 1024px long edge, scaled up only where a Model sets a minimum, and a megapixel-priced Model's projected cost is taken from the exact or preset pixels. The Task client prices the body as sent, `params` included. Each of the 19 Models carries its limits from fal's OpenAPI schema as `customImageSize` (`ImageSizeBounds`); a ratio with no size inside them throws `ImageSizeBoundsError` (`INVALID_OPTION`) rather than rounding.

## 3.0.0

Released alongside `@howells/motif-cli` 2.0.0.

### Major Changes

- Remove the eight creative direction fields: `recipe`, `shot`, `lighting`, `genre`, `camera`, `color`, `material` and `motion`. There are no aliases. In the CLI the matching flags (`--recipe`, `--shot`, `--lighting`, `--genre`, `--camera`, `--color`, `--material`, `--motion`) are gone too.
- Replace them with two fields, `look` and `mood`. `CreativeField` is now `"look" | "mood"`, and `CREATIVE_TAXONOMY` holds 12 house looks and 6 light moods. In the CLI they are `--look <id>` and `--mood <id>`, plus `--no-mood`.
- `enrichPrompt` now joins the prompt and the look and mood texts as sentences, each with a capital first letter, instead of a comma list.
- A mood with one of the five flat looks (`plate`, `engraved`, `ephemera`, `canvas`, `object`) throws `CreativeOptionError` with code `INVALID_OPTION` on field `mood`.

### Minor Changes

- Add `LOOKS`, `getLook`, `validateCreativeDirection` and the `LookOption`, `LookId` and `MoodId` types. Each look carries a default `aspect` and `model`, `acceptsMood`, and an optional `experimental` flag.
- Add `promptWarnings`, advisory checks on a caller's own prompt (`negated-object`, `text-bearing-object`, and `edit-has-verb` when an edit's prompt starts with remove, erase, extend or outpaint).
- Map fal's `403 User is locked` response to a `MotifError` with code `ACCOUNT_LOCKED`, on requests and on the upload PUT, and export `ACCOUNT_LOCKED` and `isFalAccountLocked`.
- Unsupported generation options now throw `UnsupportedOptionError` (code `INVALID_OPTION`), which names the models that support the option and the options this model supports. Add `OPTION_CAPABILITIES`, `supportedOptions`, `modelsSupporting` and the `ModelOption` type.
- Add `ModelConfig.transparencyRoute` (`ProviderRoute`): `gpt2` produces transparent PNGs through OpenAI's `gpt-image-2`, not its fal endpoint. Export `getOpenAiKeyFromEnv` to read `OPENAI_API_KEY` for that route.
- Export `providerPricePerImageUsd` from `@howells/motif-sdk/image`.

## 0.3.0

### Minor Changes

- Add `sam3-1-image` tool for SAM 3.1 promptable image segmentation (`fal-ai/sam-3-1/image`). Same text/point/box-prompt interface and `image`/`masks`/`scores`/`boxes` output shape as `sam3-image`; SAM 3.1 adds Object Multiplex for faster multi-object tracking.
