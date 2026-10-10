# Routing eval

Documentation, specifications, decisions and outstanding work live in Linear (howells, MOT).

- [motif — project documentation](https://linear.app/howells/document/motif-project-documentation-8f35c5aa5226)

```sh
pnpm --filter @howells/motif-cli exec vitest run tests/routing-grade.test.ts   # free: proves the grader
pnpm eval:routing --dry-run    # free: surfaces, prompt size and estimated cost
pnpm eval:routing              # spends model tokens: 3 runs per case on claude-sonnet-5
```
