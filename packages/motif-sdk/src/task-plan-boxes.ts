/**
 * `box_prompts` for the tool Models that take boxes: the caller's whole-pixel
 * boxes in the tool's own unit, each checked against the source's size when it
 * is known.
 */

import { err, ok } from "neverthrow";
import type { Result } from "neverthrow";

import type { MotifError } from "./errors";
import type { TaskInput } from "./task-client";
import { invalidOption, sourceSizeOf } from "./task-plan-shared";
import type { TaskId } from "./tasks";
import type { FalToolConfig } from "./tool-types";
import { FAL_TOOLS } from "./tools";
import type { FalToolId } from "./tools";
import type { CustomImageSize } from "./types";

type Box = NonNullable<TaskInput["boxes"]>[number];

function isWholePixelBox({ height, width, x, y }: Box): boolean {
  return (
    [x, y, width, height].every(Number.isInteger) &&
    x >= 0 &&
    y >= 0 &&
    width > 0 &&
    height > 0
  );
}

/** The size boxes are placed in, when the source's size is known. */
function boxBounds(input: TaskInput): CustomImageSize | undefined {
  if (input.video === undefined) {
    return sourceSizeOf(input);
  }
  const { height, width } = input.sourceVideo ?? {};
  return height === undefined || width === undefined
    ? undefined
    : { height, width };
}

/**
 * `box_prompts` in the tool's own unit. `boxes` are always whole pixels of the
 * source; a tool that takes fractions gets them divided by the source size.
 */
export function boxPrompts(
  task: TaskId,
  model: FalToolId,
  input: TaskInput,
  boxes: readonly Box[]
): Result<Record<string, number>[], MotifError> {
  if (!boxes.every(isWholePixelBox)) {
    return err(
      invalidOption("boxes are whole pixels of the source image.", {
        field: "boxes",
        model,
        task,
      })
    );
  }
  const corners = boxes.map(({ height, width, x, y }) => ({
    x_max: x + width,
    x_min: x,
    y_max: y + height,
    y_min: y,
  }));
  const { fractionBoxes }: FalToolConfig = FAL_TOOLS[model];
  if (fractionBoxes === true && boxes.length !== 1) {
    return err(
      invalidOption(`${model} takes exactly one box.`, {
        field: "boxes",
        model,
        task,
      })
    );
  }
  const size = boxBounds(input);
  if (size === undefined && fractionBoxes === true) {
    return err(
      invalidOption(
        `${model} needs the source image's size to place a box: pass a data URL or sourceSize.`,
        { field: "sourceSize", model, task }
      )
    );
  }
  const outside =
    size !== undefined &&
    corners.some((box) => box.x_max > size.width || box.y_max > size.height);
  if (outside) {
    return err(
      invalidOption("A box reaches outside the source.", {
        field: "boxes",
        model,
        size,
        task,
      })
    );
  }
  if (fractionBoxes !== true || size === undefined) {
    return ok(corners);
  }
  return ok(
    corners.map((box) => ({
      x_max: box.x_max / size.width,
      x_min: box.x_min / size.width,
      y_max: box.y_max / size.height,
      y_min: box.y_min / size.height,
    }))
  );
}
