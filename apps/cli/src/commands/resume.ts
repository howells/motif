/**
 * `motif resume [requestId]`: collect a run fal already accepted into its
 * queue, and finish it as the original command would have: the same files,
 * names, history entry and JSON. Nothing is submitted, so nothing is billed
 * twice. It is a command, not a Task: it chooses no Model.
 *
 * What the original run kept lives in `~/.motif/pending` (see
 * `utils/pending-runs.ts`). With no request id the command lists those runs.
 */

import type { MotifClient } from "@howells/motif-sdk";
import chalk from "chalk";
import type { Command } from "commander";
import ora from "ora";
import type { Ora } from "ora";

import { loadConfig } from "../utils/config";
import { exitForErrorCode, handleError, validateOutput } from "../utils/errors";
import { motifClient } from "../utils/motif-client";
import { emit, emitError, isStructured, resolveFormat } from "../utils/output";
import type { EmitOptions } from "../utils/output";
import { prepareOutput } from "../utils/output-files";
import {
  isRequestId,
  listPendingRuns,
  loadPendingRun,
} from "../utils/pending-runs";
import type { PendingRun } from "../utils/pending-runs";
import { exitTaskError, identityFields } from "../utils/task-model";
import { hasText } from "../utils/text";
import { finishGeneration } from "./generate";
import type { GenerationContext } from "./generate";
import { finishTaskRun } from "./task-run";
import type { TaskRunContext } from "./task-run";
import { TASK_VERBS } from "./verbs/task-verbs";

interface ResumeOptions {
  dryRun?: boolean;
  fields?: string;
  format?: string;
  open?: boolean;
  output?: string;
}

function field(value: unknown, key: string, type: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, key) === type
  );
}

function isGenerationContext(run: object): run is GenerationContext {
  return (
    [
      "command",
      "task",
      "aspect",
      "resolution",
      "outputPath",
      "basePrompt",
    ].every((key) => field(run, key, "string")) &&
    ["explicitOutput", "ephemeral", "open", "transparent"].every((key) =>
      field(run, key, "boolean")
    ) &&
    field(run, "numImages", "number") &&
    Array.isArray(Reflect.get(run, "warnings"))
  );
}

function isTaskContext(run: object): run is TaskRunContext {
  const spec: unknown = Reflect.get(run, "spec");
  const target: unknown = Reflect.get(run, "target");
  return (
    typeof spec === "object" &&
    spec !== null &&
    ["command", "task", "verb"].every((key) => field(spec, key, "string")) &&
    field(spec, "writesFiles", "boolean") &&
    field(target, "path", "string") &&
    field(target, "directoryMode", "boolean")
  );
}

/** Where a pending run's files were going. */
function plannedOutput(pending: PendingRun): string | null {
  const { run } = pending;
  if (pending.pipeline === "generation" && isGenerationContext(run)) {
    return run.outputPath;
  }
  if (isTaskContext(run)) {
    return run.spec.writesFiles ? run.target.path : null;
  }
  return null;
}

function listRow(pending: PendingRun) {
  return {
    command: pending.command,
    model: pending.plan.model,
    output: plannedOutput(pending),
    requestId: pending.requestId,
    submittedAt: pending.submittedAt,
    task: pending.plan.task,
  };
}

async function listPending(emitOpts: EmitOptions): Promise<void> {
  const rows = (await listPendingRuns()).map(listRow);
  if (isStructured(emitOpts.format)) {
    emit({ command: "resume", pending: rows, total: rows.length }, emitOpts);
    return;
  }
  if (rows.length === 0) {
    console.log(chalk.yellow("No pending runs"));
    return;
  }
  console.log(chalk.bold("\nPending runs:"));
  for (const row of rows) {
    console.log(
      `  ${row.requestId}  ${row.command}  ${chalk.dim(row.submittedAt)}  ${chalk.dim(row.output ?? "no file")}`
    );
  }
  console.log(chalk.dim("\nCollect one with: motif resume <requestId>"));
}

function exitNotPending(requestId: string, emitOpts: EmitOptions): never {
  emitError(
    {
      code: "PENDING_RUN_NOT_FOUND",
      details: { requestId },
      message: `Motif has no pending run ${requestId}: it was not submitted by this Motif, or it has already been collected`,
    },
    emitOpts.format
  );
  exitForErrorCode("PENDING_RUN_NOT_FOUND");
}

/** Replace where the files go with the `-o` the caller gave. */
function withOutput(
  pending: PendingRun,
  output: string,
  format: EmitOptions["format"]
): PendingRun {
  const path = validateOutput(format, output);
  const run: object = pending.run;
  if (pending.pipeline === "generation") {
    return {
      ...pending,
      run: { ...run, explicitOutput: true, outputPath: path },
    };
  }
  return {
    ...pending,
    run: {
      ...run,
      target: { directoryMode: output.endsWith("/"), path },
    },
  };
}

