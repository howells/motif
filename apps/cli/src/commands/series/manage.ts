/** Series commands that read or edit a Series: create, list, show, refs, delete, history. */

import { resolve } from "node:path";

import {
  ASPECT_RATIOS,
  formatCost,
  getLook,
  RESOLUTIONS,
  validateCreativeDirection,
} from "@howells/motif-sdk";
import chalk from "chalk";

import { resolveCreativeDirection } from "../../utils/creative";
import { handleError, validateOption } from "../../utils/errors";
import { parseIntegerOption, validateEnumOption } from "../../utils/input";
import { emit, emitStream, isStructured } from "../../utils/output";
import type { EmitOptions } from "../../utils/output";
import {
  addRef,
  createSeries,
  deleteSeries,
  listSeries,
  loadSeries,
  removeRef,
} from "../../utils/series";
import type { SeriesConfig } from "../../utils/series";
import { hasText } from "../../utils/text";

function seriesAsJson(config: SeriesConfig): Record<string, unknown> {
  return {
    created: config.created,
    defaultAspect: config.defaultAspect,
    defaultResolution: config.defaultResolution,
    id: config.id,
    look: config.look ?? null,
    mood: config.mood ?? null,
    name: config.name,
    outputCount: config.outputs.length,
    refCount: config.refs.length,
    refs: config.refs,
    slug: config.slug,
    stylePrompt: config.stylePrompt,
    updated: config.updated,
  };
}

export async function cmdCreate(
  name: string,
  opts: {
    from?: string;
    look?: string;
    mood?: string;
    style?: string;
    aspect?: string;
    resolution?: string;
  },
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const requested = resolveCreativeDirection(opts);
    const pinned = requested
      ? validateOption(
          emitOpts.format,
          () => validateCreativeDirection(requested).selected
        )
      : undefined;
    const look = hasText(pinned?.look) ? getLook(pinned.look) : undefined;

    const defaultAspect = hasText(opts.aspect)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.aspect ?? "", ASPECT_RATIOS, "aspect")
        )
      : undefined;
    const defaultResolution = hasText(opts.resolution)
      ? validateOption(emitOpts.format, () =>
          validateEnumOption(opts.resolution ?? "", RESOLUTIONS, "resolution")
        )
      : undefined;

    // A pinned look fills in the aspect the caller left unset.
    const config = await createSeries({
      defaultAspect: defaultAspect ?? look?.aspect,
      defaultResolution,
      fromImage: hasText(opts.from) ? resolve(opts.from) : undefined,
      look: pinned?.look,
      mood: pinned?.mood,
      name,
      stylePrompt: opts.style,
    });

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-create", ...seriesAsJson(config) }, emitOpts);
    } else {
      console.log(chalk.green(`✓ Created series: ${config.name}`));
      console.log(`  Slug:  ${chalk.cyan(config.slug)}`);
      if (hasText(config.look) || hasText(config.mood)) {
        console.log(
          `  Look:  ${chalk.dim(config.look ?? "none")} | Mood: ${chalk.dim(config.mood ?? "none")}`
        );
      }
      if (config.stylePrompt) {
        console.log(
          `  Style: ${chalk.dim(config.stylePrompt.slice(0, 80))}...`
        );
      }
      if (config.refs.length > 0) {
        console.log(
          `  Refs:  ${config.refs.map((r) => `${r.tag}:${r.filename}`).join(", ")}`
        );
      }
    }
  } catch (error) {
    handleError(error, "SERIES_CREATE_FAILED", emitOpts.format);
  }
}

export async function cmdList(emitOpts: EmitOptions): Promise<void> {
  const series = await listSeries();

  if (emitOpts.format === "ndjson") {
    emitStream(series.map(seriesAsJson), emitOpts);
    return;
  }

  if (isStructured(emitOpts.format)) {
    emit(
      {
        command: "series-list",
        series: series.map(seriesAsJson),
        total: series.length,
      },
      emitOpts
    );
    return;
  }

  if (series.length === 0) {
    console.log(
      chalk.yellow(
        'No series found. Create one with: motif series create "My Series"'
      )
    );
    return;
  }

  console.log(chalk.bold(`\nSeries (${series.length}):\n`));
  for (const s of series) {
    console.log(`  ${chalk.cyan(s.slug)} — ${s.name}`);
    console.log(
      `    ${chalk.dim(`${s.refs.length} refs | ${s.outputs.length} outputs | ${new Date(s.updated).toLocaleDateString()}`)}`
    );
  }
}

