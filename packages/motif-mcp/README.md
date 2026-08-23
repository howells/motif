# @howells/motif-mcp

Local stdio MCP server exposing Motif generation, post-processing, history, and registry resources.

## Install

```bash
npm install -g @howells/motif-mcp
```

## Configure

```json
{
  "mcpServers": {
    "motif": {
      "command": "npx",
      "args": ["-y", "@howells/motif-mcp"],
      "env": {
        "FAL_KEY": "${FAL_KEY}"
      }
    }
  }
}
```

## Tools

- `generate` - create images from prompts using Motif generation model aliases. Supports `aspect`, `resolution`, presets, `numImages`, `transparent`, `outputFormat`, `seed`, `enableWebSearch`, `enableGoogleSearch`, and a `creative` object of direction choices (`recipe`, `shot`, `lighting`, `genre`, `camera`, `color`, `material`, `motion`) that enrich the prompt.
- `upscale` - upscale a remote image URL with `clarity` or `crystal`.
- `remove_background` - remove a remote image background with `rmbg` or `bria`.
- `vary` - edit or vary remote reference image URLs, and accepts the same `creative` object as `generate`. Its model enum is the edit-capable subset (the generation models whose fal endpoints support image editing).
- `segment` - segment a named subject out of a remote image with SAM 3, returning mask URLs, boxes, and scores. Takes `imageUrl`, `prompt`, and an optional `maxMasks` (1-50).
- `ask` - ask Moondream 3 about a remote image. Takes `imageUrl`, an optional `mode` of `query`, `caption`, `detect` or `point` (default `query`), and a `question` - required for every mode except `caption`, where it is the question to answer or the subject to detect or point at. Returns text and structured data only; it writes no file.
- `enhance` - Topaz restoration and upscaling of a remote image. Takes `imageUrl` and a `mode` of `upscale`, `generative`, `creative`, `transparent`, `restore`, `denoise`, `sharpen` or `adjust` (default `upscale`). Every mode runs through the fal queue and can take minutes.
- `history` - read local Motif CLI history from `~/.motif/history.json`.

The mutating tools call fal.ai and may spend credits. Inspect `motif://models` before selecting a model when you need current capabilities, reference limits, or pricing, and `motif://tools` for the fal utility endpoints behind `segment`, `ask`, and `enhance`.

Cost is reported from the registry, never guessed. `cost_estimate` is a number only for endpoints billed per call, such as `segment`. Endpoints billed per output megapixel, per second, or on tokens and frames report `cost_estimate: null` alongside a `cost_per_megapixel` or `cost_per_second` unit rate where one exists, plus the registry's `pricing` note. A null estimate means the cost is not knowable before the call - it never means free.

## Resources

- `motif://models` - model registry with aliases, fal endpoints, capabilities, pricing, and benchmark metadata.
- `motif://tools` - normalized fal utility tool registry.
- `motif://leaderboards` - bundled benchmark snapshots.
- `motif://history/schema` - local history JSON schema without user history values.

## Security

The server is local stdio only. It reads `FAL_KEY` from the environment. The `history` tool exposes prompts, costs, and local file paths to connected MCP clients.

See `docs/security.md` in the repository for the full trust boundary.
