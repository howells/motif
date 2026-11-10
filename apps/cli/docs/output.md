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
motif "sunset over mountains" --tier fast -n 4 --fields images | jq -r '.images[].path'

# generate, then upscale
IMG=$(motif "a cat" --fields images | jq -r '.images[0].path')
motif upscale "$IMG" --fields path,size

# verb, then verb
ERASED=$(motif erase "the parked car" street.png -o erased.jpg --fields path | jq -r .path)
motif reframe "$ERASED" --story -o story.png --fields path

# Recent spend
motif --history --limit 20 --fields model,cost
```

## Output format from -o

Images are PNG unless you ask for another format with `--output-format` or an `-o` ending `.jpg`, `.jpeg` or `.webp`; convert afterwards if you need another. An `-o` path ending in `.jpg`, `.jpeg` or `.webp` asks the Model for that format, so the saved file's bytes match its extension; a Model that cannot make it fails with `INVALID_OPTION` instead of saving another format under that name. Files that can only be one type (`.svg`, `.glb`, `.mp4`) take that extension.

## When a paid run could not be recorded

A command that spends checks its history file (and, for `series gen` and `series run`, its series file) before it submits, so an unusable file fails with `CORRUPT_FILE` or `FILE_ACCESS_FAILED` (exit `2`) with nothing spent.

If the history or series file fails after the files were saved (the disk filled, or permissions changed mid-run), the run is not reported as a provider failure and the result is not hidden. stdout carries the normal result (paths, `model`, `cost`, `requestId`) with `historyRecorded: false` and a `historyFailure` object (`code`, `message`, `details`); stderr carries one structured error with the same code, and the exit code is that code's (`2`). The files are saved: do not run the command again, it would bill again. `series run` stops after the scene whose recording failed, so no later scene is paid for unrecorded.

`generate` and the Task verbs report fal's `requestId` in every result.

## Pagination

```bash
motif --history --limit 10
motif --history --limit 10 --offset 10
motif --history --limit 100 --format ndjson
```

JSON output includes `hasMore: true` when more pages exist.
