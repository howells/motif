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

- General: `MISSING_API_KEY`, `ACCOUNT_LOCKED`, `UNKNOWN_MODEL`, `INVALID_MODEL_ID`, `INVALID_OPTION`, `INVALID_OUTPUT_PATH`, `INVALID_EDIT_PATH`, `INVALID_IMAGE_PATH`, `INVALID_STDIN`, `EMPTY_PROMPT`, `RESERVED_PROMPT`, `TOO_MANY_REFERENCES`, `NO_PREVIOUS`, `GENERATION_FAILED`, `TRANSPARENCY_MISSING`, `UPSCALE_FAILED`, `RMBG_FAILED`, `VIDEO_FAILED`, `DESCRIBE_FAILED`.
- Tools: `UNKNOWN_TOOL`, `INVALID_TOOL_ID`, `TOOL_FAILED`.
- Verbs: `SEGMENT_FAILED`, `ASK_FAILED`, `ERASE_FAILED`, `REFRAME_FAILED`, `ENHANCE_FAILED`, `LAYERS_FAILED`, `VECTORIZE_FAILED`.
- Series: `SERIES_CREATE_FAILED`, `SERIES_NOT_FOUND`, `SERIES_REF_ADD_FAILED`, `SERIES_REF_REMOVE_FAILED`, `SERIES_GENERATE_FAILED`, `SERIES_DELETE_FAILED`.

`MISSING_API_KEY` from `--transparent` on `gpt2` and `TRANSPARENCY_MISSING` are explained with the OpenAI transparency route in [generate input](generate.md#transparency).
