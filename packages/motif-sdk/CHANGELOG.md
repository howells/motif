# @howells/motif-sdk

## Unreleased

Part of "tasks replace models" (ADR 0001, MOT-63). The rest of that change lands across the following releases; this is the engine.

### Major Changes

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
