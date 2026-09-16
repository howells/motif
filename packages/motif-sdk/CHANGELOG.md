# @howells/motif-sdk

## Unreleased

Part of "tasks replace models" (ADR 0001, MOT-63). The rest of that change lands across the following releases; this is the engine.

### Major Changes

- `@howells/motif-sdk/image` no longer chooses a model. `tier` and the `ImageTier` type are gone from `generate()` and `edit()`, `model` is required, and `GOOGLE_TIER_MODELS`, `OPENAI_TIER_MODELS`, `REPLICATE_TIER_MODELS` and `FAL_TIER_MODELS` are no longer exported. Task resolution is the one place a Model is chosen.

### Minor Changes

- Add the Task registry, `TASKS`, placing every existing Model in one of 17 Tasks: animate, ask, cutout, erase, generate, layers, map, material, mesh, reframe, relight, restore, segment, tile, upscale, vectorize and vary. `sam3-3d-align` is not placed.
- A Task can have modes (`TaskMode`), named variants a caller asks for, such as erasing text or restoring colour. A ranked entry can declare a mode, capabilities it adds for that Task (`supports`) and inputs it needs (`requires`, such as a mask). `TaskRequest.mode` selects one; an unknown mode is refused with `blockedBy: "mode"`.
- Each Task ranks its Models best-first as data, tagged with a Tier (`fast`, `balanced`, `quality`), and records where the order came from (`rankedFrom`, `rankedAt`, `basis`). Every Task is hand-ranked today.
- Add `resolveTask(task, request, environment)`, a pure function that chooses the Model: an explicit Model, then a Look's Model, then a Model pinned per Task, then the highest-ranked Model that can do what the request asks for at the Tier. A Model whose provider key is missing is skipped; naming one explicitly fails. The result carries `model`, `tier`, `rankedFrom` and `chosenBy`.
- Add the `NO_MODEL_AVAILABLE` result for when no Model qualifies, with `blockedBy` (the capability, `key`, `mode` or `unknown-model`), `unblockedBy` (`model`, `key`, `option`, or `input` when a Model needs an input the request lacks) and `missingKey`. A Look fixes the Model only for generate and vary. A pin that serves the Task under another mode, or a Look whose Model the Task doesn't offer, gives way to the ranking; a pin the Task doesn't know fails.
- Add `tierChangesChoice`, `modelProfile`, `TASK_IDS`, `isTaskId`, `TIERS`, `DEFAULT_TIER` and the `TaskId`, `Tier`, `RankedFrom`, `RankedModel`, `TaskDefinition`, `TaskRequest`, `TaskEnvironment`, `TaskResolution`, `Capability`, `Blocker`, `Unblocker` and `ChosenBy` types.

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
