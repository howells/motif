# Surface Plan: Motif

Date: 2026-09-10 (from `audit-2026-09-10.md`)

Target: 14/21 (20/30, Agent-ready) back to Agent-first, measured by usage rather than by reading the code. The exit condition is a routing eval (SURF-18) in which an agent given a task and only the shipped surfaces picks the right command, not a re-read of the source.

SURF-1 to SURF-8 (the 2026-05-20 plan) are all complete and dropped from this file. See `scorecard.md` history.

One idea carries most of this plan: **write the task table once and generate every surface from it.** SURF-9 creates the table. SURF-10 to SURF-14 read from it. SURF-18 checks that it works.

Areas another session is changing right now (CLI flags, `-e`, output paths, `motif sheet`, gpt2 transparency) are flagged per task. Coordinate before touching them.

## Priority order

| # | ID | Change | Surface | Size | Impact |
| --- | --- | --- | --- | --- | --- |
| 1 | SURF-9 | Task index | `AGENTS.md`, `apps/cli/AGENTS.md`, `llms.txt`, `README.md` | S | Context 2→3, Discovery 2→3 |
| 2 | SURF-10 | Consumer quick reference | `~/.claude/CLAUDE.md`, `~/.claude/cli-tools.md` (outside repo) | S | Reach: most of the 604 commands |
| 3 | SURF-11 | `--help` lists every command by task | `apps/cli/src/cli.ts` | S | CLI 2→3 |
| 4 | SURF-12 | Capability errors name the fix | SDK `generate.ts`, CLI errors | M | Error Handling 2→3 |
| 5 | SURF-13 | Tool list points to verbs | `apps/cli/src/commands/tools.ts`, `tool-run.ts` | S | Tool Design 2→3 |
| 6 | SURF-14 | Did-you-mean for task words | `apps/cli/src/index.ts`, `errors.ts` | S | Error Handling, CLI |
| 7 | SURF-15 | `whenToUse` / `notFor` / `tasks` in `--describe` | `apps/cli/src/commands/describe.ts`, verb descriptors | M | Tool Design 2→3 |
| 8 | SURF-16 | Ship the guide with the package | `apps/cli/package.json`, `apps/cli/README.md` | S | CLI 2→3, Discovery |
| 9 | SURF-17 | Cut the CLI guide under 370 lines | `apps/cli/AGENTS.md`, new `docs/cli/*.md` | M | Context 2→3 |
| 10 | SURF-18 | Routing eval | `evals/routing/` | M | Testing 2→3 |

## Tasks

### SURF-9: Task index

- **Description:** Add a "What do you want to do?" table near the top of root `AGENTS.md` (under "Using the CLI") and right after Quick Start in `apps/cli/AGENTS.md`. Put a matching H2 in `llms.txt` and move the README Fal Tools task block up to just after Quick Start. Each row has the task in the user's words, the command, and the sibling to use instead when it applies. Minimum rows:

  | Task | Command | Instead, when |
  | --- | --- | --- |
  | Remove an object or person | `motif erase "<thing>" img` | shadows must go too: `tool run finegrain-eraser` |
  | Remove the background | `motif --rmbg img` | |
  | Extend the canvas, change the ratio, outpaint | `motif reframe --og img` | exact pixel expansion: `tool run bria-expand` |
  | Split into layers | `motif layers img -o layers/` | text lifted off: `tool run ideogram-layerize-text` |
  | Cut out or mask a thing | `motif segment "<thing>" img` | |
  | What's in this image, caption, find/count | `motif ask ...` | OCR: `tool run got-ocr` |
  | Upscale, restore, denoise, sharpen | `motif enhance --<mode> img` | |
  | Raster to SVG | `motif vectorize img -o out.svg` | |
  | A set of images that belong together | `motif series run "<theme>" --count n` | |
  | Our usual / house look (editorial, lived-in...) | `--look <id>` [`--mood <id>`] | |
  | Variations of the last image | `motif --vary` | |
  | Grid or contact sheet of images | `motif sheet ...` (in flux: add when it lands) | |

