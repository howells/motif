/**
 * Holds the product's spacing and radius scales (defined once in the
 * `@theme static` block of `app/globals.css`) in every stylesheet and every
 * component, on the site, in the App and in the Bench.
 *
 * Spacing is one 4px-based scale: 1, 2, 3, 4, 6, 8, 12, 16, 24 and 32 (4px to
 * 128px) plus `control` (44px). Radius is `control` (4px), `panel` (8px),
 * `frame` (0, for images), `full` and `none`. A value between two steps is a
 * decision to take one of them, never a new number.
 *
 * In a stylesheet, a gap, padding, margin, offset or radius is written as
 * `var(--spacing-*)`, `var(--radius-*)`, `var(--gutter)` or a `calc()`, `clamp()`
 * or `max()` of those. A hairline of 1 or 2px is allowed on an offset only
 * (`inset-block-start: -1px` seats a border or an indicator), never on a gap,
 * padding or margin. Tailwind's own `@theme` definitions are not rules, so the
 * token files may state the numbers.
 *
 * In markup, spacing utilities take a step of the scale (`gap-2`, not
 * `gap-1.5`; `px-4`, not `px-3.5`), an arbitrary value only when it is built
 * from a token (`bottom-[var(--bar)]`), and `rounded-*` takes `control`,
 * `panel`, `frame`, `full` or `none`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { rulesOf } from "./check-app-typography.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");

const STEPS = new Set(["0", "1", "2", "3", "4", "6", "8", "12", "16", "24", "32"]);
const RADII = new Set(["none", "full", "frame", "control", "panel"]);

/** Declarations that carry a gap, an inset or a corner. */
const CSS_PROPERTY =
  /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|border-radius|border-(?:top|bottom|start|end)-(?:left|right|start|end)-radius)(?:-(?:block|inline|top|right|bottom|left)(?:-(?:start|end))?)?$/u;
const OFFSET_PROPERTY = /^(?:inset|top|right|bottom|left)(?:-(?:block|inline)(?:-(?:start|end))?)?$/u;
const LENGTH = /-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|ch|ex)\b/gu;

/** Remove `var(...)` and `env(...)` calls, with their fallbacks, from a value. */
const withoutTokens = (value) => {
  let out = value;
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out.replaceAll(/(?:var|env)\([^()]*\)/gu, "0");
  }
  return out;
};

/** Findings for one CSS declaration, as messages. */
const cssFindings = (property, value) => {
  if (!CSS_PROPERTY.test(property)) {
    return [];
  }
  const isRadius = property.includes("radius");
  const lengths = withoutTokens(value).match(LENGTH) ?? [];
  const found = [];
  for (const length of lengths) {
    const size = Math.abs(Number.parseFloat(length));
    const hairline = OFFSET_PROPERTY.test(property) && (size === 1 || size === 2) && length.endsWith("px");
    if (isRadius && length === "9999px") {
      continue;
    }
    if (!hairline && size !== 0) {
      found.push(
        isRadius
          ? `${property}: ${length} - use var(--radius-control), var(--radius-panel), var(--radius-frame) or 50%`
          : `${property}: ${length} - use a var(--spacing-*) step (1, 2, 3, 4, 6, 8, 12, 16, 24, 32)`
      );
    }
  }
  return found;
};

export function cssViolationsOf(css) {
  const out = [];
  for (const rule of rulesOf(css)) {
    const pattern = /(?:^|;|\{)\s*([a-z-]+)\s*:\s*([^;{}]+)/gu;
    for (const match of rule.body.matchAll(pattern)) {
      const offset = rule.at + (match.index ?? 0) + match[0].indexOf(match[1]);
      const line = css.slice(0, offset).split("\n").length;
      for (const message of cssFindings(match[1], match[2].trim())) {
        out.push({ line, message: `${message} in \`${rule.selectors.join(", ")}\`` });
      }
    }
  }
  return out;
}

const VARIANTS = String.raw`(?:[\w\[\]:&>*()=.-]+:)*`;
const SPACING_UTILITY = new RegExp(
  String.raw`(?<![\w-])(${VARIANTS})(-?)(p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y|inset|inset-x|inset-y|top|bottom|left|right|start|end)-(\[[^\]\s]+\]|[0-9]+(?:\.[0-9]+)?|px)(?![\w.\[-])`,
  "gu"
);
const RADIUS_UTILITY = new RegExp(
  String.raw`(?<![\w-])(${VARIANTS})rounded(?:-(?:t|b|l|r|s|e|tl|tr|bl|br))?(?:-(\[[^\]\s]+\]|[a-z0-9]+))?(?![\w\[-])`,
  "gu"
);

const isComment = (line) => /^\s*(?:\/\/|\*|\/\*)/u.test(line);

export function markupViolationsOf(source) {
  const out = [];
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    if (isComment(line)) {
      continue;
    }
    for (const match of line.matchAll(SPACING_UTILITY)) {
      const [token, , , property, value] = match;
      const arbitrary = value.startsWith("[");
      const offset = /^(?:inset|inset-x|inset-y|top|bottom|left|right|start|end)$/u.test(property);
      if (arbitrary) {
        if (withoutTokens(value).match(LENGTH) !== null) {
          out.push({ line: index + 1, message: `\`${token}\` - build it from a var(--spacing-*) token, or take a step of the scale` });
        }
      } else if (value === "px") {
        if (!offset) {
          out.push({ line: index + 1, message: `\`${token}\` - a 1px gap or padding is off the scale; use \`${property}-0\` or \`${property}-1\`` });
        }
      } else if (!STEPS.has(value)) {
        out.push({ line: index + 1, message: `\`${token}\` - off the spacing scale; use 1, 2, 3, 4, 6, 8, 12, 16, 24 or 32` });
      }
    }
    for (const match of line.matchAll(RADIUS_UTILITY)) {
      const [token, , value] = match;
      if (value === undefined || !RADII.has(value)) {
        const shown = token.replace(/^.*:/u, "");
        out.push({ line: index + 1, message: `\`${shown}\` - use rounded-control (4), rounded-panel (8), rounded-frame (0), rounded-full or rounded-none` });
      }
    }
  }
  return out;
}

const walk = (directory) => {
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (name === "node_modules" || name === ".next") {
      continue;
    }
    if (statSync(path).isDirectory()) {
      files.push(...walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let total = 0;
  for (const root of ["app", "components", "lib"]) {
    for (const file of walk(join(appRoot, root))) {
      const isCss = file.endsWith(".css");
      if (!isCss && !file.endsWith(".tsx")) {
        continue;
      }
      const source = readFileSync(file, "utf-8");
      const found = isCss ? cssViolationsOf(source) : markupViolationsOf(source);
      for (const item of found) {
        console.error(`apps/bench/${relative(appRoot, file)}:${item.line}  ${item.message}`);
      }
      total += found.length;
    }
  }
  if (total > 0) {
    console.error(
      `\nDesign scale: ${total} finding(s). Spacing takes 1, 2, 3, 4, 6, 8, 12, 16, 24 or 32 and radius takes control, panel, frame, full or none; see the @theme block in app/globals.css.`
    );
    process.exit(1);
  }
}
