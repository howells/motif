# Field masks, chaining and pagination

Which `--fields` to ask for per workflow, how to chain one command's output path into the next, and how to page through history. Part of the [CLI agent guide](../AGENTS.md), which carries the table of where each command family puts its output path.

## Recommended Field Masks

Use `--fields` to limit output to what you need. This protects your context window and reduces token usage in multi-step workflows.

| Workflow | Command | Recommended `--fields` |
| --- | --- | --- |
| Generate and confirm | `generate` | `id,images,cost` |
| Batch exploration | `generate` | `id,images` |
| Cost tracking | `generate` | `id,cost,model` |
| Upscale/rmbg result | `upscale`, `rmbg` | `path,size` |
| Video result | `video` | `path,duration,cost` |
| History scan | `history` | `id,prompt,model,cost` |
| Last generation check | `last` | `id,prompt,output` |
| Verb result | `segment`, `erase`, `reframe`, `enhance`, `layers`, `vectorize` | `path,cost` |
| Verb, every artefact | any verb with `-o dir/` | `files` |
| Segment geometry only | `segment` | `boxes,scores` (add `rle` with `--rle`) |
| Ask | `ask` | `answer` (also `reasoning`, `objects`, `points`) |
| Tool result | `tool run` | `saved` |
| Tool, every artefact | `tool run -o dir/` | `files` |
| Tool pricing check | `tool run --dry-run` | `estimatedCost,pricing,queued` |

## Examples

```bash
# Batch: generate 4 images, only get paths
motif "sunset over mountains" -m flux-fast -n 4 --fields images | jq -r '.images[].path'

# Pipeline: generate → upscale (chain by path)
IMG=$(motif "a cat" -m flux --fields images | jq -r '.images[0].path')
motif --up "$IMG" --fields path,size

# Pipeline: verb → verb (verbs put the path at the top level)
ERASED=$(motif erase "the parked car" street.png -o erased.jpg --no-open --fields path | jq -r .path)
motif reframe --story "$ERASED" -o story.png --no-open --fields path

# Cost audit: check recent spending
motif --history --limit 20 --fields model,cost
```

## Pagination

History supports offset-based pagination:

```bash
# First page
motif --history --limit 10

# Next page
motif --history --limit 10 --offset 10

# Stream all as NDJSON
motif --history --limit 100 --format ndjson
```

JSON response includes `hasMore: true` when more pages exist.
