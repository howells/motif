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

Nothing runs in CI. Releases are published from a local machine with npm logged in (`npm whoami`) or a token in the environment.

Bump the version in the package's `package.json`, merge to `main`, run `pnpm check`, then pack with pnpm and publish with npm. The SDK goes first, because the CLI resolves a real published SDK version:

```bash
pnpm --filter @howells/motif-sdk pack --pack-destination /tmp
npm publish /tmp/howells-motif-sdk-<version>.tgz --access public

pnpm --filter @howells/motif-cli pack --pack-destination /tmp
npm publish /tmp/howells-motif-cli-<version>.tgz --access public
```

pnpm packs and npm publishes because only pnpm rewrites the `workspace:*` dependency to a real version. Check each packed `package.json` for a surviving `workspace:` before publishing. npm refuses a version already on the registry, so a re-run after a partial failure is safe.
