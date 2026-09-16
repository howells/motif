# @howells/motif-sdk

Public Node SDK for Motif: Task-first image, video and utility work on fal.ai, plus a provider-agnostic image layer.

## Install

```bash
npm install @howells/motif-sdk
```

## Run a Task

The Task client, `createMotif`, is the fal surface: name a Task and, optionally, a Tier, and Motif chooses the Model, builds its request and runs it on fal. `createMotifImage` (`@howells/motif-sdk/image`) is the provider-agnostic generate/edit layer across google, openai, replicate, and fal. See [Image Layer](#image-layer-howellsmotif-sdkimage) below.

```ts
import { createMotif } from "@howells/motif-sdk";

const motif = createMotif(); // reads FAL_KEY

const result = await motif.generate({
  prompt: "editorial product photo",
  resolution: "2K",
  tier: "quality",
});

if (result.isErr()) {
  throw result.error;
}

console.log(result.value.model, result.value.files[0]?.url, result.value.cost);
```

Every Task function returns `Result<TaskOutput, MotifError>` from `neverthrow` and does not throw for fal request failures; check `isErr()` / `isOk()`.

## Plan Without Calling fal

`plan(task, input, { dryRun: true })` resolves the Model and returns the endpoint, body and projected cost with no I/O and no key.

```ts
const plan = motif.plan(
  "erase",
  {
    image: "https://example.com/room.png",
    prompt: "the chair",
  },
  { dryRun: true }
);

if (plan.isOk()) {
  console.log(plan.value.model, plan.value.cost);
}
```

## Main Exports

- `createMotif` - the Task client: one function per Task plus `run`, `plan`, `upload` and `deletePayloads`.
- `TASKS`, `TASK_IDS`, `TIERS`, `resolveTask`, `modelProfile`, `tierChangesChoice` - the Task registry and Model resolution.
- `createMotifImage` (`@howells/motif-sdk/image`) - provider-agnostic generate/edit/best-of-N across google, openai, replicate, and fal.
- `ASPECT_RATIOS`, `RESOLUTIONS`, `FORMAT_PRESETS` - shared sizing metadata.
- `LOOKS`, `CREATIVE_TAXONOMY`, `enrichPrompt`, `validateCreativeDirection` - house looks and moods.
- `formatCost`, `sumCosts` - cost formatting and totals.
- `getFalKeyFromEnv`, `getOpenAiKeyFromEnv` - `@howells/envy` backed key parsing.
- Re-exported `neverthrow` helpers: `ok`, `err`, `Result`, `ResultAsync`.

## Common Types

- `MotifClient`, `MotifClientConfig`, `TaskInput`, `TaskOutput`, `TaskPlan`, `TaskFile`
- `TaskId`, `Tier`, `TaskDefinition`, `RankedModel`, `TaskRequest`, `TaskResolution`, `ModelProfile`
- `AspectRatio`, `Resolution`, `CustomImageSize`, `ImageSizeBounds`, `MotifError`

## Image Layer (`@howells/motif-sdk/image`)

The provider-agnostic image generation + editing layer, for callers who choose the provider and model themselves. It is an ESM-only subpath export, built on the Vercel AI SDK image interface (`ai`'s `generateImage`).

```bash
npm install @howells/motif-sdk
```

```ts
import { createMotifImage } from "@howells/motif-sdk/image";

const img = createMotifImage({ defaultProvider: "google" });

// text -> image
const generated = await img.generate({
  model: "gemini-3.1-flash-image-preview",
  prompt: "a plain room, bare concrete wall",
  aspectRatio: "1:1",
});

// multi-image edit (images + instruction, optional mask -> image out)
const edited = await img.edit({
  model: "gemini-3.1-flash-image-preview",
  images: [roomBytes, tileBytes],
  instruction: "Apply the oak texture from image 2 onto the wall in image 1.",
  mask: surfaceMaskBytes,
});

if (edited.isOk()) {
  edited.value.images; // MotifImageFile[]
  edited.value.cost; // { usd, source: "provider-metadata" | "table" | "unknown" }
  edited.value.provider; // resolved ImageProviderId
  edited.value.model; // resolved model id
}
```

Both `generate()` and `edit()` return `Result<MotifImageResult, MotifError>`, matching the rest of the SDK — no throws, check `isOk()` / `isErr()`.

Four providers are implemented, each reading its own API key from the environment (or a `MotifImageConfig` override):

| Provider | Env var | Notes |
| --- | --- | --- |
| `google` | `GOOGLE_GENERATIVE_AI_API_KEY` | Default provider; Gemini gen + edit |
| `openai` | `OPENAI_API_KEY` | GPT Image 2.5 Flare and Sunburst |
| `replicate` | `REPLICATE_API_TOKEN` | flux-1.1-pro-ultra |
| `fal` | `FAL_KEY` | fal-hosted adapter |

`generate()` and `edit()` take a provider model id; Task resolution chooses which model to pass, not the image layer. Every result carries a normalized per-call `cost: { usd, source }`.

Both `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst` support generation and multi-image editing:

```ts
const image = createMotifImage({ defaultProvider: "openai" });
const generated = await image.generate({
  prompt: "A ceramic vase in soft window light",
  model: "gpt-image-2.5-flare",
});
const refined = await image.edit({
  images: [referenceBytes],
  instruction: "Change only the vase glaze to deep green",
  model: "gpt-image-2.5-sunburst",
});
```

These models use token-based billing. Motif has no static per-image estimate for them, so `cost` is `{ usd: 0, source: "unknown" }` unless the provider supplies a cost; this does not mean generation is free. See the official [Flare](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare) and [Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst) model pages. The installed OpenAI adapter accepts `low`, `medium`, `high`, and `auto` quality; the new `xhigh` and `max` settings require a future adapter update. The Task client and the CLI reach these models on fal as `flare` and `sunburst`. Fal supports `xhigh` and `max`, up to 16 edit references, masks and transparent backgrounds. Fal generation estimates are `null` (metered).

### Best-of-N with an injectable judge

`bestOfN()` generates `n` candidates in parallel and picks a winner. It reuses the same options as `generate()` (text→image) or `edit()` (pass `images` for the edit path), plus `n` and an optional `judge`. When a `seed` is given each candidate uses `seed + index`, so the N vary. The judge is a caller-provided function — the layer takes no text-client dependency, so it pairs well with `@howells/ai`'s vision client but does not require it. Omit the judge and candidate 0 wins.

```ts
const best = await img.bestOfN({
  prompt: "a plain room, bare concrete wall",
  n: 4,
  seed: 100, // candidates get seeds 100, 101, 102, 103
  // Caller-provided judge: receives the successful candidates + context,
  // returns the winning index. Wire in @howells/ai here if you want a vision judge.
  judge: async (candidates, context) => {
    // ...score candidates[i].images[0] against context.prompt...
    return { index: 0, reason: "sharpest wall texture" };
  },
});

if (best.isOk()) {
  best.value.best; // the winning MotifImageResult
  best.value.chosenIndex; // its index within candidates
  best.value.reason; // the judge's rationale, if any
  best.value.candidates; // every successful candidate (generation order)
  best.value.totalCostUsd; // summed USD across all candidates generated
}
```

If some candidates fail, the judge sees only the survivors; if all `n` fail, `bestOfN()` returns `Result.err`.

## Testing

```bash
pnpm --filter @howells/motif-sdk test
pnpm --filter @howells/motif-sdk typecheck
```

Live fal canaries are opt-in:

```bash
RUN_FAL_CANARY=1 pnpm --filter @howells/motif-sdk test -- tests/fal-canary.test.ts
```
