/**
 * `motif ask` — the one verb whose output is prose rather than a file.
 *
 * Four Moondream endpoints sit behind it: a free-form question by default,
 * a caption with `--caption`, bounding boxes with `--detect`, and point
 * coordinates with `--point`. All four return data, none return a file, so
 * `artifacts` is empty and the kernel then writes nothing and records no
 * history — which is the whole point of that case.
 *
 * Positional shape follows the mode. `motif ask "question" [image]` reads the
 * first positional as the question; the three flag modes carry their own
 * subject, so `motif ask --caption [image]` reads the first positional as the
 * image. No sniffing of whether a string looks like a path.
 */

import { FAL_TOOLS } from "@howells/motif-sdk";
import type { ToolResponse } from "@howells/motif-sdk";

import type { MotifConfig } from "../../utils/config";
import { handleError } from "../../utils/errors";
import type { EmitOptions, OutputFormat } from "../../utils/output";
import { hasText } from "../../utils/text";
import { runImageOperation } from "../operation";
import { callPrice, runRegistryTool, verbInput } from "./shared";
import type { VerbOptions } from "./shared";

type AskMode = "caption" | "detect" | "point" | "query";

const ASK_TOOLS = {
  caption: "moondream-caption",
  detect: "moondream-detect",
  point: "moondream-point",
  query: "moondream-query",
} as const;

/** The mode the caller selected, defaulting to a free-form question. */
function askMode(options: VerbOptions, format: OutputFormat): AskMode {
  const chosen: AskMode[] = [
    ...(options.caption === true ? (["caption"] as const) : []),
    ...(hasText(options.detect) ? (["detect"] as const) : []),
    ...(hasText(options.point) ? (["point"] as const) : []),
  ];
  if (chosen.length > 1) {
    handleError(
      new Error(
        `motif ask takes one mode at a time; got ${chosen
          .map((mode) => `--${mode}`)
          .join(" ")}`
      ),
      "INVALID_OPTION",
      format
    );
  }
  return chosen[0] ?? "query";
}

/** Which positional is the question and which is the image, per mode. */
function askTarget(
  mode: AskMode,
  question: string | undefined,
  image: string | undefined,
  options: VerbOptions,
  format: OutputFormat
): { image?: string; prompt?: string } {
  if (mode === "query") {
    if (!hasText(question)) {
      handleError(
        new Error(
          'motif ask needs a question: motif ask "what is in this image?" [image]'
        ),
        "INVALID_OPTION",
        format
      );
    }
    return { image, prompt: question };
  }
  if (hasText(image)) {
    handleError(
      new Error(
        `motif ask --${mode} takes only an image path; its subject comes from the flag`
      ),
      "INVALID_OPTION",
      format
    );
  }
  return {
    image: question,
    prompt: mode === "detect" ? options.detect : options.point,
  };
}

/** Non-file fields worth emitting, by mode. */
function askData(mode: AskMode, result: ToolResponse): Record<string, unknown> {
  return {
    ...(typeof result.output === "string" ? { answer: result.output } : {}),
    ...(typeof result.reasoning === "string"
      ? { reasoning: result.reasoning }
      : {}),
    ...(mode === "detect" ? { objects: result.objects } : {}),
    ...(mode === "point" ? { points: result.points } : {}),
  };
}

/**
 * The human-format body: the answer alone, so it can be read or piped.
 *
 * `--detect` and `--point` return coordinates rather than prose, and printing
 * nothing would make those modes look like they failed, so they fall back to
 * their located data.
 */
function renderAnswer(mode: AskMode, result: ToolResponse): string | undefined {
  const answer = result.output;
  if (typeof answer === "string" && answer.trim() !== "") {
    return answer.trim();
  }
  const located = mode === "detect" ? result.objects : result.points;
  return located === undefined ? undefined : JSON.stringify(located, null, 2);
}

export async function ask(
  question: string | undefined,
  image: string | undefined,
  options: VerbOptions,
  config: MotifConfig,
  emitOpts: EmitOptions
): Promise<void> {
  const mode = askMode(options, emitOpts.format);
  const target = askTarget(mode, question, image, options, emitOpts.format);
  const toolId = ASK_TOOLS[mode];
  const tool = FAL_TOOLS[toolId];

  await runImageOperation<ToolResponse>(
    {
      artifacts: () => [],
      command: "ask",
      data: (result) => askData(mode, result),
      detail: {
        mode,
        tool: toolId,
        ...(hasText(target.prompt) ? { prompt: target.prompt } : {}),
      },
      errorCode: "ASK_FAILED",
      estimatedCost: callPrice(tool.price),
      model: toolId,
      outputSuffix: "-answer",
      // The answer is the output, so it is prose on stdout in human format and
      // an `answer` field under --format json — never both, never wrapped in
      // spinner furniture.
      quiet: true,
      writesFiles: false,
      render: (result) => renderAnswer(mode, result),
      run: async (sourceDataUrl, report) =>
        await runRegistryTool(
          toolId,
          tool,
          sourceDataUrl,
          report,
          hasText(target.prompt) ? { prompt: target.prompt } : undefined
        ),
      verb: "Asking",
    },
    verbInput(target.image, options, config),
    emitOpts
  );
}
