import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runTool, runToolQueued } from "../src/api/fal";
import { ask } from "../src/commands/verbs/ask";
import { enhance } from "../src/commands/verbs/enhance";
import { layers, segment } from "../src/commands/verbs/image-verbs";
import type { MotifConfig } from "../src/utils/config";
import { reservedPromptSuggestion } from "../src/utils/input";
import { spawnEnv } from "./cli-env";

// In-process verbs run against the real HOME, and a verb that writes a file
// records a generation. Stubbing the writer keeps the developer's own history
// out of the test run; what it records is the kernel's business, not these
// tests'.
vi.mock(import("../src/utils/config"), async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/utils/config")>()),
  addGeneration: vi.fn<() => Promise<void>>(async () => {
    // no-op
  }),
}));

vi.mock(import("../src/api/fal"), () => ({
  runTool: vi.fn<(options: unknown) => Promise<Record<string, unknown>>>(),
  runToolQueued:
    vi.fn<(options: unknown) => Promise<Record<string, unknown>>>(),
}));

const TEST_CONFIG: MotifConfig = {
  backgroundRemover: "rmbg",
  defaultAspect: "1:1",
  defaultModel: "banana",
  defaultResolution: "2K",
  openAfterGenerate: false,
  upscaler: "clarity",
};

/**
 * The seven promoted verbs, exercised the way an agent meets them: a dry-run
 * payload per verb, the one verb that writes no file, the mode collision that
 * must be an error rather than a precedence rule, and the reserved command
 * words that keep a mistyped verb from spending credits.
 */

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

interface CliResult {
  code: number;
  stderr: string;
  stdout: string;
}

const tempHomes: string[] = [];
const fixtureDirs: string[] = [];

function tempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "motif-verbs-home-"));
  tempHomes.push(dir);
  return dir;
}

/**
 * Fixture images live under the package directory, not the OS temp dir:
 * output paths must stay inside the git root, and the kernel derives its default
 * output alongside the source image.
 */
function fixtureImage(name = "source.png"): string {
  const dir = mkdtempSync(join(process.cwd(), "verbs-fixture-"));
  fixtureDirs.push(dir);
  const path = join(dir, name);
  writeFileSync(path, Buffer.from(PNG_1X1, "base64"));
  return path;
}

/** Serve every download as a 1x1 PNG: tests make no live fal calls. */
function stubPngFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      arrayBuffer: async () => Buffer.from(PNG_1X1, "base64").buffer,
      headers: new Headers({ "content-type": "image/png" }),
      ok: true,
      statusText: "OK",
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  for (const dir of [...tempHomes, ...fixtureDirs]) {
    rmSync(dir, { force: true, recursive: true });
  }
  tempHomes.length = 0;
  fixtureDirs.length = 0;
});

async function runMotif(args: string[]): Promise<CliResult> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/index.ts", ...args],
    {
      cwd: process.cwd(),
      env: spawnEnv({
        CI: "1",
        FAL_KEY: "",
        HOME: tempHome(),
      }),
      stdio: ["pipe", "pipe", "pipe"],
    }
  );

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf-8");
  child.stderr.setEncoding("utf-8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  child.stdin.end("");

  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 0, stderr, stdout });
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function dryRun(args: string[]): Promise<Record<string, unknown>> {
  const result = await runMotif([...args, "--dry-run", "--format", "json"]);
  expect(result.code, result.stderr).toBe(0);
  const payload: unknown = JSON.parse(result.stdout.trim());
  if (!isRecord(payload)) {
    throw new Error("expected a dry-run payload object");
  }
  return payload;
}

async function failedRun(args: string[]): Promise<Record<string, unknown>> {
  const result = await runMotif(args);
  const payload: unknown = JSON.parse(result.stderr.trim());
  if (!isRecord(payload)) {
    throw new Error("expected a structured error on stderr");
  }
  return { ...payload, exitCode: result.code };
}

