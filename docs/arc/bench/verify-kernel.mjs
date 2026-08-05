// Plain-JS mirror of the align-params kernel, run against the real built SDK.
// Purpose: prove (a) all 18 aliases produce a body without throwing, and
// (b) the drift guard holds — every param we drop is one buildGenerateBody
// would actually have rejected, and every param we keep is accepted.
import {
  aspectToFalImageSize,
  aspectToGptSize,
  buildGenerateBody,
  GENERATION_MODELS,
  MODELS,
} from "/Users/danielhowells/Sites/motif/packages/motif-sdk/dist/index.js";

const SPEC = {
  prompt: "a sunlit mid-century living room, wide angle",
  aspect: "3:2",
  resolution: "2K",
  seed: 12345,
  outputFormat: "jpeg",
};

function align(alias, spec, sampleIndex) {
  const config = MODELS[alias];
  const sizeMode = config.sizeMode ?? "aspect_ratio";
  const dropped = [];
  const coerced = [];
  const autoSet = [];
  const options = { model: alias, prompt: spec.prompt };

  if (sizeMode === "none") {
    dropped.push("aspect");
  } else {
    options.aspect = spec.aspect;
    if (sizeMode === "gpt_size")
      coerced.push(`aspect ${spec.aspect}->${aspectToGptSize(spec.aspect)}`);
    else if (sizeMode === "image_size_enum")
      coerced.push(`aspect ${spec.aspect}->${aspectToFalImageSize(spec.aspect)}`);
    else if (!config.supportsAspect) dropped.push("aspect");
  }

  if (config.supportsResolution) options.resolution = spec.resolution;
  else dropped.push("resolution");

  if (spec.seed !== null) {
    if (config.supportsSeed) options.seed = spec.seed + sampleIndex;
    else dropped.push("seed");
  }

  if (spec.outputFormat !== null) {
    const ok =
      config.supportsOutputFormat === true &&
      (config.supportedOutputFormats === undefined ||
        config.supportedOutputFormats.includes(spec.outputFormat));
    if (ok) options.outputFormat = spec.outputFormat;
    else dropped.push("outputFormat");
  }

  if (config.supportsQuality) autoSet.push("quality=high");

  try {
    const { endpoint, body } = buildGenerateBody(options);
    return { ok: true, endpoint, body, dropped, coerced, autoSet, options };
  } catch (e) {
    return { ok: false, message: e.message, dropped, coerced };
  }
}

let failures = 0;

// ── 1. Every alias aligns and builds ────────────────────────────────────────
const rows = [];
for (const alias of GENERATION_MODELS) {
  const r = align(alias, SPEC, 0);
  if (!r.ok) {
    failures++;
    console.error(`ALIGN FAIL ${alias}: ${r.message}`);
    continue;
  }
  rows.push({
    alias,
    endpoint: r.endpoint,
    size: JSON.stringify(r.body.image_size ?? r.body.aspect_ratio ?? null),
    res: r.body.resolution ?? "-",
    seed: r.body.seed ?? "-",
    fmt: r.body.output_format ?? "-",
    quality: r.body.quality ?? "-",
    dropped: r.dropped.join(",") || "-",
  });
}
console.table(rows);

// ── 2. Drift guard: force each dropped param back in, expect a throw ────────
// If buildGenerateBody accepts something we dropped, we are needlessly
// degrading that model. If it rejects something we kept, alignment is broken.
const FORCE = {
  seed: 999,
  resolution: "4K",
  outputFormat: "jpeg",
};

for (const alias of GENERATION_MODELS) {
  const r = align(alias, SPEC, 0);
  if (!r.ok) continue;

  for (const [param, value] of Object.entries(FORCE)) {
    const wasDropped = r.dropped.includes(param);
    const probe = { ...r.options, [param]: value };
    let threw = false;
    let msg = "";
    try {
      buildGenerateBody(probe);
    } catch (e) {
      threw = true;
      msg = e.message;
    }

    if (wasDropped && !threw) {
      failures++;
      console.error(
        `DRIFT ${alias}.${param}: we dropped it but the SDK accepts it`,
      );
    }
    if (!wasDropped && threw) {
      failures++;
      console.error(`DRIFT ${alias}.${param}: we kept it but the SDK threw — ${msg}`);
    }
  }
}

// ── 3. Sanity: no data URIs / sync_mode, prompt present, num_images sane ────
for (const alias of GENERATION_MODELS) {
  const r = align(alias, SPEC, 0);
  if (!r.ok) continue;
  if (r.body.sync_mode !== undefined) {
    failures++;
    console.error(`LEAK ${alias}: sync_mode set — would return a data URI`);
  }
  if (typeof r.body.prompt !== "string" || r.body.prompt.length === 0) {
    failures++;
    console.error(`BAD ${alias}: missing prompt`);
  }
  if (r.body.num_images !== undefined && r.body.num_images !== 1) {
    failures++;
    console.error(`BAD ${alias}: num_images=${r.body.num_images}`);
  }
}

// ── 4. Per-sample seed offsetting is applied where supported ────────────────
for (const alias of GENERATION_MODELS) {
  const a = align(alias, SPEC, 0);
  const b = align(alias, SPEC, 1);
  if (!a.ok || !b.ok) continue;
  if (MODELS[alias].supportsSeed) {
    if (a.body.seed === b.body.seed) {
      failures++;
      console.error(`SEED ${alias}: sample 0 and 1 share a seed`);
    }
  } else if (a.body.seed !== undefined) {
    failures++;
    console.error(`SEED ${alias}: seed sent to a model that does not support it`);
  }
}

console.log(
  failures === 0
    ? "\nKERNEL OK — "+GENERATION_MODELS.length+"/"+GENERATION_MODELS.length+" aligned, drift guard clean"
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
