#!/usr/bin/env node
import { parseArgs } from "node:util";

import { z } from "zod";

import { createMotif, MotifError } from "../dist/index.js";

const usage = `Build: pnpm --filter @howells/motif-sdk build
Dry run: node packages/motif-sdk/examples/stream.mjs --model gpt2
Paid test: node packages/motif-sdk/examples/stream.mjs --model gpt2 --run
Options: --model gpt2|gpt|flux2-dev, --reference URL (repeatable), --prompt TEXT,
         --timeout MILLISECONDS (positive integer; default 300000),
         --run (explicit paid submission; requires FAL_KEY), --help
References use the model's editing route. No retries or files are downloaded.`;

/** @param {unknown} error - A local or provider failure. */
function reportError(error) {
  const failure = error instanceof MotifError ? error : undefined;
  // Provider error bodies can include arbitrary input: log only safe metadata.
  console.error(
    JSON.stringify({
      type: "error",
      code: failure?.code ?? "STREAM_ERROR",
      status: failure?.status ?? 0,
      ...(failure?.requestId !== undefined && { requestId: failure.requestId }),
    })
  );
  process.exitCode = 1;
}

/** @param {string} url - Provider image reference to summarise safely. */
function imageReference(url) {
  if (url.startsWith("data:")) {
    return { kind: "inline", characters: url.length };
  }
  try {
    const parsed = new URL(url);
    return { kind: "url", origin: parsed.origin, pathname: parsed.pathname };
  } catch {
    return { kind: "unrecognised" };
  }
}

function readOptions() {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        model: { type: "string", default: "gpt2" },
        timeout: { type: "string", default: "300000" },
        reference: { type: "string", multiple: true, default: [] },
        prompt: {
          type: "string",
          default:
            "An elegant studio photograph of a sculptural oak chair on a pale background.",
        },
        run: { type: "boolean", default: false },
        help: { type: "boolean", default: false },
      },
    }));
  } catch {
    console.error(usage);
    process.exitCode = 1;
    return null;
  }
  if (values.help) {
    console.log(usage);
    return null;
  }
  if (!["gpt2", "gpt", "flux2-dev"].includes(values.model)) {
    console.error("Choose a streaming model: gpt2, gpt or flux2-dev.");
    process.exitCode = 1;
    return null;
  }
  const timeout = Number(values.timeout);
  if (
    !Number.isSafeInteger(timeout) ||
    timeout <= 0 ||
    timeout > 2_147_483_647
  ) {
    console.error(
      "--timeout must be a positive integer no greater than 2147483647 milliseconds."
    );
    process.exitCode = 1;
    return null;
  }
  return { values, timeout };
}

async function main() {
  const options = readOptions();
  if (options === null) {
    return;
  }
  const { values, timeout } = options;
  const input = {
    model: values.model,
    prompt: values.prompt,
    ...(values.reference.length && { references: values.reference }),
  };
  const dryPlan = createMotif({ falKey: "" }).plan("generate", input, {
    dryRun: true,
  });
  if (dryPlan.isErr()) {
    reportError(dryPlan.error);
    return;
  }
  const plan = dryPlan.value;
  console.log(
    JSON.stringify({
      type: "plan",
      model: plan.model,
      endpoint: `${plan.endpoint}/stream`,
      cost: plan.cost,
      referenceCount: values.reference.length,
      timeoutMs: timeout,
    })
  );
  if (!values.run) {
    console.log(
      "Dry run only. Add --run with FAL_KEY set to submit one paid streaming request."
    );
    return;
  }

  await runStream(input, timeout);
}

/**
 * @param {import("../dist/index.js").TaskInput} input - Validated generation request.
 * @param {number} timeout - Overall request deadline in milliseconds.
 */
async function runStream(input, timeout) {
  const controller = new AbortController();
  const onInterrupt = () => {
    controller.abort();
  };
  process.once("SIGINT", onInterrupt);
  const started = performance.now();
  let totalEvents = 0;
  let imageEvents = 0;
  let firstEventMs;
  let firstImageMs;
  try {
    const result = await createMotif().stream("generate", input, {
      signal: controller.signal,
      timeout,
    });
    if (result.isErr()) {
      reportError(result.error);
      return;
    }
    for await (const resultEvent of result.value.events) {
      if (resultEvent.isErr()) {
        reportError(resultEvent.error);
        break;
      }
      const event = resultEvent.value;
      const elapsedMs = Math.round(performance.now() - started);
      totalEvents++;
      firstEventMs ??= elapsedMs;
      const files = event.type === "images" ? event.files : [];
      const provider = event.type === "provider" ? event.data : event.raw;
      const payload = z.record(z.string(), z.unknown()).safeParse(provider);
      const providerKeys = payload.success ? Object.keys(payload.data) : [];
      if (files.length) {
        imageEvents++;
        firstImageMs ??= elapsedMs;
      }
      console.log(
        JSON.stringify({
          type: event.type,
          elapsedMs,
          keys: Object.keys(event).filter((key) => key !== "raw"),
          providerKeys,
          imageCount: files.length,
          ...(files.length && {
            images: files.map((file) => imageReference(file.url)),
          }),
        })
      );
    }
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    console.log(
      JSON.stringify({
        type: "summary",
        elapsedMs: Math.round(performance.now() - started),
        totalEvents,
        imageEvents,
        firstEventMs: firstEventMs ?? null,
        firstImageMs: firstImageMs ?? null,
        cancelled: controller.signal.aborted,
      })
    );
    if (controller.signal.aborted) {
      process.exitCode = 130;
    }
  }
}

await main().catch(reportError);
