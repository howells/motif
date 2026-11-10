# Error catalogue

Every error code the CLI can emit, grouped by where it comes from. Part of the [CLI agent guide](../AGENTS.md), which carries the exit codes and the common recoveries. For what each code means, whether a retry can help and how to recover, run `motif --describe errors --format json`.

## Envelope

In JSON mode, errors are written to stderr as one object:

```json
{
  "type": "urn:motif:error:invalid-option",
  "title": "Invalid Option",
  "status": 400,
  "doc_uri": "motif://describe/errors#invalid-option",
  "error": true,
  "code": "INVALID_OPTION",
  "message": "unknown option '--bogus'",
  "is_retriable": false,
  "suggestions": [
    "Run 'motif --describe --format json' to inspect valid commands"
  ]
}
```

## Codes

- General: `MISSING_API_KEY`, `ACCOUNT_LOCKED`, `UNKNOWN_MODEL`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `NO_PREVIOUS`, `TRANSPARENCY_MISSING`, `DESCRIBE_FAILED`, `CORRUPT_FILE`, `FILE_ACCESS_FAILED`.
- Tasks: `NO_MODEL_AVAILABLE`, `TASK_FAILED`, `SUBMISSION_UNCERTAIN`, `INVALID_RESPONSE`.
- Series: `SERIES_CREATE_FAILED`, `SERIES_NOT_FOUND`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`.

## Task errors

`NO_MODEL_AVAILABLE` exits `2`: no Model can do what the request asks. Its `details` say why and what would fix it.

- `blockedBy` is what ruled the Models out: a capability the request needs (`seed`, `mask`, `transparency`, `references`, `video`, `rig` and the rest), `key` for a missing API key, or `mode`.
- `unblockedBy` lists the fixes that would work: `model` (name one with `-m`), `key` (set it; `missingKey` names the variable), `option` (drop the option) or `input` (supply the input, such as a mask).

```json
{
  "code": "NO_MODEL_AVAILABLE",
  "message": "flare (model) cannot do seed.",
  "details": {
    "blockedBy": "seed",
    "task": "generate",
    "unblockedBy": ["option"]
  }
}
```

`UNKNOWN_MODEL` exits `2`: `-m` names something that isn't a Model for this Task. `details.blockedBy` is `unknown-model`, `unblockedBy` is `["model"]`, and the message lists the Models the Task accepts.

`TASK_FAILED` exits `5`: the Model ran and the provider failed, or returned nothing to save. `details.task` and `details.model` name what ran.

`SUBMISSION_UNCERTAIN` exits `5` and `is_retriable` is `false`: fal did not confirm a request that can bill (a connection error, a timeout or a 5xx before any answer). fal may have accepted it and may bill for it, so Motif sends a billable request once and never resends it, and neither should you: check fal's dashboard first. Status polls and result fetches, which cannot bill, are retried.

`INVALID_RESPONSE` exits `5` and `is_retriable` is `false`: fal's answer was not the JSON it should be. When fal had already accepted the run, `instance` is `urn:fal:request:<id>` and `details.requestId` and `details.endpoint` name it; it may still finish and be billed. Motif has no command that resumes a run from the CLI (the SDK's `resume` does), so look the request up in fal's dashboard rather than running the command again.

`CORRUPT_FILE` exits `2` (status `422`): `~/.motif/config.json`, `.motifrc`, `~/.motif/history.json` or a series' `series.json` exists but is not valid JSON or has the wrong shape. `details.path` names the file. Motif never overwrites such a file, so nothing is lost; repair it or move it away, then run the command again. A missing file is not an error: it means default config or empty history. Motif checks these files before a command that spends submits anything, so a corrupt file fails with nothing billed; see [what happens when a paid run cannot be recorded](output.md#when-a-paid-run-could-not-be-recorded). `series list` fails the same way when any one series file is unusable.

`FILE_ACCESS_FAILED` exits `2` (status `422`): the operating system would not let Motif read or write a file it keeps (`~/.motif/config.json`, `.motifrc`, history or a series file), for instance a directory where the file should be or no permission. `details.path` names it, `details.operation` is `read` or `write`, and `details.cause` is the system's error name (`EACCES`, `EISDIR`...). Nothing was changed; fix the permissions or what stands at that path, then run the command again.

`TRANSPARENCY_MISSING` is explained with transparency in [generate and vary](generate.md#transparency).
