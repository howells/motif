# @howells/motif-sdk

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
