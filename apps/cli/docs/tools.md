# Fal tools

How `motif tool list`, `motif tool describe` and `motif tool run` behave: billing, queueing, saved files, arguments and stdin JSON. Part of the [CLI agent guide](../AGENTS.md). Worked examples per tool family are in [docs/tools](../../../docs/tools/pipelines.md).

## Fal Tool Invariants

1. **`estimatedCost: null` is not free.** It means metered or per-unit billing - the price depends on output megapixels, compute seconds, map count, layer count or tokens, none of which the CLI can know before the call. `estimatedCostPerMegapixel` / `estimatedCostPerSecond` carry the rate where there is one; the `pricing` string carries the full formula. Summing `estimatedCost ?? 0` across a plan will under-budget.

2. **29 of the 71 tools are `queued`.** They routinely exceed fal's 120-second synchronous window, so the CLI submits to the queue and polls. A Topaz restore taking over two minutes is normal. Set harness timeouts in minutes for these, and never retry one that looks stuck - each retry is another billable submission. Check with `--dry-run --fields queued`, or `motif tool describe <id>`.

3. **The response can lie about geometry; the CLI does not.** Several endpoints return `width` and `height` as `null` on the files they hand back - `seedream-layerize` does it on every layer. Motif measures each file as it downloads, so `--fields files` carries the real dimensions:

   ```json
   {
     "key": "masks",
     "path": "…/masks.png",
     "size": "139.3KB",
     "width": 2752,
     "height": 1536
   }
   ```

   This only works if you let the CLI download. Fetch the URLs yourself and you get the payload's nulls. Reported by a consumer who measured the bytes by hand before finding this.

4. **`-o dir/` writes every artefact; anything else writes only the primary.** Files in directory mode are named by the registry output key (`image.jpg`, `masks.png`), or by declared position labels where the registry has them - `patina -o pbr/` writes `basecolor.jpg`, `normal.jpg`, `roughness.jpg`, `metalness.jpg`, `height.jpg`. A reordered driving option (patina's `maps`) is honoured; a label count that doesn't match the URL count is dropped rather than guessed.

5. **Never hardcode tool ids or prices.** Both move with the registry. Read them from `motif tool list --format json` and `motif tool describe <id> --format json`.

6. **`motif tool run` has no `--no-open`** and never opens a viewer. The seven verbs do open one by default, so they need it in a pipeline.

7. **Some tools take `--inputs`, not a positional path.** Registry entries with `inputKind: "images"` (`got-ocr`, `nsfw`) send an array field. `motif tool describe <id>` reports `inputKind` and `inputField`.

## Tool Arguments

`motif tool describe <id> --format json` carries a `parameters` array listing every argument that endpoint accepts, generated from fal's own schema rather than from the flags Motif happens to expose. Anything in it is passable with `motif tool run <id> --json '{...}'`, whether or not there is a flag for it - `topaz-precision` takes `upscale_factor` and six `model` variants, `birefnet` takes `output_mask`, `iclight-v2` takes `mask_image_url`, none of which has a flag.

Two different defaults live in that output and they mean different things:

- `fallback` is fal's own default, applied when nobody sends the argument. Some are surprising: `sam3-image` defaults `prompt` to `"wheel"`, so an unprompted call looks for wheels and returns nothing.
- `motifDefault` is Motif's deliberate opinion, sent on every call and overriding fal's default.

Everything else is caller-supplied. `motif tool list` and `motif --describe` carry only a `parameterCount` per tool, so read the per-tool describe before deciding what a tool can do. Over MCP the same split holds: `motif://tools` lists counts, `motif://tools/{id}` returns the arguments.

## Stdin JSON for fal tools

The four `tool*` commands reach every entry in the registry, including the 40-odd with no promoted verb:

```json
{
  "command": "tool-run",
  "tool": "sam3-image",
  "input": "path/or/https/url",
  "inputs": ["a.png", "b.png"],
  "options": { "maps": ["basecolor", "normal"] },
  "output": "out/",
  "outputFormat": "png",
  "prompt": "the white ceramic bowl",
  "scale": 2,
  "dryRun": true
}
```

`options` is merged into the fal request body, the same as `--json` on the command line. `tool-list` and `tool-describe` need no input; `tool-describe` takes `tool`.
