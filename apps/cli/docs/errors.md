# Error catalogue

Every error code the CLI can emit, grouped by where it comes from. Part of the [CLI agent guide](../AGENTS.md), which carries the exit codes and the common recoveries. For what each code means, whether a retry can help and how to recover, run `motif --describe errors --format json`.

## Envelope

In JSON mode, errors are written to stderr as one object:

```json
{
  "type": "urn:motif:error:removed-command",
  "title": "Removed Command",
  "status": 400,
  "doc_uri": "motif://describe/errors#removed-command",
  "error": true,
  "code": "REMOVED_COMMAND",
  "message": "--rmbg was removed. Use motif cutout instead.",
  "details": { "removed": "--rmbg", "use": "motif cutout" },
  "is_retriable": false,
  "suggestions": ["details.use names the replacement; run that instead"]
}
```

## Codes

- General: `MISSING_API_KEY`, `ACCOUNT_LOCKED`, `UNKNOWN_MODEL`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `NO_PREVIOUS`, `TRANSPARENCY_MISSING`, `DESCRIBE_FAILED`.
- Tasks: `NO_MODEL_AVAILABLE`, `TASK_FAILED`, `REMOVED_COMMAND`.
- Series: `SERIES_CREATE_FAILED`, `SERIES_NOT_FOUND`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`.

## Task errors

`NO_MODEL_AVAILABLE` exits `2`: no Model can do what the request asks. Its `details` say why and what would fix it.

- `blockedBy` is what ruled the Models out: a capability the request needs (`seed`, `mask`, `transparency`, `references`, `video`, `rig` and the rest), `key` for a missing API key, or `mode`.
- `unblockedBy` lists the fixes that would work: `model` (name one with `-m`), `key` (set it; `missingKey` names the variable), `option` (drop the option) or `input` (supply the input, such as a mask).

```json
{
  "code": "NO_MODEL_AVAILABLE",
  "message": "gpt2 (model) cannot do seed.",
  "details": {
    "blockedBy": "seed",
    "task": "generate",
    "unblockedBy": ["option"]
  }
}
```

`UNKNOWN_MODEL` exits `2`: `-m` names something that isn't a Model for this Task. `details.blockedBy` is `unknown-model`, `unblockedBy` is `["model"]`, and the message lists the Models the Task accepts.

`TASK_FAILED` exits `5`: the Model ran and the provider failed, or returned nothing to save. `details.task` and `details.model` name what ran.

`REMOVED_COMMAND` exits `2`: a flag or command from before Tasks. `details.removed` is what you typed and `details.use` the replacement. The full list is in [tasks](verbs.md#removed-commands).

`MISSING_API_KEY` from `--transparent` at the quality Tier and `TRANSPARENCY_MISSING` are explained with the OpenAI transparency route in [generate and vary](generate.md#transparency).
