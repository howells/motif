/**
 * Parsers for the verb flags that take whole pixels of the source: erase's
 * `--boxes`, and reframe's `--margin` and `--sizes`.
 */

import type { CustomImageSize, TaskInput } from "@howells/motif-sdk";

const WHOLE_NUMBER_REGEX = /^\d+$/;
const SIZE_REGEX = /^(\d+)x(\d+)$/;

function wholeNumbers(text: string, label: string): number[] {
  return text.split(",").map((part) => {
    const trimmed = part.trim();
    if (!WHOLE_NUMBER_REGEX.test(trimmed)) {
      throw new Error(`${label} takes whole pixels: ${JSON.stringify(text)}`);
    }
    return Number(trimmed);
  });
}

/** `--boxes x,y,w,h;x,y,w,h` in whole pixels of the source. */
export function parseBoxes(text: string): NonNullable<TaskInput["boxes"]> {
  return text.split(";").map((box) => {
    const numbers = wholeNumbers(box, "--boxes");
    if (numbers.length !== 4) {
      throw new Error(
        `--boxes takes x,y,w,h per box, boxes separated by ';': ${JSON.stringify(text)}`
      );
    }
    const [x = 0, y = 0, width = 0, height = 0] = numbers;
    return { height, width, x, y };
  });
}

/** `--margin 200` on every edge, or `--margin top,right,bottom,left`. */
export function parseMargin(text: string): NonNullable<TaskInput["margin"]> {
  const numbers = wholeNumbers(text, "--margin");
  if (numbers.length === 1) {
    const [all = 0] = numbers;
    return { bottom: all, left: all, right: all, top: all };
  }
  if (numbers.length !== 4) {
    throw new Error(
      `--margin takes one number or top,right,bottom,left: ${JSON.stringify(text)}`
    );
  }
  const [top = 0, right = 0, bottom = 0, left = 0] = numbers;
  return { bottom, left, right, top };
}

/** `--sizes 1080x1920,1200x630`. */
export function parseSizes(text: string): CustomImageSize[] {
  return text.split(",").map((size) => {
    const match = SIZE_REGEX.exec(size.trim());
    if (match === null) {
      throw new Error(`--sizes takes WxH,WxH: ${JSON.stringify(text)}`);
    }
    return { height: Number(match[2]), width: Number(match[1]) };
  });
}
