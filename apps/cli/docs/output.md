# Field masks, chaining and pagination

Which `--fields` to ask for per workflow, how to chain one command's output path into the next, and how to page through history. Part of the [CLI agent guide](../AGENTS.md).

## Where the path is

Field masks are top-level only, so this matters:

| Family                       | Where the path is | jq                        |
| ---------------------------- | ----------------- | ------------------------- |
| `generate`, `vary`           | `images[].path`   | `jq -r '.images[0].path'` |
| Every other Task verb        | `path`            | `jq -r .path`             |
| Any Task verb with `-o dir/` | `files[].path`    | `jq -r '.files[].path'`   |
| `sheet`                      | `path`            | `jq -r .path`             |

A dry run has no `path`. It reports `output`, where the file would go. Each entry in `images` also carries `remoteUrl`, the provider-hosted URL the file came from, which expires.

## Recommended field masks

| Workflow | Command | `--fields` |
| --- | --- | --- |
| Generate and confirm | `generate` | `images,cost` |
| Cost tracking | `generate` or any verb | `model,tier,cost,costBasis` |
| Price before running | any, with `--dry-run` | `model,cost,costBasis,output` |
| Verb result | any Task verb | `path,cost` |
| Every file a verb wrote | any Task verb with `-o dir/` | `files` |
| Segment geometry only | `segment` | `boxes,scores` |
| Ask | `ask` | `answer` (also `reasoning`, `objects`, `points`) |
| History scan | `--history` | `id,prompt,model,cost` |
| Last generation check | `--last` | `id,prompt,output` |

## Examples

```bash
# Several images, paths only
motif "sunset over mountains" --tier fast -n 4 --no-open --fields images | jq -r '.images[].path'

# generate, then upscale
IMG=$(motif "a cat" --no-open --fields images | jq -r '.images[0].path')
motif upscale "$IMG" --no-open --fields path,size

# verb, then verb
ERASED=$(motif erase "the parked car" street.png -o erased.jpg --no-open --fields path | jq -r .path)
motif reframe "$ERASED" --story -o story.png --no-open --fields path

# Recent spend
motif --history --limit 20 --fields model,cost
```

## Output format from -o

An `-o` path ending in `.png`, `.jpg`, `.jpeg` or `.webp` asks the Model for that format when it supports one, so the saved file's bytes match its extension. Files that can only be one type (`.svg`, `.glb`, `.mp4`) take that extension.

## Pagination

```bash
motif --history --limit 10
motif --history --limit 10 --offset 10
motif --history --limit 100 --format ndjson
```

JSON output includes `hasMore: true` when more pages exist.
