import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  outputRoot,
  parseIntegerOption,
  parseNumberOption,
  reservedPromptSuggestion,
  sanitizePrompt,
  validateEditPath,
  validateEnumOption,
  validateOutputPath,
  validateResourceId,
} from "../src/utils/input";

describe(sanitizePrompt, () => {
  it("passes through normal text", () => {
    expect(sanitizePrompt("a cat on a windowsill")).toBe(
      "a cat on a windowsill"
    );
  });

  it("strips control characters", () => {
    expect(sanitizePrompt("hello\u0000world\u0007")).toBe("helloworld");
  });

  it("preserves newlines", () => {
    expect(sanitizePrompt("line one\nline two")).toBe("line one\nline two");
  });

  it("normalizes CRLF to LF", () => {
    expect(sanitizePrompt("line one\r\nline two")).toBe("line one\nline two");
  });

  it("trims whitespace", () => {
    expect(sanitizePrompt("  hello  ")).toBe("hello");
  });

  it("returns empty string for control-only input", () => {
    expect(sanitizePrompt("\u0000\u0001\u0002")).toBe("");
  });
});

describe(validateResourceId, () => {
  it("passes valid model names", () => {
    expect(validateResourceId("gpt", "model")).toBe("gpt");
    expect(validateResourceId("banana", "model")).toBe("banana");
    expect(validateResourceId("gemini3", "model")).toBe("gemini3");
  });

  it("rejects path traversal with ..", () => {
    expect(() => validateResourceId("../etc/passwd", "model")).toThrow(
      "path traversal"
    );
  });

  it("rejects forward slashes", () => {
    expect(() => validateResourceId("fal-ai/gpt-image-1", "model")).toThrow(
      "path traversal"
    );
  });

  it("rejects backslashes", () => {
    expect(() => validateResourceId("foo\\bar", "model")).toThrow(
      "path traversal"
    );
  });

  it("rejects percent-encoded traversal", () => {
    expect(() => validateResourceId("%2e%2e%2fetc", "model")).toThrow(
      "percent-encoded"
    );
    expect(() => validateResourceId("foo%2Fbar", "model")).toThrow(
      "percent-encoded"
    );
  });

  it("rejects embedded query params", () => {
    expect(() => validateResourceId("model?version=2", "model")).toThrow(
      "query params"
    );
    expect(() => validateResourceId("model#anchor", "model")).toThrow(
      "query params"
    );
  });

  it("rejects control characters", () => {
    expect(() => validateResourceId("model\u0000name", "model")).toThrow(
      "control characters"
    );
  });
});

/** A temp directory with a `.git` marker and an `apps/cli` subdirectory. */
function fakeRepo(): string {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "motif-repo-")));
  mkdirSync(join(repo, ".git"));
  mkdirSync(join(repo, "apps", "cli"), { recursive: true });
  return repo;
}

describe(validateOutputPath, () => {
  it("accepts a simple filename in CWD", () => {
    const result = validateOutputPath("output.png");
    expect(result).toContain("output.png");
  });

  it("accepts a subdirectory path", () => {
    const result = validateOutputPath("images/output.png");
    expect(result).toContain("images/output.png");
  });

  it("allows a path anywhere under the git root, even above CWD", () => {
    const repo = fakeRepo();
    const cwd = join(repo, "apps", "cli");
    expect(outputRoot(cwd)).toBe(repo);
    expect(validateOutputPath("../../out.png", cwd)).toBe(
      join(repo, "out.png")
    );
  });

  it("refuses a path that leaves the git root and names the root", () => {
    const repo = fakeRepo();
    const cwd = join(repo, "apps", "cli");
    expect(() => validateOutputPath("../../../outside.png", cwd)).toThrow(
      `Output path must be within ${repo}`
    );
  });

  it("falls back to CWD outside a repository", () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), "motif-norepo-")));
    const cwd = join(dir, "work");
    mkdirSync(cwd);
    expect(outputRoot(cwd)).toBe(cwd);
    expect(validateOutputPath("out.png", cwd)).toBe(join(cwd, "out.png"));
    expect(() => validateOutputPath("../out.png", cwd)).toThrow(
      `Output path must be within ${cwd}`
    );
  });

  it("rejects absolute paths outside the root", () => {
    expect(() => validateOutputPath("/tmp/evil.png")).toThrow(
      "Output path must be within"
    );
  });

  it("rejects percent-encoded traversal", () => {
    expect(() => validateOutputPath("%2e%2e/evil.png")).toThrow(
      "percent-encoded"
    );
  });

  it("rejects embedded query params", () => {
    expect(() => validateOutputPath("file.png?foo=bar")).toThrow(
      "query params"
    );
  });

  it("rejects control characters", () => {
    expect(() => validateOutputPath("file\u0000.png")).toThrow(
      "control characters"
    );
  });
});