export async function cmdShow(
  slug: string,
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const config = await loadSeries(slug);

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-show",
          ...seriesAsJson(config),
          outputs: config.outputs,
        },
        emitOpts
      );
      return;
    }

    console.log(chalk.bold(`\n${config.name}`));
    console.log(`  ID:     ${chalk.dim(config.id)}`);
    console.log(`  Slug:   ${chalk.cyan(config.slug)}`);
    console.log(
      `  Aspect: ${config.defaultAspect} | Resolution: ${config.defaultResolution}`
    );
    if (hasText(config.look) || hasText(config.mood)) {
      console.log(
        `  Look:   ${config.look ?? "none"} | Mood: ${config.mood ?? "none"}`
      );
    }
    if (config.stylePrompt) {
      console.log(`  Style:  ${chalk.dim(config.stylePrompt)}`);
    }

    if (config.refs.length > 0) {
      console.log(chalk.bold("\n  References:"));
      for (const ref of config.refs) {
        console.log(`    ${chalk.yellow(ref.tag)} → ${ref.filename}`);
        if (ref.description) {
          console.log(`      ${chalk.dim(ref.description)}`);
        }
      }
    }

    if (config.outputs.length > 0) {
      console.log(chalk.bold(`\n  Outputs (${config.outputs.length}):`));
      for (const out of config.outputs.slice(-5)) {
        console.log(
          `    ${chalk.dim(out.filename)} — ${out.prompt.slice(0, 50)}... (${formatCost(out.cost)})`
        );
      }
      if (config.outputs.length > 5) {
        console.log(chalk.dim(`    ... and ${config.outputs.length - 5} more`));
      }
    }
  } catch (error) {
    handleError(error, "SERIES_NOT_FOUND", emitOpts.format);
  }
}

export async function cmdRefAdd(
  slug: string,
  imagePath: string,
  opts: { tag: string; description?: string },
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const ref = await addRef(
      slug,
      resolve(imagePath),
      opts.tag,
      opts.description ?? ""
    );

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-ref-add", ref, series: slug }, emitOpts);
    } else {
      console.log(
        chalk.green(
          `✓ Added reference: ${chalk.yellow(ref.tag)} → ${ref.filename}`
        )
      );
    }
  } catch (error) {
    handleError(error, "SERIES_REF_ADD_FAILED", emitOpts.format);
  }
}

export async function cmdRefRemove(
  slug: string,
  filename: string,
  emitOpts: EmitOptions
): Promise<void> {
  try {
    await removeRef(slug, filename);

    if (isStructured(emitOpts.format)) {
      emit(
        { command: "series-ref-remove", removed: filename, series: slug },
        emitOpts
      );
    } else {
      console.log(chalk.green(`✓ Removed reference: ${filename}`));
    }
  } catch (error) {
    handleError(error, "SERIES_REF_REMOVE_FAILED", emitOpts.format);
  }
}

export async function cmdDelete(
  slug: string,
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const config = await loadSeries(slug);
    await deleteSeries(slug);

    if (isStructured(emitOpts.format)) {
      emit({ command: "series-delete", name: config.name, slug }, emitOpts);
    } else {
      console.log(chalk.green(`✓ Deleted series: ${config.name}`));
    }
  } catch (error) {
    handleError(error, "SERIES_DELETE_FAILED", emitOpts.format);
  }
}

export async function cmdHistory(
  slug: string,
  opts: { limit?: string; offset?: string },
  emitOpts: EmitOptions
): Promise<void> {
  try {
    const config = await loadSeries(slug);
    const all = [...config.outputs].reverse();
    const limit = validateOption(emitOpts.format, () =>
      parseIntegerOption(opts.limit ?? "10", "limit", { min: 1 })
    );
    const offset = validateOption(emitOpts.format, () =>
      parseIntegerOption(opts.offset ?? "0", "offset", { min: 0 })
    );
    const page = all.slice(offset, offset + limit);

    if (emitOpts.format === "ndjson") {
      // Spread into fresh literals: preserves key order, satisfies Record.
      emitStream(
        page.map((out) => ({ ...out })),
        emitOpts
      );
      return;
    }

    if (isStructured(emitOpts.format)) {
      emit(
        {
          command: "series-history",
          hasMore: offset + limit < all.length,
          limit,
          offset,
          outputs: page,
          series: slug,
          total: all.length,
        },
        emitOpts
      );
      return;
    }

    if (page.length === 0) {
      console.log(chalk.yellow("No outputs yet in this series."));
      return;
    }

    console.log(
      chalk.bold(
        `\n${config.name} — Outputs (${offset + 1}-${offset + page.length} of ${all.length}):\n`
      )
    );
    for (const out of page) {
      console.log(`  ${chalk.dim(out.filename)}`);
      console.log(
        `    ${chalk.cyan(out.prompt.slice(0, 70))}${out.prompt.length > 70 ? "..." : ""}`
      );
      console.log(
        `    ${chalk.dim(`${formatCost(out.cost)} | refs: ${out.refsUsed.join(",")}`)}`
      );
    }
  } catch (error) {
    handleError(error, "SERIES_NOT_FOUND", emitOpts.format);
  }
}