- **Files:** `AGENTS.md` (CLAUDE.md follows via symlink), `apps/cli/AGENTS.md`, `llms.txt`, `README.md`. Later generated from the SURF-15 table.
- **Complexity:** S
- **Score impact:** Context Files 2→3 (with SURF-17), Discovery 2→3 (with SURF-16).
- **Dependencies:** none. Add the `sheet` row once the other session lands it.
- **Owner:** docs worker.
- **Verification:** extend `apps/cli/tests/docs-sync.test.ts` to require every command in `--describe` `commands` to appear in the task table of both AGENTS files.

### SURF-10: Consumer quick reference

- **Description:** Replace the "Image Generation with Motif" block in `~/.claude/CLAUDE.md` with about 10 lines: always `--dry-run` and `-m`, then the task index rows from SURF-9 (erase, reframe, layers, segment, ask, series run, `--look`, sheet). Add a motif section to `~/.claude/cli-tools.md`. This is the context agents actually load in other projects. It's Daniel's dotfiles, managed by chezmoi: edit the chezmoi source, not the target.
- **Files:** chezmoi source for `~/.claude/CLAUDE.md` and `~/.claude/cli-tools.md`. Outside this repo.
- **Complexity:** S
- **Score impact:** none on the rubric. The largest expected effect on usage.
- **Dependencies:** SURF-9 wording.
- **Owner:** lead session (dotfiles, not a subagent).
- **Verification:** start a fresh session in another repo, ask "remove the car from street.png" and "our usual editorial look", and check that the first command is `erase` / `--look editorial` in a dry run.

### SURF-11: `--help` lists every command by task

- **Description:** Replace the hard-coded `Commands:` text in `apps/cli/src/cli.ts:99-102` with a generated list of every argv-routed command (`erase`, `reframe`, `segment`, `ask`, `enhance`, `layers`, `vectorize`, `series`, `tool`, `sheet`, `studio`). Give each a task-phrased one-liner from the verb descriptors ("erase - remove an object and fill the gap"). Put the list **before** the ~70 generation flags, or add a short "Tasks" block at the top, so it's in the first screen.
- **Files:** `apps/cli/src/cli.ts`, `apps/cli/src/commands/verbs/index.ts` (export descriptor list).
- **Complexity:** S
- **Score impact:** CLI Design 2→3 (with SURF-16).
- **Dependencies:** none. The other session is editing CLI flags, so coordinate on `cli.ts`.
- **Owner:** coding worker.
- **Verification:** new case in `apps/cli/tests/cli-contract.test.ts`: `motif --help` stdout contains every verb name plus `series`, `tool`, `sheet`.

### SURF-12: Capability errors name the fix

- **Description:** In `packages/motif-sdk/src/generate.ts:62-63`, replace `throw new Error("<Model> does not support <option>")` with a typed `CapabilityError { code: "INVALID_OPTION", field, model, supportedBy: string[] }`. Build `supportedBy` from model capabilities, the same data as `--describe` `models.*.capabilities`. In the CLI, surface `details: { field, model, supportedBy }` and a concrete suggestion, for example "`--resolution` isn't supported by gpt. Drop `-r`, or use `-m banana2` (supports it)". Do the same for `INVALID_OUTPUT_PATH`: state the rule and the nearest valid path (`-o ./<basename>`). Write that text against the new output-path behaviour the other session is landing.
- **Files:** `packages/motif-sdk/src/generate.ts`, `packages/motif-sdk/src/errors.ts`, `apps/cli/src/utils/errors.ts` (`getStructuredDetails`), `apps/cli/src/utils/error-catalog.ts`.
- **Complexity:** M
- **Score impact:** Error Handling 2→3. Targets 206 + 64 measured failures.
- **Dependencies:** output-path change (in flux); gpt2 transparency (in flux, should appear in `supportedBy` for `transparent`).
- **Status (2026-09-10, after the audit):** the SDK half is already underway in the other session. An uncommitted `packages/motif-sdk/src/capabilities.ts` adds `OPTION_CAPABILITIES` so an error "can name both what a model does support and which models support the option that was refused", and `generate.ts` `unsupported()` now takes a typed option. What's left is making sure the CLI surfaces it as `details` plus a concrete suggestion, and the `INVALID_OUTPUT_PATH` half.
- **Owner:** coding worker.
- **Verification:** `motif "a cat" -m gpt -r 4K --dry-run --format json` returns `details.supportedBy` (non-empty) and a suggestion naming a model. `-o ../x.png` returns a suggestion. Add both to `apps/cli/tests/agent-fixtures.test.ts`.

