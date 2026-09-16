# Error catalogue

Every error code the CLI can emit, grouped by where it comes from. Part of the [CLI agent guide](../AGENTS.md), which carries the exit codes and the common recoveries. For what each code means, whether a retry can help and how to recover, run `motif --describe errors --format json`.

## Envelope

In JSON mode, errors are written to stderr as:

```json
{
  "error": true,
  "code": "UNKNOWN_MODEL",
  "message": "Unknown model: foo",
  "is_retriable": false,
  "details": {
    "available": [
      "gpt2",
      "gpt",
      "banana2",
      "banana",
      "gemini",
      "gemini3",
      "seedream4",
      "seedream45",
      "seedream5",
      "seedream5-lite",
      "flux2-max",
      "flux2-pro",
      "flux2-flex",
      "flux2-dev",
      "flux2-turbo",
      "flux",
      "flux-fast",
      "recraft",
      "recraft4",
      "ideogram",
      "ideogram4",
      "grok-image",
      "qwen",
      "qwen3"
    ]
  }
}
```

## Codes

Every code the CLI can emit is listed; the live catalog is available from `motif --describe --format json`.

- General: `MISSING_API_KEY`, `ACCOUNT_LOCKED`, `UNKNOWN_MODEL`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `REMOVED_COMMAND`, `NO_MODEL_AVAILABLE`, `NO_PREVIOUS`, `TRANSPARENCY_MISSING`, `DESCRIBE_FAILED`.
- Tasks: `TASK_FAILED`, from any Task verb, with `details.task` and `details.model`.
- Series: `SERIES_CREATE_FAILED`, `SERIES_NOT_FOUND`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`.

`NO_MODEL_AVAILABLE` exits `2` and means no Model can do what the request asks. Its `details` carry `blockedBy`, `unblockedBy` and `missingKey`. To recover, name a Model with `-m`, set the key, drop the option, or supply the input.

`MISSING_API_KEY` from `--transparent` on `gpt2` and `TRANSPARENCY_MISSING` are explained with the OpenAI transparency route in [generate input](generate.md#transparency).
