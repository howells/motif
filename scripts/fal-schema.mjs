#!/usr/bin/env node
/**
 * Print the real input shape, output shape, and price of a fal endpoint.
 * Registry entries in packages/motif-sdk/src/tool-registry/* must match what
 * this prints — endpoint ids, input field names and output keys guessed from a
 * model page are wrong often enough to matter, and a wrong entry only fails at
 * runtime, after the call has been billed.
 *
 * Two sources, because fal publishes this in two places:
 *   - schema (inputs, outputs, defaults) comes from fal's OpenAPI document;
 *   - price comes from the `endpointBilling` record embedded in the model
 *     page's RSC payload. The OpenAPI document carries no pricing at all.
 * The price half is therefore a scrape of a rendered page, and is the more
 * fragile of the two: a `price: unavailable` line means the page shape moved,
 * not that the endpoint is free. Schema output is unaffected either way.
 *
 * Reads both. Never runs a model, never costs anything.
 *
 *   node scripts/fal-schema.mjs fal-ai/sam-3/image
 *   node scripts/fal-schema.mjs --json fal-ai/patina fal-ai/qwen-image-layered
 *   node scripts/fal-schema.mjs --no-price fal-ai/sam-3/image   # schema only
 */

const OPENAPI = "https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=";
const MODEL_PAGE = "https://fal.ai/models/";

/** Follow a local `#/components/schemas/X` ref one level. */
function deref(schemas, node) {
  if (node && typeof node.$ref === "string") {
    const name = node.$ref.split("/").at(-1);
    return schemas[name] ?? {};
  }
  return node ?? {};
}

/** Render a property's type compactly: `string`, `list[string]`, `enum(a|b)`. */
function typeOf(schemas, prop) {
  const node = deref(schemas, prop);
  if (Array.isArray(node.enum)) {
    return `enum(${node.enum.join("|")})`;
  }
  if (node.type === "array") {
    return `list[${typeOf(schemas, node.items)}]`;
  }
  if (Array.isArray(node.anyOf)) {
    return node.anyOf
      .map((entry) => typeOf(schemas, entry))
      .filter((name) => name !== "null")
      .join("|");
  }
  return node.type ?? node.title ?? "object";
}

function pick(schemas, suffix) {
  const name = Object.keys(schemas).find((key) => key.endsWith(suffix));
  return name ? { name, schema: schemas[name] } : null;
}

/** Unescape one RSC-payload string literal into readable prose. */
function unescapeRsc(value) {
  return value
    .replace(/\\"/g, '"')
    .replace(/\\\\n|\\n/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Scrape `endpointBilling` (and the human pricing note that overrides it) out
 * of a model page. Returns `null` rather than throwing: pricing is a bonus on
 * top of the schema, and a page-shape change must not take the whole tool down.
 */
async function fetchPrice(endpointId) {
  let html;
  try {
    const response = await fetch(`${MODEL_PAGE}${endpointId}`, {
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      return null;
    }
    html = await response.text();
  } catch {
    return null;
  }

  const billing = /\\"endpointBilling\\":\{(.*?)\}/.exec(html);
  if (!billing) {
    return null;
  }

  let record;
  try {
    record = JSON.parse(`{${billing[1]}}`.replace(/\\"/g, '"'));
  } catch {
    return null;
  }

  const override = /\\"pricingInfoOverride\\":\\"((?:[^\\]|\\[^"])*)\\"/.exec(
    html
  );
  return {
    // fal's headline rate. Where `note` is present it is the authority: the
    // rate below is often a per-unit base that tiers multiply.
    price: record.price,
    unit: record.billing_unit,
    ...(override ? { note: unescapeRsc(override[1]) } : {}),
  };
}

async function describe(endpointId, withPrice) {
  const response = await fetch(`${OPENAPI}${encodeURIComponent(endpointId)}`);
  if (!response.ok) {
    return { endpointId, error: `HTTP ${response.status} — endpoint id not found` };
  }

  const doc = await response.json();
  const schemas = doc.components?.schemas ?? {};
  const input = pick(schemas, "Input");
  const output = pick(schemas, "Output");

  if (!input || !output) {
    return { endpointId, error: "no Input/Output schema in document" };
  }

  const required = new Set(input.schema.required ?? []);
  const inputs = Object.entries(input.schema.properties ?? {}).map(
    ([key, prop]) => ({
      key,
      required: required.has(key),
      type: typeOf(schemas, prop),
      ...(deref(schemas, prop).default === undefined
        ? {}
        : { default: deref(schemas, prop).default }),
    })
  );

  return {
    endpointId,
    inputs,
    // The registry's `inputField` must be one of these, and its `outputKeys`
    // must all appear in `outputs`. Keep this in step with the `inputField`
    // union in packages/motif-sdk/src/tool-types.ts: a field missing here reads
    // as "no media input" and gets an endpoint wrongly dropped.
    mediaFields: inputs
      .filter(({ key }) =>
        /^(image_url|image_urls|input_image_url|input_image_urls|video_url|mask_url)$/.test(
          key
        )
      )
      .map(({ key }) => key),
    outputs: Object.keys(output.schema.properties ?? {}),
    // Second source; see the header note. Absent when --no-price is passed.
    ...(withPrice ? { price: await fetchPrice(endpointId) } : {}),
  };
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const withPrice = !args.includes("--no-price");
const ids = args.filter((arg) => !arg.startsWith("--"));

if (ids.length === 0) {
  console.error(
    "usage: node scripts/fal-schema.mjs [--json] [--no-price] <endpoint-id>..."
  );
  process.exit(2);
}

const results = [];
for (const id of ids) {
  results.push(await describe(id, withPrice));
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const result of results) {
    if (result.error) {
      console.log(`\n✗ ${result.endpointId}\n  ${result.error}`);
      continue;
    }
    console.log(`\n✓ ${result.endpointId}`);
    console.log(`  media in : ${result.mediaFields.join(", ") || "(none)"}`);
    console.log(`  outputs  : ${result.outputs.join(", ")}`);
    const required = result.inputs.filter((entry) => entry.required);
    if (required.length > 0) {
      console.log(
        `  required : ${required.map((entry) => `${entry.key}:${entry.type}`).join(", ")}`
      );
    }
    const defaulted = result.inputs.filter((entry) => entry.default !== undefined);
    if (defaulted.length > 0) {
      console.log(
        `  defaults : ${defaulted.map((entry) => `${entry.key}=${JSON.stringify(entry.default)}`).join(", ")}`
      );
    }
    if (withPrice) {
      console.log(
        `  price    : ${
          result.price
            ? `$${result.price.price}/${result.price.unit}`
            : "unavailable (model page shape changed; not free)"
        }`
      );
      if (result.price?.note) {
        console.log(`  pricing  : ${result.price.note}`);
      }
    }
  }
}

if (results.some((result) => result.error)) {
  process.exit(1);
}