### SURF-13: Tool list points to verbs

- **Description:** Add `verb` to each registry entry a verb wraps (`object-removal`→`erase`, `ideogram-reframe`→`reframe`, `sam3-image`/`sam3-image-rle`→`segment`, `moondream-*`→`ask`, the eight Topaz modes→`enhance`, `qwen-layered`→`layers`, `recraft-vectorize`→`vectorize`). Derive it from the verb descriptors' `tools` arrays, don't hand-write it. Show it in `tool list`, `tool describe`, and as a `hint` field in `tool run` JSON output ("same endpoint as `motif erase`, which also opens, records history and puts the path at top level").
- **Files:** `apps/cli/src/commands/tools.ts`, `apps/cli/src/commands/tool-run.ts`, `apps/cli/src/commands/verbs/shared.ts`.
- **Complexity:** S
- **Score impact:** Tool Design 2→3. Targets the 37 `tool run` detours.
- **Dependencies:** none.
- **Owner:** coding worker.
- **Verification:** `motif tool list --format json | jq '.tools["object-removal"].verb'` returns `"erase"`. A test asserts every id in any verb's `tools` has a matching `verb`.

### SURF-14: Did-you-mean for task words

- **Description:** When argv holds more than one positional and `argv[0]` isn't a command (today's "too many arguments" path), look `argv[0]` up in the SURF-15 synonym table and return `INVALID_OPTION` with `details.didYouMean` (the corrected invocation) plus a suggestion. Reuse the `reservedPromptSuggestion` pattern at `apps/cli/src/cli.ts:383`. Minimum synonyms: `remove`/`delete`/`inpaint`/`erase-object`→`erase`; `extend`/`expand`/`outpaint`/`crop`/`resize`/`ratio`→`reframe`; `split`/`separate`/`layer`→`layers`; `mask`/`cutout`/`select`→`segment`; `caption`/`describe-image`/`detect`/`count`/`ocr`→`ask`; `upscale`/`restore`/`denoise`/`sharpen`→`enhance`; `svg`/`trace`→`vectorize`; `grid`/`montage`/`contact-sheet`/`collage`→`sheet`; `set`/`batch`/`consistent`→`series run`. Also add an advisory `warnings` rule to `generate`: when the prompt starts with "remove", "erase", "extend" or "outpaint" and `-e` is set, point to the verb. The warnings mechanism already exists.
- **Files:** `apps/cli/src/index.ts`, `apps/cli/src/utils/errors.ts`, `packages/motif-sdk/src/` prompt-warning rules.
- **Complexity:** S
- **Score impact:** Error Handling 2→3, CLI.
- **Dependencies:** SURF-15 table. `sheet` in flux.
- **Owner:** coding worker.
- **Verification:** `motif remove "the car" x.png --format json` exits 2 with `details.didYouMean` = `motif erase "the car" x.png`. `motif grid a.png b.png` points to `sheet`.

### SURF-15: `whenToUse` / `notFor` / `tasks` in `--describe`