/** Make sure the output can be written before waiting on fal. */
async function prepare(pending: PendingRun, format: EmitOptions["format"]) {
  const { run } = pending;
  if (isGenerationContext(run)) {
    await prepareOutput(validateOutput(format, run.outputPath), "file", format);
  } else if (isTaskContext(run) && run.spec.writesFiles) {
    const path = validateOutput(format, run.target.path);
    await prepareOutput(
      path,
      run.target.directoryMode ? "directory" : "file",
      format
    );
  }
}

async function collect(
  pending: PendingRun,
  client: MotifClient,
  open: boolean | undefined,
  emitOpts: EmitOptions
): Promise<void> {
  const { plan, run } = pending;
  const spinner: Ora | null = isStructured(emitOpts.format)
    ? null
    : ora(`Collecting ${pending.command}...`).start();
  const resumed = await client.resumePlan(
    plan,
    pending.requestId,
    (status, queuePosition) => {
      if (spinner) {
        spinner.text =
          queuePosition === undefined
            ? `Collecting ${pending.command}... ${status}`
            : `Collecting ${pending.command}... ${status}, queue position ${queuePosition}`;
      }
    }
  );
  if (resumed.isErr()) {
    spinner?.fail("Could not collect the run");
    exitTaskError(resumed.error, emitOpts.format, {
      model: plan.model,
      pending: { requestId: pending.requestId },
      task: plan.task,
    });
  }

  if (pending.pipeline === "generation" && isGenerationContext(run)) {
    spinner?.succeed("Collected!");
    await finishGeneration(
      { ...run, open: open === true || run.open },
      resumed.value,
      client,
      emitOpts
    );
    return;
  }
  if (isTaskContext(run)) {
    const definition = TASK_VERBS.find(
      (verb) => verb.command === run.spec.command
    );
    await finishTaskRun(
      {
        ...run,
        open: open === true || run.open,
        spec: {
          ...run.spec,
          data: definition?.data,
          render: definition?.render,
        },
      },
      spinner,
      resumed.value,
      emitOpts
    );
    return;
  }
  handleError(
    new Error(
      `The pending record for ${pending.requestId} does not hold what ${pending.command} needs to finish`
    ),
    "CORRUPT_FILE",
    emitOpts.format
  );
}

async function resume(
  requestId: string | undefined,
  options: ResumeOptions
): Promise<void> {
  const emitOpts: EmitOptions = {
    fields: options.fields,
    format: resolveFormat(options.format),
    sanitize: true,
  };
  if (requestId === undefined) {
    if (hasText(options.output) || options.dryRun === true) {
      handleError(
        new Error(
          "--output and --dry-run need a request id: motif resume <requestId>"
        ),
        "INVALID_OPTION",
        emitOpts.format
      );
    }
    await listPending(emitOpts);
    return;
  }
  if (!isRequestId(requestId)) {
    handleError(
      new Error(`Not a request id: ${JSON.stringify(requestId)}`),
      "INVALID_OPTION",
      emitOpts.format
    );
  }
  const stored = await loadPendingRun(requestId);
  if (stored === undefined) {
    exitNotPending(requestId, emitOpts);
  }
  const pending = hasText(options.output)
    ? withOutput(stored, options.output, emitOpts.format)
    : stored;

  if (options.dryRun === true) {
    emit(
      {
        command: "resume",
        dryRun: true,
        requestId,
        resumes: pending.command,
        ...identityFields(pending.plan),
        output: plannedOutput(pending),
        submittedAt: pending.submittedAt,
        valid: true,
      },
      emitOpts
    );
    if (!isStructured(emitOpts.format)) {
      console.log(chalk.bold("\nDry run: fal not contacted\n"));
      console.log(`  Resumes: ${pending.command} (${requestId})`);
      console.log(
        `  Output:  ${chalk.dim(plannedOutput(pending) ?? "none, data only")}`
      );
      console.log(
        `  Cost:    ${chalk.yellow("none")} (billed when it was submitted)`
      );
    }
    return;
  }

  await prepare(pending, emitOpts.format);
  await collect(
    pending,
    motifClient(await loadConfig()),
    options.open,
    emitOpts
  );
}

export function registerResume(program: Command): void {
  program
    .command("resume")
    .description("Collect a run fal already accepted, and finish it")
    .argument(
      "[requestId]",
      "The request id from the failed run's error; omit to list the runs that can be collected"
    )
    .option(
      "-o, --output <file-or-dir>",
      "Save here instead of where the run was going to"
    )
    .option("--dry-run", "Say what would be collected, without contacting fal")
    .option(
      "--format <format>",
      "Output format: json, human, ndjson (default: auto-detect from TTY)"
    )
    .option("--fields <fields>", "Comma-separated fields to include in output")
    .option("--open", "Open the result in a viewer")
    .action(async (requestId: string | undefined, options: ResumeOptions) => {
      await resume(requestId, options);
    });
}
