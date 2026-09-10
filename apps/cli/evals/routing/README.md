# Routing eval

Measures whether an agent that has only what Motif ships picks the right `motif` command for a plain request. It's the exit check for the surface plan (`docs/surface/plan.md`, SURF-18).

For each case the model gets:

- root `AGENTS.md`
- `apps/cli/AGENTS.md`, plus every page it links to with a relative `.md` link (the `apps/cli/docs/` reference pages), resolved against `apps/cli/`
- `llms.txt`
- the output of `motif --help` and `motif --describe tasks --format json`, from the built CLI

Then a request in the user's words ("remove the car from street.png") and an instruction to reply with the one `motif` command it would run first. The grader takes the first `motif` invocation from the answer, works out which command it routes to, and checks any flags and arguments the case requires. There's no model grading, the command is never run, and fal is never called.

Everything is read at run time, so the eval measures the docs and CLI as they are when it runs. The consumer quick reference in `~/.claude/CLAUDE.md` lives outside the repo and isn't included. The eval lives in `apps/cli` so it lints and tests with the CLI, but `evals/` isn't in the package's `files`, so it never ships.

## Backends

- **`claude -p`**, used when `ANTHROPIC_API_KEY` isn't set. Each call runs headless from an empty temporary directory, with the surfaces as a replacement system prompt (`--system-prompt-file`) and the request on stdin. `--tools ""`, `--safe-mode`, `--setting-sources ""`, `--strict-mcp-config`, `--disable-slash-commands` and `--no-session-persistence` keep out the user's CLAUDE.md, memory, settings, hooks, plugins, skills, MCP servers and tools. Cost is what the CLI reports.
- **Messages API**, used when `ANTHROPIC_API_KEY` is set. The system prompt is cached, and the first call runs alone so the rest read the cache. Cost is priced from the returned usage.

Claude Sonnet 5 and newer models reject `temperature`, so neither backend sets one for them, and each case runs three times and reports pass^3. On the API, older models that still accept it get `temperature: 0`.

## Files

- `cases.jsonl` - one case per line: `id`, `request`, `command` (a `--describe tasks` command key, or a list when more than one is right), optional `flags` (`"--look editorial"`; a nested list means any one of them), optional `args` (such as the image path) and `source` (the audit finding or plan line it tests).
- `grade.ts` - parses the answer and scores it.
- `prompt.ts` - loads the cases and surfaces and builds the prompts.
- `backends.ts` - the `claude -p` and Messages API calls.
- `env.ts` - reads `ANTHROPIC_API_KEY`, the only environment value the eval uses.
- `run.ts` - the runner.
- `apps/cli/tests/routing-grade.test.ts` - offline test of the grader against canned answers, plus checks that the cases cover every command in `--describe tasks`.
- `baseline.json` - written by `--write-baseline`; later runs report changes against it.
- `results/` - one JSON report per run (ignored by git).

## Running it

From the repo root, after `pnpm build` (the eval reads `apps/cli/dist`):

```sh
pnpm --filter @howells/motif-cli exec vitest run tests/routing-grade.test.ts   # free: proves the grader
pnpm eval:routing --dry-run    # free: surfaces, prompt size and estimated cost
pnpm eval:routing              # spends model tokens: 3 runs per case on claude-sonnet-5
```

Options:

- `--model <id>` - `claude-sonnet-5` by default. Also priced: `claude-opus-5`, `claude-fable-5-1`, `claude-sonnet-4-6`, `claude-haiku-4-5`.
- `--runs <n>` - runs per case, default 3. A case passes pass^k only when every run passes.
- `--case <id>` - repeatable, runs only those cases.
- `--effort <level>` - passed as `--effort` to `claude -p`, or `output_config.effort` on the API. The default applies when it's left out.
- `--concurrency <n>` - parallel calls after the first, default 4.
- `--write-baseline` - records this run as `baseline.json`.

The report prints each case with the command picked, overall accuracy (passing calls over all calls), pass^k across cases, and both per expected command. The full JSON, including every raw answer, goes to `results/`.
