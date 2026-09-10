/**
 * How the routing eval reaches a model. With ANTHROPIC_API_KEY set it calls
 * the Messages API; without one it runs a headless `claude -p` call, cut off
 * from the user's own Claude Code configuration so the model sees only the
 * system prompt it is given.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { isRecord } from "./prompt.ts";

interface ModelInfo {
  /** USD per million input tokens. */
  readonly input: number;
  /** USD per million output tokens. */
  readonly output: number;
  /** Whether the model still accepts `temperature`. */
  readonly sampling: boolean;
}

const MODELS = {
  "claude-sonnet-5": { input: 2, output: 10, sampling: false },
  "claude-opus-5": { input: 5, output: 25, sampling: false },
  "claude-fable-5-1": { input: 10, output: 50, sampling: false },
  "claude-sonnet-4-6": { input: 3, output: 15, sampling: true },
  "claude-haiku-4-5": { input: 1, output: 5, sampling: true },
} satisfies Record<string, ModelInfo>;

export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;
const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_ATTEMPTS = 4;
const CALL_TIMEOUT_MS = 300_000;

export interface Usage {
  readonly input: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
  readonly output: number;
}

export interface Answer {
  readonly text: string;
  readonly stopReason: string;
  readonly usage: Usage;
  /** USD, priced from usage for the API or as `claude -p` reports it. */
  readonly costUsd: number;
}

export interface Call {
  readonly model: string;
  readonly effort: string | undefined;
  readonly user: string;
}

export type Backend = (call: Call) => Promise<Answer>;

export function modelInfo(model: string): ModelInfo {
  const entry = Object.entries(MODELS).find(([id]) => id === model);
  if (entry === undefined) {
    throw new Error(
      `No price for ${model}. Known models: ${Object.keys(MODELS).join(", ")}`
    );
  }
  return entry[1];
}

export function usageCost(model: string, usage: Usage): number {
  const info = modelInfo(model);
  const input =
    usage.input +
    usage.cacheWrite * CACHE_WRITE_MULTIPLIER +
    usage.cacheRead * CACHE_READ_MULTIPLIER;
  return (input * info.input + usage.output * info.output) / 1_000_000;
}

function parseUsage(value: unknown): Usage | null {
  if (!isRecord(value)) {
    return null;
  }
  const {
    input_tokens: input,
    output_tokens: output,
    cache_creation_input_tokens: cacheWrite,
    cache_read_input_tokens: cacheRead,
  } = value;
  if (typeof input !== "number" || typeof output !== "number") {
    return null;
  }
  return {
    input,
    output,
    cacheWrite: typeof cacheWrite === "number" ? cacheWrite : 0,
    cacheRead: typeof cacheRead === "number" ? cacheRead : 0,
  };
}

function parseApiAnswer(model: string, value: unknown): Answer {
  const malformed = new Error(
    `Unexpected Messages API response: ${JSON.stringify(value).slice(0, 500)}`
  );
  if (!isRecord(value)) {
    throw malformed;
  }
  const { content, stop_reason: stopReason } = value;
  const usage = parseUsage(value.usage);
  if (
    !Array.isArray(content) ||
    typeof stopReason !== "string" ||
    usage === null
  ) {
    throw malformed;
  }
  return {
    text: content
      .filter(isRecord)
      .flatMap((block) =>
        block.type === "text" && typeof block.text === "string"
          ? [block.text]
          : []
      )
      .join("\n"),
    stopReason,
    usage,
    costUsd: usageCost(model, usage),
  };
}

interface MessagesRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: readonly {
    readonly type: "text";
    readonly text: string;
    readonly cache_control: { readonly type: "ephemeral" };
  }[];
  readonly messages: readonly {
    readonly role: "user";
    readonly content: string;
  }[];
  temperature?: number;
  output_config?: { readonly effort: string };
}

function requestBody(call: Call, system: string): MessagesRequest {
  const body: MessagesRequest = {
    model: call.model,
    max_tokens: 16_000,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: call.user }],
  };
  if (modelInfo(call.model).sampling) {
    body.temperature = 0;
  }
  if (call.effort !== undefined) {
    body.output_config = { effort: call.effort };
  }
  return body;
}

function apiBackend(apiKey: string, system: string): Backend {
  return async (call) => {
    const body = JSON.stringify(requestBody(call, system));
    for (let attempt = 1; ; attempt++) {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body,
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      if (response.ok) {
        const message: unknown = await response.json();
        return parseApiAnswer(call.model, message);
      }
      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable || attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Anthropic API ${response.status}: ${await response.text()}`
        );
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000);
    }
  };
}

/**
 * Flags that leave a `claude -p` call nothing but the given system prompt: no
 * tools, no CLAUDE.md or memory, no user, project or local settings, no hooks,
 * plugins, skills or MCP servers, and no saved session.
 */
function claudeArgs(call: Call, systemPromptFile: string): string[] {
  const args = [
    "--print",
    "--model",
    call.model,
    "--system-prompt-file",
    systemPromptFile,
    "--tools",
    "",
    "--safe-mode",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--output-format",
    "json",
  ];
  if (call.effort !== undefined) {
    args.push("--effort", call.effort);
  }
  return args;
}

/** Stdout of a process fed `input` on stdin, failing on a non-zero exit. */
async function runProcess(
  command: string,
  args: readonly string[],
  input: string,
  cwd: string
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: CALL_TIMEOUT_MS,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      const detail = stderr.trim() === "" ? stdout.trim() : stderr.trim();
      reject(new Error(`${command} exited with ${code ?? signal}: ${detail}`));
    });
    child.stdin.end(input);
  });
}

function parseClaudeResult(stdout: string): Answer {
  const malformed = new Error(
    `Unexpected claude -p output: ${stdout.slice(0, 500)}`
  );
  const value: unknown = JSON.parse(stdout);
  if (!isRecord(value)) {
    throw malformed;
  }
  const {
    result,
    is_error: isError,
    subtype,
    stop_reason: stopReason,
    total_cost_usd: costUsd,
  } = value;
  const usage = parseUsage(value.usage);
  if (
    typeof result !== "string" ||
    typeof subtype !== "string" ||
    typeof costUsd !== "number" ||
    usage === null
  ) {
    throw malformed;
  }
  if (isError !== false) {
    throw new Error(`claude -p failed (${subtype}): ${result}`);
  }
  return {
    text: result,
    stopReason: typeof stopReason === "string" ? stopReason : subtype,
    usage,
    costUsd,
  };
}

function claudeCliBackend(systemPromptFile: string, cwd: string): Backend {
  return async (call) => {
    const stdout = await runProcess(
      "claude",
      claudeArgs(call, systemPromptFile),
      call.user,
      cwd
    );
    return parseClaudeResult(stdout);
  };
}

/**
 * Hand `run` the backend for this environment: the Messages API when an API
 * key is given, otherwise `claude -p` run from an empty temporary directory
 * that holds the system prompt file and is removed afterwards.
 */
export async function withBackend<T>(
  apiKey: string | undefined,
  system: string,
  run: (backend: Backend) => Promise<T>
): Promise<T> {
  if (apiKey !== undefined) {
    return await run(apiBackend(apiKey, system));
  }
  const workDir = mkdtempSync(join(tmpdir(), "motif-routing-"));
  try {
    const systemPromptFile = join(workDir, "system-prompt.md");
    writeFileSync(systemPromptFile, system);
    return await run(claudeCliBackend(systemPromptFile, workDir));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
