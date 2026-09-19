# Releasing

A version tag publishes the package it names. `.github/workflows/release.yml` runs the gate, packs the tarball, installs it into a fresh consumer and publishes to npm.

Bump the version in `package.json`, commit, push, then tag. The job refuses to run when the tag and the manifest disagree, and npm refuses a version already on the registry.

```bash
git tag '@howells/motif-sdk@4.0.0' && git push origin '@howells/motif-sdk@4.0.0'
git tag '@howells/motif-cli@3.0.0' && git push origin '@howells/motif-cli@3.0.0'
```

Tag the SDK first and let it finish, because the CLI resolves a real published SDK version.

`workflow_dispatch` on the same workflow takes a package name and a `dry_run` box, for rehearsing the gate or re-running a publish that failed after the tag was cut.

The workflow refuses a tarball carrying a `workspace:` or `catalog:` specifier. `@howells/motif-cli` depends on `@howells/motif-sdk` as `workspace:*`, only pnpm rewrites that to a real version, and `npm pack` ships the literal string, which sank 1.8.0 (now deprecated on the registry). Packing by hand needs `pnpm pack`.

Afterwards `npm view @howells/motif-cli@<version> dependencies` should show a real SDK version.