describe(validateEditPath, () => {
  it("rejects percent-encoded traversal", () => {
    expect(() => validateEditPath("%2e%2e/image.png")).toThrow(
      "percent-encoded"
    );
  });

  it("rejects control characters", () => {
    expect(() => validateEditPath("image\u0000.png")).toThrow(
      "control characters"
    );
  });

  it("rejects non-existent files", () => {
    expect(() => validateEditPath("/nonexistent/file.png")).toThrow(
      "not found"
    );
  });

  it("rejects unsupported file types", () => {
    // Use a file that exists but isn't an image
    expect(() => validateEditPath(__filename)).toThrow("must be PNG");
  });
});

describe(parseIntegerOption, () => {
  it("accepts integers within range", () => {
    expect(parseIntegerOption("4", "count", { max: 4, min: 1 })).toBe(4);
  });

  it("rejects decimal and mixed strings", () => {
    expect(() => parseIntegerOption("4.5", "count")).toThrow("integer");
    expect(() => parseIntegerOption("4abc", "count")).toThrow("integer");
  });

  it("rejects out-of-range values", () => {
    expect(() => parseIntegerOption("0", "count", { min: 1 })).toThrow(">= 1");
    expect(() => parseIntegerOption("5", "count", { max: 4 })).toThrow("<= 4");
  });
});

describe(parseNumberOption, () => {
  it("accepts finite numbers within range", () => {
    expect(parseNumberOption("0.7", "cfg", { max: 1, min: 0 })).toBe(0.7);
  });

  it("rejects invalid and out-of-range numbers", () => {
    expect(() => parseNumberOption("abc", "cfg")).toThrow("number");
    expect(() => parseNumberOption("1.5", "cfg", { max: 1 })).toThrow("<= 1");
  });
});

describe(validateEnumOption, () => {
  it("accepts listed values", () => {
    expect(validateEnumOption("png", ["jpeg", "png", "webp"], "format")).toBe(
      "png"
    );
  });

  it("rejects unlisted values", () => {
    expect(() =>
      validateEnumOption("gif", ["jpeg", "png", "webp"], "format")
    ).toThrow("one of");
  });
});

describe(reservedPromptSuggestion, () => {
  it("suggests the flag form for a bare command word", () => {
    expect(reservedPromptSuggestion("history")).toBe("motif --history");
    expect(reservedPromptSuggestion("upscale")).toBe("motif --up");
    expect(reservedPromptSuggestion("version")).toBe("motif --version");
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(reservedPromptSuggestion("  History ")).toBe("motif --history");
  });

  it("returns null for multi-word prompts containing a command word", () => {
    expect(
      reservedPromptSuggestion("history of rome, oil painting")
    ).toBeNull();
  });

  it("returns null for ordinary one-word prompts", () => {
    expect(reservedPromptSuggestion("sunset")).toBeNull();
  });

  it("returns null for empty or whitespace-only prompts", () => {
    expect(reservedPromptSuggestion("")).toBeNull();
    expect(reservedPromptSuggestion("   ")).toBeNull();
  });
});
