export interface ErrorMetadata {
  docUri: string;
  isRetriable: boolean;
  status: number;
  suggestions?: string[];
  title: string;
  type: string;
}

const ERROR_SUGGESTIONS = {
  apiKey: ["Set the FAL_KEY environment variable: export FAL_KEY=your_key"],
  describe: ["Run 'motif --describe --format json' to inspect valid commands"],
  models: [
    "Run 'motif --describe generate --format json' to inspect valid models",
  ],
  prompt: ["Provide a non-empty prompt as an argument or stdin JSON field"],
  series: ["Run 'motif series list --format json' to inspect available series"],
} as const;

function titleFromCode(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function slugFromCode(code: string): string {
  return code.toLowerCase().replaceAll("_", "-");
}

function metadata(
  code: string,
  status: number,
  options: {
    isRetriable?: boolean;
    suggestions?: string[];
    title?: string;
  } = {}
): ErrorMetadata {
  const slug = slugFromCode(code);
  return {
    docUri: `motif://describe/errors#${slug}`,
    isRetriable: options.isRetriable ?? false,
    status,
    title: options.title ?? titleFromCode(code),
    type: `urn:motif:error:${slug}`,
    ...(options.suggestions ? { suggestions: options.suggestions } : {}),
  };
}

export const ERROR_CATALOG = {
  ACCOUNT_LOCKED: metadata("ACCOUNT_LOCKED", 403, {
    suggestions: [
      "The fal account is out of credit. Top up at https://fal.ai/dashboard/billing, then run the command again",
    ],
  }),
  DESCRIBE_FAILED: metadata("DESCRIBE_FAILED", 500, {
    isRetriable: true,
    suggestions: [...ERROR_SUGGESTIONS.describe],
  }),
  EMPTY_PROMPT: metadata("EMPTY_PROMPT", 400, {
    suggestions: [...ERROR_SUGGESTIONS.prompt],
  }),
  INVALID_EDIT_PATH: metadata("INVALID_EDIT_PATH", 400),
  INVALID_IMAGE_PATH: metadata("INVALID_IMAGE_PATH", 400),
  INVALID_OPTION: metadata("INVALID_OPTION", 400, {
    suggestions: [...ERROR_SUGGESTIONS.describe],
  }),
  INVALID_OUTPUT_PATH: metadata("INVALID_OUTPUT_PATH", 400, {
    suggestions: [
      "Write inside the git root of the current directory, or inside the current directory outside a repository",
      "Use a relative path such as -o out/image.png, without .. segments",
    ],
  }),
  INVALID_STDIN: metadata("INVALID_STDIN", 400, {
    suggestions: [
      "Provide valid JSON matching the motif stdin schema; run 'motif --describe --format json' for the schema",
    ],
  }),
  MISSING_API_KEY: metadata("MISSING_API_KEY", 401, {
    suggestions: [...ERROR_SUGGESTIONS.apiKey],
  }),
  NO_MODEL_AVAILABLE: metadata("NO_MODEL_AVAILABLE", 400, {
    suggestions: [
      "Name a Model with --model, change --tier, set the missing key, or drop the option that no Model can honour",
    ],
  }),
  NO_PREVIOUS: metadata("NO_PREVIOUS", 404, {
    suggestions: [
      "Pass the image as an argument, e.g. motif upscale photo.png",
      'Or generate an image first: motif "a prompt"',
    ],
  }),
  REMOVED_COMMAND: metadata("REMOVED_COMMAND", 400, {
    suggestions: [
      "details.use names the replacement; run that instead",
      "Run 'motif --describe tasks --format json' to see the command for each job",
    ],
  }),
  RESERVED_PROMPT: metadata("RESERVED_PROMPT", 400, {
    suggestions: [
      "Use the flag form of the command (e.g. 'motif --history')",
      'To really generate an image from a one-word prompt that matches a command word, pass it via stdin JSON: echo \'{"prompt":"history"}\' | motif',
    ],
  }),
  SERIES_CREATE_FAILED: metadata("SERIES_CREATE_FAILED", 500, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_DELETE_FAILED: metadata("SERIES_DELETE_FAILED", 500, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_GENERATE_FAILED: metadata("SERIES_GENERATE_FAILED", 502, {
    isRetriable: true,
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_NOT_FOUND: metadata("SERIES_NOT_FOUND", 404, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_REF_ADD_FAILED: metadata("SERIES_REF_ADD_FAILED", 500, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  SERIES_REF_REMOVE_FAILED: metadata("SERIES_REF_REMOVE_FAILED", 500, {
    suggestions: [...ERROR_SUGGESTIONS.series],
  }),
  TASK_FAILED: metadata("TASK_FAILED", 502, {
    isRetriable: true,
    suggestions: [
      "Retry the same command; details.task and details.model name what failed",
      "Or choose another Model with --tier or -m",
    ],
  }),
  TRANSPARENCY_MISSING: metadata("TRANSPARENCY_MISSING", 502, {
    isRetriable: true,
    suggestions: [
      "The file is left on disk; details.paths lists it. Retry the same command",
      "Or choose another Model with -m",
    ],
  }),
  UNKNOWN_MODEL: metadata("UNKNOWN_MODEL", 400, {
    suggestions: [...ERROR_SUGGESTIONS.models],
  }),
} as const satisfies Record<string, ErrorMetadata>;

export type KnownErrorCode = keyof typeof ERROR_CATALOG;

export function getErrorMetadata(code: string): ErrorMetadata {
  const known = (ERROR_CATALOG as Record<string, ErrorMetadata>)[code];
  if (known !== undefined) {
    return known;
  }
  return metadata(code, 500);
}
