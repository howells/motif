# Issue tracker: Linear (MOT team)

Issues and specs for this repo live in **Linear**, not GitHub. The GitHub repo has no
issues and is not a tracker - it is the code host and the release surface only.

| | |
| --- | --- |
| Workspace | `Howells` (urlKey `howells`), org id `e51748f5-c341-4ed5-904e-470fdad941aa` |
| Team | `MOT` - "Motif", team id `7a2b0c9f-20d6-4f04-a667-8eff77cbf358` |
| Board | <https://linear.app/howells/team/MOT> |

## Reaching it

**Do not use the Linear MCP tools.** They authenticate against a different workspace and
cannot see the MOT team. Use the GraphQL API directly with the workspace key:

```bash
K=$(op read "op://keys/linear/credential")

q() {
  curl -s -X POST https://api.linear.app/graphql \
    -H "Authorization: $K" -H "Content-Type: application/json" -d "$1"
}
```

The key is also exported into interactive fish shells by
`~/.config/fish/conf.d/zz-linear-keys.fish`, so `$LINEAR_API_KEY` may already be set;
read it from 1Password when it is not. Never echo the key.

## Conventions

Always scope by team - the workspace holds many teams and an unscoped query returns all
of them.

- **List open issues**

  ```bash
  q '{"query":"{ issues(filter:{team:{key:{eq:\"MOT\"}}, state:{type:{nin:[\"completed\",\"canceled\"]}}}, first:50) { nodes { identifier title state { name } labels { nodes { name } } } } }"}'
  ```

- **Read one issue with comments**

  ```bash
  q '{"query":"{ issue(id:\"MOT-33\") { identifier title description state { name } labels { nodes { name } } comments { nodes { body createdAt } } } }"}'
  ```

- **Create an issue** - `teamId` is required; `labelIds` is an **array of ids**, never
  label names.

  ```bash
  q '{"query":"mutation($i:IssueCreateInput!){ issueCreate(input:$i){ success issue { identifier url } } }","variables":{"i":{"teamId":"7a2b0c9f-20d6-4f04-a667-8eff77cbf358","title":"...","description":"...","labelIds":["<uuid>"]}}}'
  ```

- **Resolve a label name to an id** before using it

  ```bash
  q '{"query":"{ issueLabels(filter:{name:{eq:\"ready-for-agent\"}}) { nodes { id name } } }"}'
  ```

- **Comment**

  ```bash
  q '{"query":"mutation($i:CommentCreateInput!){ commentCreate(input:$i){ success } }","variables":{"i":{"issueId":"<issue uuid>","body":"..."}}}'
  ```

- **Move state** - resolve the state id first, then `issueUpdate` with `stateId`.

  ```bash
  q '{"query":"{ workflowStates(filter:{team:{key:{eq:\"MOT\"}}}) { nodes { id name type } } }"}'
  ```

- **Blocking edges** - Linear has native issue relations. Create one with
  `issueRelationCreate` and `type: "blocks"`, where `issueId` blocks `relatedIssueId`.

  ```bash
  q '{"query":"mutation($i:IssueRelationCreateInput!){ issueRelationCreate(input:$i){ success } }","variables":{"i":{"issueId":"<blocker uuid>","relatedIssueId":"<blocked uuid>","type":"blocks"}}}'
  ```

## Workflow states

`Backlog` (backlog) · `Todo` (unstarted) · `In Progress` (started) · `In Review` (started)
· `Done` (completed) · `Canceled` (canceled) · `Duplicate` (duplicate)

Filter by `state.type`, not by name - the names are display strings and the types are the
contract.

## When a skill says "publish to the issue tracker"

Create a Linear issue on team `MOT`.

## When a skill says "fetch the relevant ticket"

Query `issue(id: "MOT-<n>")` with its comments.

## Wayfinding operations

Used by `/wayfinder`. The **map** is one issue; tickets are its sub-issues.

- **Map**: an issue labelled `wayfinder:map` holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue with `parentId` set to the map's uuid, labelled
  `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`).
- **Blocking**: `issueRelationCreate` with `type: "blocks"` as above. A ticket is
  unblocked when every blocker sits in a `completed` or `canceled` state.
- **Frontier query**: the map's open children with no open blocker and no assignee; first
  in `sortOrder` wins.
- **Claim**: `issueUpdate` setting `assigneeId` to yourself - the session's first write.
- **Resolve**: comment the answer, move to `Done`, then append a pointer to the map's
  Decisions-so-far.

## Pull requests as a request surface

**PRs as a request surface: no.** This repo takes no external contributions through PRs,
so `/triage` should not read GitHub. Flip this line to `yes` if that ever changes.