describe("promoted verbs — dry-run payloads", () => {
  it("prices segment against sam3-image", async () => {
    const image = fixtureImage();
    const payload = await dryRun(["segment", "the chair", image]);

    expect(payload.command).toBe("segment");
    expect(payload.model).toBe("sam3-image");
    expect(payload.prompt).toBe("the chair");
    expect(payload.estimatedCost).toBe(0.005);
    expect(payload.source).toBe(image);
    expect(payload.valid).toBeTruthy();
  });

  it("switches segment to the RLE endpoint with --rle", async () => {
    const payload = await dryRun([
      "segment",
      "the chair",
      fixtureImage(),
      "--rle",
    ]);

    expect(payload.model).toBe("sam3-image-rle");
  });

  it("reports ask as metered rather than free", async () => {
    const payload = await dryRun(["ask", "what is this?", fixtureImage()]);

    expect(payload.command).toBe("ask");
    expect(payload.model).toBe("moondream-query");
    expect(payload.estimatedCost).toBeNull();
  });

  it("routes each ask mode to its own Moondream endpoint", async () => {
    const image = fixtureImage();

    expect((await dryRun(["ask", image, "--caption"])).model).toBe(
      "moondream-caption"
    );
    expect((await dryRun(["ask", image, "--detect", "chair"])).model).toBe(
      "moondream-detect"
    );
    expect((await dryRun(["ask", image, "--point", "chair"])).model).toBe(
      "moondream-point"
    );
  });

  it("prices erase against object-removal", async () => {
    const payload = await dryRun(["erase", "the car", fixtureImage()]);

    expect(payload.command).toBe("erase");
    expect(payload.model).toBe("object-removal");
    expect(payload.estimatedCost).toBe(0.024);
  });

  it("maps a reframe preset to the shared format table", async () => {
    const payload = await dryRun(["reframe", fixtureImage(), "--og"]);

    expect(payload.command).toBe("reframe");
    expect(payload.model).toBe("ideogram-reframe");
    expect(payload.aspect).toBe("16:9");
    expect(payload.imageSize).toStrictEqual({ height: 864, width: 1536 });
    expect(payload.preset).toBe("og");
  });

  /**
   * The ratio is reframe's entire deliverable, so requesting one ratio while
   * reporting another is the defect this guards. Routing the aspect through
   * `aspectToFalImageSize` used to bucket 2:3 into portrait_4_3 and 21:9 into
   * landscape_16_9, and nothing in the payload said so.
   */
  it("requests exactly the ratio it reports, for every preset", async () => {
    const image = fixtureImage();
    const presets = [
      "cover",
      "landscape",
      "og",
      "portrait",
      "square",
      "story",
      "wide",
    ];
    // Each preset is an independent dry run, so spawn them together rather than
    // paying seven process startups end to end.
    const payloads = await Promise.all(
      presets.map(
        async (preset) => await dryRun(["reframe", image, `--${preset}`])
      )
    );

    for (const [index, payload] of payloads.entries()) {
      const preset = presets[index];
      const size = payload.imageSize;
      if (!isRecord(size)) {
        throw new Error(`${preset}: expected an explicit image size`);
      }
      const [wide, tall] = String(payload.aspect).split(":").map(Number);
      expect(
        Number(size.width) * Number(tall),
        `${preset} asks for ${String(size.width)}x${String(size.height)}, not ${String(payload.aspect)}`
      ).toBe(Number(size.height) * Number(wide));
      expect(Number(size.width) % 8, `${preset} width alignment`).toBe(0);
      expect(Number(size.height) % 8, `${preset} height alignment`).toBe(0);
    }
  });

  it("defaults enhance to the precision upscaler", async () => {
    const payload = await dryRun(["enhance", fixtureImage()]);

    expect(payload.command).toBe("enhance");
    expect(payload.mode).toBe("upscale");
    expect(payload.model).toBe("topaz-precision");
  });

  it("selects the Topaz endpoint named by the enhance mode", async () => {
    const image = fixtureImage();

    expect((await dryRun(["enhance", image, "--denoise"])).model).toBe(
      "topaz-denoise"
    );
    expect((await dryRun(["enhance", image, "--restore"])).model).toBe(
      "topaz-restore"
    );
  });

  it("prices layers against qwen-layered when given a directory", async () => {
    const payload = await dryRun([
      "layers",
      fixtureImage(),
      "-o",
      "layers-out/",
    ]);

    expect(payload.command).toBe("layers");
    expect(payload.model).toBe("qwen-layered");
    // Directory targets are resolved and checked against the git root before being shown.
    expect(payload.output).toBe(join(process.cwd(), "layers-out"));
  });

  it("refuses a directory target outside the git root", async () => {
    const payload = await failedRun([
      "layers",
      fixtureImage(),
      "-o",
      "/tmp/motif-escaped/",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(payload.code).toBe("INVALID_OUTPUT_PATH");
    expect(payload.exitCode).toBe(2);
  });

  it("prices vectorize against recraft-vectorize", async () => {
    const payload = await dryRun([
      "vectorize",
      fixtureImage(),
      "-o",
      "logo.svg",
    ]);

    expect(payload.command).toBe("vectorize");
    expect(payload.model).toBe("recraft-vectorize");
  });
});

describe("promoted verbs — refusals", () => {
  it("refuses two enhance modes rather than picking one", async () => {
    const payload = await failedRun([
      "enhance",
      fixtureImage(),
      "--denoise",
      "--sharpen",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(payload.code).toBe("INVALID_OPTION");
    expect(payload.exitCode).toBe(2);
    expect(String(payload.message)).toContain("--denoise");
    expect(String(payload.message)).toContain("--sharpen");
  });

  it("refuses two reframe targets", async () => {
    const payload = await failedRun([
      "reframe",
      fixtureImage(),
      "--og",
      "--square",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(payload.code).toBe("INVALID_OPTION");
  });

  it("refuses a reframe with no target ratio", async () => {
    const payload = await failedRun([
      "reframe",
      fixtureImage(),
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(payload.code).toBe("INVALID_OPTION");
    expect(String(payload.message)).toContain("--og");
  });

  it("tells the caller layers needs a trailing slash", async () => {
    const payload = await failedRun([
      "layers",
      fixtureImage(),
      "-o",
      "layers.png",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(payload.code).toBe("INVALID_OPTION");
    expect(String(payload.message)).toContain("trailing slash");
  });

  it("tells the caller vectorize writes an SVG", async () => {
    const payload = await failedRun([
      "vectorize",
      fixtureImage(),
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(payload.code).toBe("INVALID_OPTION");
    expect(String(payload.message)).toContain(".svg");
  });

  it("refuses an ask with neither a question nor a mode", async () => {
    const payload = await failedRun(["ask", "--dry-run", "--format", "json"]);

    expect(payload.code).toBe("INVALID_OPTION");
  });
});

describe("promoted verbs — reserved command words", () => {
  it("maps every verb to its corrected invocation", () => {
    for (const verb of [
      "ask",
      "enhance",
      "erase",
      "layers",
      "reframe",
      "segment",
      "vectorize",
    ]) {
      expect(reservedPromptSuggestion(verb), verb).toContain(`motif ${verb}`);
    }
  });

  it("refuses a verb word that arrived as a generation prompt", async () => {
    const payload = await failedRun([
      "--dry-run",
      "--format",
      "json",
      "segment",
    ]);

    expect(payload.code).toBe("RESERVED_PROMPT");
    expect(payload.exitCode).toBe(2);
    expect(isRecord(payload.details) ? payload.details.didYouMean : "").toBe(
      'motif segment "what to segment" [image]'
    );
  });
});

describe("ask — the one verb that writes no file", () => {
  it("emits the answer, writes nothing, and records no history", async () => {
    const image = fixtureImage();
    vi.mocked(runTool).mockResolvedValue({
      output: "A red chair by a window.",
      reasoning: "The seat and back are red.",
    });

    const written: string[] = [];
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });
    try {
      await ask("what is in this image?", image, {}, TEST_CONFIG, {
        format: "json",
        sanitize: true,
      });
    } finally {
      stdout.mockRestore();
    }

    const payload: unknown = JSON.parse(written.join("").trim());
    if (!isRecord(payload)) {
      throw new Error("expected an emitted payload");
    }

    expect(payload.command).toBe("ask");
    expect(payload.model).toBe("moondream-query");
    expect(payload.answer).toBe("A red chair by a window.");
    expect(payload.reasoning).toBe("The seat and back are red.");
    expect(payload.cost).toBeNull();
    expect(payload.files).toStrictEqual([]);
    expect(payload.path).toBeUndefined();

    // Nothing landed next to the source image.
    expect(readdirSync(dirname(image))).toStrictEqual(["source.png"]);
  });

  it("prints the answer alone in human format, with no spinner furniture", async () => {
    const image = fixtureImage();
    vi.mocked(runTool).mockResolvedValue({ output: "A red chair." });

    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args) => {
      lines.push(args.map(String).join(" "));
    });
    try {
      await ask("what is this?", image, {}, TEST_CONFIG, {
        format: "human",
        sanitize: true,
      });
    } finally {
      log.mockRestore();
    }

    expect(lines).toStrictEqual(["A red chair."]);
  });
});

describe("enhance — queued Topaz endpoints", () => {
  it("hands the kernel's reporter to the queue so position reaches the spinner", async () => {
    const image = fixtureImage();
    // topaz-denoise declares its output under `image`; a mock that carries no
    // URL would never exercise the download the verb actually performs.
    vi.mocked(runToolQueued).mockResolvedValue({
      image: { url: "https://fal.media/denoised.png" },
    });
    stubPngFetch();

    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      await enhance(image, { denoise: true }, TEST_CONFIG, {
        format: "json",
        sanitize: true,
      });
    } finally {
      stdout.mockRestore();
    }

    const call = vi.mocked(runToolQueued).mock.calls[0];
    expect(call?.[0]).toMatchObject({ tool: "topaz-denoise" });
    expect(call?.[1]).toBeTypeOf("function");
  });
});

describe("registry-declared execution path", () => {
  /**
   * A `queued: true` entry called synchronously does not just fail slowly:
   * FalClient reads its own 120s timeout as a retriable network error, so the
   * paid endpoint is POSTed several times before the verb gives up. Every verb
   * therefore routes on the flag rather than choosing a path by hand.
   */
  it("sends a queued tool to the queue and a sync tool to the sync path", async () => {
    const image = fixtureImage();
    vi.mocked(runToolQueued).mockResolvedValue({
      images: [
        { url: "https://fal.media/layer-1.png" },
        { url: "https://fal.media/layer-2.png" },
      ],
    });
    vi.mocked(runTool).mockResolvedValue({});
    stubPngFetch();

    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      await layers(image, { output: "verbs-layers-out/" }, TEST_CONFIG, {
        format: "json",
        sanitize: true,
      });
    } finally {
      stdout.mockRestore();
      rmSync(join(process.cwd(), "verbs-layers-out"), {
        force: true,
        recursive: true,
      });
    }

    // qwen-layered is queued in the registry, so it must not touch runTool.
    expect(vi.mocked(runToolQueued)).toHaveBeenCalledOnce();
    expect(vi.mocked(runToolQueued).mock.calls[0]?.[0]).toMatchObject({
      tool: "qwen-layered",
    });
    expect(vi.mocked(runTool)).not.toHaveBeenCalled();
  });

  it("treats segment --rle as a legitimately fileless result", async () => {
    const image = fixtureImage();
    vi.mocked(runTool).mockResolvedValue({
      boxes: [[0, 0, 4, 4]],
      rle: [{ counts: "abc", size: [4, 4] }],
      scores: [0.9],
    });

    const written: string[] = [];
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        written.push(String(chunk));
        return true;
      });
    try {
      await segment("the chair", image, { rle: true }, TEST_CONFIG, {
        format: "json",
        sanitize: true,
      });
    } finally {
      stdout.mockRestore();
    }

    const payload: unknown = JSON.parse(written.join("").trim());
    if (!isRecord(payload)) {
      throw new Error("expected an emitted payload");
    }
    expect(payload.model).toBe("sam3-image-rle");
    expect(payload.files).toStrictEqual([]);
    expect(payload.rle).toBeDefined();
    expect(readdirSync(dirname(image))).toStrictEqual(["source.png"]);
  });
});
