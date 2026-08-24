# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to
the actual label strings used in this repo's issue tracker.

All five already exist in the `Howells` Linear workspace, so use them as-is - do not
create duplicates.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

Linear's API takes label **ids**, not names, so resolve the name first - see
`issue-tracker.md`. Labels are workspace-wide here, not team-scoped.

Triage is only for issues you did not create. Tickets produced by `/to-tickets` are
already agent-ready and should not be run through it.
