/**
 * Holds the App's type case in `app/app.css`. The case is three roles, all at
 * weight 400 (`type-small` 13/20, `type-body` 14/20, `type-title` 18/24), with
 * the wordmark's Faculty 28 as the one brand exception and `font-medium` (500)
 * the single emphasis weight. The App's components are held by the
 * `howells/no-raw-type-utilities` rule in the root `oxlint.config.ts`; this
 * script holds the stylesheet, which that rule cannot read.
 *
 * Shape (size, leading, tracking, family, weight other than 400 or 500) may be
 * written only in a rule made wholly of role selectors, in the wordmark, or in
 * the one form-field exception below. Anywhere else it is a finding, with the
 * role to join instead.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SIZES = new Set(["0.8125rem", "0.875rem", "1.125rem"]);

/** Selectors that are the roles themselves, or join one. */
const ROLE_SELECTORS = new Set([
  ".app .type-small",
  ".app-label",
  ".app-segmented label",
  ".app-value",
  ".board-figure",
  ".board-chip",
  ".library-label",
  ".app .type-body",
  ".app-nav a",
  ".app-button",
  ".app-input",
  ".app-select",
  ".app-textarea",
  ".board-segmented > label",
  ".board-segmented > button",
  ".board-button",
  ".board-field",
  ".library-plate-button",
  ".app-head h1",
  ".app-screen-title",
  ".library-title",
  ".board-beat-current",
  ".app .type-title",
]);

/** The wordmark is the brand exception. */
const BRAND_SELECTORS = new Set([".app-wordmark"]);

/** A form field is 16px below 48rem so iOS does not zoom on focus: the one
 * documented exception, written once. */
const FORM_FIELD_SELECTOR =
  ".app :is(.app-input, .app-select, .app-textarea, .app-prompt, .board-field)";

/** The rules that set the case on the document itself. */
const BASE_SELECTORS = new Set([".app", ".app :is(h1, h2, h3, h4)", ".app kbd"]);

const SHAPE = new Set([
  "font-size",
  "font-family",
  "font-weight",
  "letter-spacing",
  "line-height",
  "text-transform",
  "font",
]);

const ROLE_FOR = {
  "font-family": "type-small, type-body or type-title (Inter is the role's)",
  "font-size": "type-small (13), type-body (14) or type-title (18)",
  "letter-spacing": "type-title (-0.01em); the others have none",
  "line-height": "the role already sets its leading",
  "text-transform": "`capitalize` in markup; no role uppercases",
  "font-weight": "400 in the role, or 500 as the single emphasis weight",
  font: "a role; only `font: inherit` is allowed",
};

/** Split a selector list at its top-level commas, not those inside `:is()`. */
const splitList = (list) => {
  const parts = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < list.length; index += 1) {
    const char = list[index];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(list.slice(from, index));
      from = index + 1;
    }
  }
  parts.push(list.slice(from));
  return parts;
};

/**
 * Walk the stylesheet's rules with the selector list and the `@media`
 * prelude each sits in. Comments and strings are blanked first so braces in
 * them are not read.
 */
export function rulesOf(css) {
  const blanked = css
    .replaceAll(/\/\*[\s\S]*?\*\//gu, (match) => match.replaceAll(/[^\n]/gu, " "))
    .replaceAll(/"[^"\n]*"/gu, (match) => `"${" ".repeat(match.length - 2)}"`);
  const rules = [];
  const stack = [];
  let start = 0;
  for (let index = 0; index < blanked.length; index += 1) {
    const char = blanked[index];
    if (char === "{") {
      const prelude = blanked.slice(start, index).trim();
      stack.push({ at: index, prelude });
      start = index + 1;
    } else if (char === "}") {
      const open = stack.pop();
      if (open !== undefined && !open.prelude.startsWith("@")) {
        const body = css.slice(open.at + 1, index);
        const media = stack.map((item) => item.prelude).filter((item) => item.startsWith("@media"));
        rules.push({
          at: open.at + 1,
          body,
          media,
          selectors: splitList(open.prelude).map((item) => item.replaceAll(/\s+/gu, " ").trim()),
        });
      }
      start = index + 1;
    } else if (char === ";") {
      start = index + 1;
    }
  }
  return rules;
}

const declarationsOf = (rule, css) => {
  const found = [];
  const pattern = /(?:^|;|\{)\s*([a-z-]+)\s*:\s*([^;{}]+)/gu;
  for (const match of rule.body.matchAll(pattern)) {
    const offset = rule.at + (match.index ?? 0) + match[0].indexOf(match[1]);
    const line = css.slice(0, offset).split("\n").length;
    found.push({ line, property: match[1], value: match[2].trim() });
  }
  return found;
};

export function violationsOf(css) {
  const out = [];
  for (const rule of rulesOf(css)) {
    const all = (set) => rule.selectors.every((selector) => set.has(selector));
    const owns =
      all(ROLE_SELECTORS) ||
      all(BRAND_SELECTORS) ||
      all(BASE_SELECTORS) ||
      (rule.selectors.length === 1 && rule.selectors[0] === FORM_FIELD_SELECTOR);
    const brand = all(BRAND_SELECTORS);
    for (const { line, property, value } of declarationsOf(rule, css)) {
      if (!SHAPE.has(property)) {
        continue;
      }
      const light = value === "inherit" || value === "normal";
      if (property === "font-weight" && ["400", "500", "inherit"].includes(value)) {
        continue;
      }
      if (property === "font" && value === "inherit") {
        continue;
      }
      if (property === "font-family" && value === "inherit") {
        continue;
      }
      if (owns && brand) {
        continue;
      }
      if (owns && property === "letter-spacing" && (light || value === "-0.01em")) {
        continue;
      }
      if (owns && property === "font-family" && value === "var(--font-sans)") {
        continue;
      }
      if (
        owns &&
        property === "font-size" &&
        (SIZES.has(value) || (rule.selectors[0] === FORM_FIELD_SELECTOR && value === "1rem"))
      ) {
        continue;
      }
      if (owns && property === "line-height" && ["1.25rem", "1.5rem"].includes(value)) {
        continue;
      }
      out.push({
        line,
        message: `${property}: ${value} in \`${rule.selectors.join(", ")}\` - use ${ROLE_FOR[property] ?? "a role"}`,
      });
    }
  }
  return out;
}

const target = fileURLToPath(new URL("../app/app.css", import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = violationsOf(readFileSync(target, "utf-8"));
  for (const item of found) {
    console.error(`apps/bench/app/app.css:${item.line}  ${item.message}`);
  }
  if (found.length > 0) {
    console.error(
      `\nApp typography: ${found.length} finding(s). The case is type-small, type-body and type-title; see the comment above them in app.css.`
    );
    process.exit(1);
  }
}
