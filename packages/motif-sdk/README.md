# @howells/motif-sdk

Public Node SDK for Motif: Task-first image, video and utility work on fal.ai, plus a provider-agnostic image layer.

## Install

```bash
npm install @howells/motif-sdk
```

## Run a Task

The Task client, `createMotif`, is the fal surface: name a Task and, optionally, a Tier, and Motif chooses the Model, builds its request and runs it on fal. `createMotifImage` (`@howells/motif-sdk/image`) is the provider-agnostic generate/edit layer across openrouter, openai, replicate, and fal. See [Image Layer](#image-layer-howellsmotif-sdkimage) below.

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

Pass `onProgress(status, queuePosition)` to hear fal's queue state while a run waits: `"queued"` with its place in line, then `"processing"`, then `"completed"` (or `"failed"`). Passing it sends the run through fal's queue, since only the queue reports state. Models without streaming report state, not a percentage.

Pass `onSubmitted(requestId)` to hear the request id the moment fal's queue accepts the run, before any wait. Keep it: after a restart, `motif.resume(task, input, requestId)` waits for that same job and returns its output, submitting nothing and so paying nothing twice. Passing `onSubmitted` also queues the run.

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

## Stream a Task

`stream(task, input, options?)` opens a direct inference stream on the resolved route. Streaming is explicitly supported for GPT Image 2, GPT Image 1.5 and FLUX.2 Dev, including their edit routes. Other routes return `STREAMING_UNSUPPORTED` before any provider request; Motif never substitutes another model or retries a stream.

```ts
const controller = new AbortController();
const opened = await motif.stream(
  "generate",
  {
    model: "gpt2",
    prompt: "editorial product photo",
    references: ["https://example.com/reference.png"],
  },
  { signal: controller.signal, timeout: 300_000 }
);

if (opened.isErr()) throw opened.error;
for await (const result of opened.value.events) {
  if (result.isErr()) throw result.error;
  const event = result.value;
  if (event.type === "images") render(event.files);
  if (event.type === "progress") showProgress(event.progress, event.message);
}
```

Events use `images`, `progress` or `provider` types. Images carry the same `TaskFile` URL shape as ordinary Task outputs, including data URIs. Progress fractions are normalised only when explicitly between zero and one. The raw provider payload remains available as `raw` or `data`, and SSE event/id metadata is preserved. Preview images depend on the model; an images event is not labelled preview or final, and transport EOF does not prove generation success.

The handle exposes `plan`, optional `requestId` and `abort()`. Consume its events once. Abort, iterator exit and the overall deadline close local consumption; this does not guarantee cancellation of provider work or a refund. There is no queue submission, reconnection or retry. `plan()` remains a normal execution plan, so its `queued` flag describes `run()`, not `stream()`.

For a local checkout, `node packages/motif-sdk/examples/stream.mjs --dry-run` prints the resolved request without a provider call. Running it without `--dry-run` spends provider credits; it requires `FAL_KEY` and a built SDK. The runner is a repository example, not a packaged public API.

## Main Exports

- `createMotif` - the Task client: one function per Task plus `run`, `stream`, `plan`, `upload` and `deletePayloads`.
- `TASKS`, `TASK_IDS`, `TIERS`, `resolveTask`, `modelProfile`, `tierChangesChoice` - the Task registry and Model resolution.
- `createMotifImage` (`@howells/motif-sdk/image`) - provider-agnostic generate/edit/best-of-N across openrouter, openai, replicate, and fal.
- `ASPECT_RATIOS`, `RESOLUTIONS`, `FORMAT_PRESETS` - shared sizing metadata.
- `LOOKS`, `CREATIVE_TAXONOMY`, `enrichPrompt`, `validateCreativeDirection` - house looks and moods.
- `formatCost`, `sumCosts` - cost formatting and totals.
- `getFalKeyFromEnv`, `getOpenAiKeyFromEnv` - `@howells/envy` backed key parsing.
- Re-exported `neverthrow` helpers: `ok`, `err`, `Result`, `ResultAsync`.

## Common Types

- `MotifClient`, `MotifClientConfig`, `TaskInput`, `TaskOutput`, `TaskPlan`, `TaskFile`, `TaskStream`, `TaskStreamEvent`, `TaskStreamOptions`
- `TaskId`, `Tier`, `TaskDefinition`, `RankedModel`, `TaskRequest`, `TaskResolution`, `ModelProfile`
- `AspectRatio`, `Resolution`, `CustomImageSize`, `ImageSizeBounds`, `MotifError`

## Image Layer (`@howells/motif-sdk/image`)

The provider-agnostic image generation + editing layer, for callers who choose the provider and model themselves. It is an ESM-only subpath export, built on the Vercel AI SDK image interface (`ai`'s `generateImage`).

```bash
npm install @howells/motif-sdk
```

```ts
import { createMotifImage } from "@howells/motif-sdk/image";

const img = createMotifImage({ defaultProvider: "openrouter" });

// text -> image
const generated = await img.generate({
  model: "gemini-3.1-flash-image-preview",
  prompt: "a plain room, bare concrete wall",
  aspectRatio: "1:1",
});

// multi-image edit (images + instruction -> image out; masks need the openai provider)
const edited = await img.edit({
  model: "gemini-3.1-flash-image-preview",
  images: [roomBytes, tileBytes],
  instruction: "Apply the oak texture from image 2 onto the wall in image 1.",
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
| `openrouter` | `OPENROUTER_API_KEY` | Default provider; Gemini gen + edit through OpenRouter (`google/*`), no masks |
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
