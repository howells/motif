# Contributing

## Setup

```bash
pnpm install
cp .env.example .env
```

Set `FAL_KEY` when running live generation. Dry runs, schema description, and most tests do not require an API key.

## Project Layout

```text
apps/
  cli/          @howells/motif-cli command package
packages/
  motif-sdk/    canonical public Node SDK
```

## Checks

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm check
```

Packages use strict `files` allowlists. Do not add local environment files, generated images, coverage output, or build cache directories to published artifacts. Inspect what a package would ship with:

```bash
pnpm --filter @howells/motif-cli pack --dry-run
pnpm --filter @howells/motif-sdk pack --dry-run
```

## Releasing

Releases run in CI, not from a laptop. Bump the version in the package's `package.json`, merge to `main`, then run the Release workflow:

```bash
gh workflow run release.yml                    # publish
gh workflow run release.yml -f dry_run=true    # pack and verify only
```

It publishes only versions npm does not already have, so it is safe to re-run. Authentication is npm Trusted Publishing over OIDC - there is no npm token to hold, rotate, or leak.