- **Description:** Add one task table (in `apps/cli/src/commands/verbs/` or the SDK registry) holding, per command: `whenToUse` (one sentence, in user words), `notFor` (with the sibling command or tool id), and `tasks` (the synonym list SURF-14 uses). Put each field on its command in `--describe`, and add a compact top-level `tasks` block of about 40 lines, task→command, ahead of `commands`, so the first bytes of a 142 KB schema are the routing table. Add `motif --describe tasks` for the table alone. Fix `ask` to `mutating: false`. Additive only; no existing keys change.
- **Files:** `apps/cli/src/commands/describe.ts`, `apps/cli/src/commands/verbs/*.ts`, `apps/cli/src/commands/series.ts`.
- **Complexity:** M
- **Score impact:** Tool Design 2→3.
- **Dependencies:** none. It feeds SURF-9, SURF-11, SURF-13 and SURF-14.
- **Owner:** coding worker.
- **Verification:** `motif --describe tasks --format json` lists every command. A test asserts every `commands.*` entry has `whenToUse`, and `commands.ask.mutating === false`.

### SURF-16: Ship the guide with the package

- **Description:** Add `AGENTS.md` (or a trimmed `SKILL.md` with `when_to_use` frontmatter) to `apps/cli/package.json` `files`. Rewrite `apps/cli/README.md` "Agent Entry Points" to lead with the task index and the verbs. Its `motif tool sam3-image --input` example works but is the least discoverable form, so replace it with `motif segment`. **Ask first:** changing a package `files` allowlist.
- **Files:** `apps/cli/package.json`, `apps/cli/README.md`, optionally `apps/cli/SKILL.md`.
- **Complexity:** S
- **Score impact:** CLI Design 2→3 (meets the "ships with the CLI" detection), Discovery 2→3.
- **Dependencies:** SURF-9, SURF-17 (ship the short guide, not the 633-line one).
- **Owner:** docs worker, after Daniel approves the `files` change.
- **Verification:** `pnpm --filter @howells/motif-cli pack --dry-run` lists `AGENTS.md`. No `workspace:` in packed `package.json`.

### SURF-17: Cut the CLI guide under 370 lines

- **Description:** Keep in `apps/cli/AGENTS.md`: Quick Start, task index, Agent Invariants (add the verbs to the mutating list), output-path table, exit codes. Move to `docs/cli/`: cost tables (`costs.md`), full error catalogue (`errors.md`), Series detail (`series.md`), creative direction tables (`looks.md`), each linked from the guide. Keep `docs-sync.test.ts` pointed at wherever each table ends up.
- **Files:** `apps/cli/AGENTS.md`, new `docs/cli/*.md`, `apps/cli/tests/docs-sync.test.ts`.
- **Complexity:** M
- **Score impact:** Context Files 2→3.
- **Dependencies:** SURF-9. Avoid overlapping the other session's doc edits: sequence after they land.
- **Owner:** docs worker.
- **Verification:** `wc -l apps/cli/AGENTS.md` < 370. `pnpm --filter @howells/motif-cli test` (docs-sync) passes.

### SURF-18: Routing eval

- **Description:** 20 to 30 task prompts drawn from the transcript evidence ("remove the car from street.png", "make this 16:9 without cropping the subject", "put these six in a grid", "our usual editorial look", "six images that look like a set", "split this poster into layers", "which models can do 4K?"). Run each 3 times against a model given only what ships: the global quick reference, `motif --help`, `motif --describe tasks`. Grade the **first motif command** by string match on command and key flags, dry-run only, no spend. Report pass^3 per task and overall, and compare against a stored baseline. Opt-in in CI, like the fal canaries.
- **Files:** `evals/routing/cases.jsonl`, `evals/routing/run.ts`, `evals/routing/baseline.json`, root `package.json` script.
- **Complexity:** M
- **Score impact:** Testing 2→3. It's also the exit condition for this plan.
- **Dependencies:** SURF-10, SURF-11, SURF-15 (what it measures). Run once **before** them to record today's baseline.
- **Owner:** testing worker. **Ask first:** it spends model tokens, though no fal credits.
- **Verification:** `pnpm eval:routing` prints per-case pass^3. Baseline today is expected near 0 for verb tasks. Target at least 0.9 after SURF-9 to SURF-15.

## Not in this plan

- Authentication 2→3: still blocked on product direction (credential sources and lifecycle).
- Building `motif sheet`: the other session owns it. This plan only requires that it enters the task table, `--help` and the did-you-mean list when it lands.
