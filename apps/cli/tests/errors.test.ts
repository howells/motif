import { MotifError } from "@howells/motif-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleError } from "../src/utils/errors";

/** Shape of the structured error JSON emitted to stderr. */
interface ParsedError {
  code?: string;
  instance?: string;
  message?: string;
  [key: string]: unknown;
}

function parseError(json: string): ParsedError {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null) {
    throw new Error("expected a JSON object");
  }
  return value;
}

describe("handleError instance (fal request URN)", () => {
  let writtenData: string;

  beforeEach(() => {
    writtenData = "";
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writtenData += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    });
    // handleError exits after emitting — intercept so the test can continue.
    vi.spyOn(process, "exit").mockImplementation((): never => {
      throw new Error("process.exit");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes instance URN for a fal-originated MotifError", () => {
    expect(() => {
      handleError(
        new MotifError("Request failed: 500", 500, undefined, "req_fal_abc123"),
        "GENERATION_FAILED",
        "json"
      );
    }).toThrow("process.exit");

    const parsed = parseError(writtenData.trim());
    expect(parsed.instance).toBe("urn:fal:request:req_fal_abc123");
  });

  it("omits instance for a local validation error without a request id", () => {
    expect(() => {
      handleError(new Error("bad output path"), "INVALID_OUTPUT_PATH", "json");
    }).toThrow("process.exit");

    const parsed = parseError(writtenData.trim());
    expect(parsed).not.toHaveProperty("instance");
  });

  it("omits instance for a MotifError that carries no request id", () => {
    expect(() => {
      handleError(
        new MotifError("Request failed: 500", 500),
        "GENERATION_FAILED",
        "json"
      );
    }).toThrow("process.exit");

    const parsed = parseError(writtenData.trim());
    expect(parsed).not.toHaveProperty("instance");
  });
});

describe("handleError for a locked fal account", () => {
  let writtenData: string;
  let exitCode: number | undefined;

  beforeEach(() => {
    writtenData = "";
    exitCode = undefined;
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writtenData += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    });
    vi.spyOn(process, "exit").mockImplementation((code): never => {
      exitCode = typeof code === "number" ? code : undefined;
      throw new Error("process.exit");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports ACCOUNT_LOCKED over the command's own code, not retriable, exit 3", () => {
    for (const fallback of [
      "GENERATION_FAILED",
      "TOOL_FAILED",
      "UPSCALE_FAILED",
      "RMBG_FAILED",
      "SEGMENT_FAILED",
    ]) {
      writtenData = "";
      expect(() => {
        handleError(
          new MotifError(
            'fal account is locked because it is out of credit (fal said: {"detail":"User is locked. Reason: TOP_UP."})',
            403,
            "ACCOUNT_LOCKED"
          ),
          fallback,
          "json"
        );
      }).toThrow("process.exit");

      const parsed = parseError(writtenData.trim());
      expect(parsed).toMatchObject({
        code: "ACCOUNT_LOCKED",
        is_retriable: false,
        status: 403,
      });
      expect(String(parsed.message)).toContain("out of credit");
      expect(JSON.stringify(parsed.suggestions)).toContain(
        "https://fal.ai/dashboard/billing"
      );
      expect(exitCode).toBe(3);
    }
  });
});
