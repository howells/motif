/**
 * The CLI's own output, captured from the repo build. Import the assembled
 * `AGENT_SURFACE` from `@/lib/site/content`.
 */

/** From `motif --help`: the "Commands, by task" block and the looks and moods
 * lines, verbatim. */
export const HELP_EXCERPT = `Commands, by task:
  motif "prompt"                          make an image from a prompt
  motif vary [image]                      variations of an image
  motif erase "what" [image]              remove something, fill the gap
  motif cutout [image-or-video]           remove the background
  motif reframe [image] --og              extend to a new aspect ratio
  motif upscale [image-or-video]          make it larger
  motif restore [image]                   fix noise, blur, damage, colour
  motif relight [image] "light"           relight to a described light or a mood
  motif restyle [image] --like <image>    redraw in a reference's style
  motif segment "what" [image-or-video]   mask a named thing
  motif ask "question" [image]            caption, count, find or ask
  motif layers [image]                    split into transparent layers
  motif vectorize [image]                 trace to a clean SVG
  motif map [image]                       depth, edge, normal or pose map
  motif material [image]                  PBR maps from a surface photo
  motif tile "prompt" [image]             a seamlessly tiling texture
  motif mesh [image] [--rig]              a textured 3D mesh, rigged with --rig
  motif try-on [image] --garment <image>  dress a person in a garment
  motif animate "prompt" [image]          turn an image into a video
  motif sheet <images...>                 a captioned contact sheet
  motif series run "theme"                a consistent set from a theme
  motif series <subcommand>               a reusable style and references
  motif studio                            the interactive terminal Studio
  When to use each, and what to use instead: motif --describe tasks

Looks, a house style added to the prompt: --look <id>
  editorial, still-life, lived-in, architectural, homeowner, drawing, plate,
  engraved, ephemera, canvas, portrait, object
Moods, the light for looks that take one: --mood <id>
  window, dawn, raking, overcast, lamplit, nocturne`;

/** The JSON error printed to stderr, pretty-printed; the CLI prints it on one
 * line. */
export const DID_YOU_MEAN_OUTPUT = String.raw`{
  "type": "urn:motif:error:invalid-option",
  "title": "Invalid Option",
  "status": 400,
  "doc_uri": "motif://describe/errors#invalid-option",
  "error": true,
  "code": "INVALID_OPTION",
  "message": "\"remove\" isn't a motif command. Did you mean 'motif erase \"the car\" x.png'?",
  "details": {
    "didYouMean": "motif erase \"the car\" x.png",
    "task": "remove"
  },
  "is_retriable": false,
  "suggestions": [
    "Run 'motif erase \"the car\" x.png'",
    "motif erase: Remove an object, person, text or clutter from an image and fill the gap."
  ]
}`;

/** A slice of `motif --describe tasks --format json`, pretty-printed: a few
 * task words and the full entry for one command. */
export const DESCRIBE_TASKS_EXCERPT = String.raw`{
  "tasks": {
    "remove": "erase",
    "outpaint": "reframe",
    "rmbg": "cutout",
    "ocr": "ask",
    "denoise": "restore",
    "svg": "vectorize",
    "depth": "map",
    "3d": "mesh",
    "dress": "try-on"
  },
  "commands": {
    "erase": {
      "summary": "remove something, fill the gap",
      "usage": "motif erase \"what\" [image]",
      "whenToUse": "Remove an object, person, text or clutter from an image and fill the gap.",
      "notFor": "The whole background (cutout), or extending the canvas (reframe).",
      "tasks": ["cleanup", "delete", "erase-object", "inpaint", "remove", "remove-object"],
      "modes": [
        { "id": "boxes", "summary": "Remove whatever falls inside the given boxes." },
        { "id": "text", "summary": "Remove all rendered text." },
        { "id": "with", "summary": "Fill the masked region with something described in words." }
      ]
    }
  }
}`;

/** `motif --last --format json`, verbatim except `output`, shortened from an absolute local path to its file name. */
export const LAST_OUTPUT =
  '{"command":"last","aspect":"3:2","cost":0.03,"id":"b678f983-c048-4530-a99a-7e43939b7f58","look":"lived-in","model":"flux2-pro","mood":"lamplit","output":"lamplit.jpg","prompt":"A family kitchen with a scrubbed oak table. Interior photograph shot square-on at eye level on a 35mm lens, warm off-white plaster, wide oak floorboards, linen, brass and a little pattern, light, bright and layered, collected rather than styled, slightly imperfect and lived-in rather than showroom-perfect, photographic realism. No text, no logos, no people. Evening, warm practical lamps around 2400K, candles and a lit fire, cosy and warm, never gloomy.","resolution":"2K","timestamp":"2026-09-10T23:05:25.338Z","modelName":"FLUX.2 Pro"}';

/** `motif --history --limit 5 --fields id,prompt,model,cost --format ndjson`, all five lines. */
export const HISTORY_OUTPUT =
  '{"id":"25ea4c17-29ba-4e1b-9902-6e37c7949a02","prompt":"An abstract painting for a calm sitting room. Physical mineral pigment and chalk gesso on coarse natural linen, two or three confident gestures, warm ivory, oatmeal, putty and soft charcoal, flat diffuse museum reproduction lighting, shown unframed. No text.","model":"banana","cost":0.15}\n{"id":"c0d8b7c0-3bf5-4280-adc1-4eb3d34bd394","prompt":"Cohesive visual series about A ceramics studio on the Suffolk coast, from clay to kiln: consistent tone, style, color palette, lighting, lens language, framing discipline, material treatment, and post-processing across every image. Image 6 of 6 in a cohesive visual series about A ceramics studio on the Suffolk coast, from clay to kiln; quiet atmospheric detail; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark. Editorial photograph in the register of Atelier Ellis, Aman hotels, Kinfolk magazine and Aesop, pigment-rich mineral colour on named matte surfaces, quiet composition with generous negative space, shallow depth of field, shot on film with fine grain, restrained and materially rich. No text, no logos, no people. Low raking daylight from the left, long soft shadows that reveal texture.","model":"banana","cost":0.15}\n{"id":"0331b4e2-83da-434d-b4ff-295f9f574cae","prompt":"Cohesive visual series about A ceramics studio on the Suffolk coast, from clay to kiln: consistent tone, style, color palette, lighting, lens language, framing discipline, material treatment, and post-processing across every image. Image 5 of 6 in a cohesive visual series about A ceramics studio on the Suffolk coast, from clay to kiln; low-angle perspective; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark. Editorial photograph in the register of Atelier Ellis, Aman hotels, Kinfolk magazine and Aesop, pigment-rich mineral colour on named matte surfaces, quiet composition with generous negative space, shallow depth of field, shot on film with fine grain, restrained and materially rich. No text, no logos, no people. Low raking daylight from the left, long soft shadows that reveal texture.","model":"banana","cost":0.15}\n{"id":"88c068e2-a3e1-4fca-b70f-a8c59e76a8e4","prompt":"Cohesive visual series about A ceramics studio on the Suffolk coast, from clay to kiln: consistent tone, style, color palette, lighting, lens language, framing discipline, material treatment, and post-processing across every image. Image 4 of 6 in a cohesive visual series about A ceramics studio on the Suffolk coast, from clay to kiln; human-scale environmental view; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark. Editorial photograph in the register of Atelier Ellis, Aman hotels, Kinfolk magazine and Aesop, pigment-rich mineral colour on named matte surfaces, quiet composition with generous negative space, shallow depth of field, shot on film with fine grain, restrained and materially rich. No text, no logos, no people. Low raking daylight from the left, long soft shadows that reveal texture.","model":"banana","cost":0.15}\n{"id":"88672262-1e29-4801-b6f9-10e70d261de3","prompt":"Cohesive visual series about A ceramics studio on the Suffolk coast, from clay to kiln: consistent tone, style, color palette, lighting, lens language, framing discipline, material treatment, and post-processing across every image. Image 3 of 6 in a cohesive visual series about A ceramics studio on the Suffolk coast, from clay to kiln; close material and texture study; shared visual language, palette, lighting, lens, composition rhythm, and post-processing across the full set; no text, no watermark. Editorial photograph in the register of Atelier Ellis, Aman hotels, Kinfolk magazine and Aesop, pigment-rich mineral colour on named matte surfaces, quiet composition with generous negative space, shallow depth of field, shot on film with fine grain, restrained and materially rich. No text, no logos, no people. Low raking daylight from the left, long soft shadows that reveal texture.","model":"banana","cost":0.15}';

/** The first screen of `motif studio` on a fresh install, ANSI colour stripped. */
export const STUDIO_SCREEN =
  " ◆ motif │ ↑↓ navigate  enter select  q quit\n\n  ◆ Generate      Create new image from prompt\n    Edit          Modify, upscale, or remove background\n    Gallery       Browse generation history\n    Settings      Model, aspect, defaults\n\n ◆ $0.00 session │ $0.00 today │ $0.00 total";

/** Two entries from `motif --describe errors --format json`. */
export const DESCRIBE_ERRORS_EXCERPT =
  '{\n  "command": "errors",\n  "errors": {\n    "EMPTY_PROMPT": {\n      "docUri": "motif://describe/errors#empty-prompt",\n      "isRetriable": false,\n      "status": 400,\n      "title": "Empty Prompt",\n      "type": "urn:motif:error:empty-prompt",\n      "suggestions": [\n        "Provide a non-empty prompt as an argument or stdin JSON field"\n      ]\n    },\n    "ACCOUNT_LOCKED": {\n      "docUri": "motif://describe/errors#account-locked",\n      "isRetriable": false,\n      "status": 403,\n      "title": "Account Locked",\n      "type": "urn:motif:error:account-locked",\n      "suggestions": [\n        "The fal account is out of credit. Top up at https://fal.ai/dashboard/billing, then run the command again"\n      ]\n    }\n  }\n}';

/** `motif erase "the small amber bottle" source-apothecary.jpg --dry-run --format json --fields cost,costBasis,valid`, verbatim. */
export const DRY_RUN_OUTPUT =
  '{"cost":0.024,"costBasis":"projected","valid":true}';

/** `motif ask --detect "bottle" source-apothecary.jpg --no-open --format json`. */
export const DETECT_OUTPUT =
  '{\n  "objects": [\n    {\n      "x_min": 0.233154296875,\n      "y_min": 0.49609375,\n      "x_max": 0.325439453125,\n      "y_max": 0.87890625\n    },\n    {\n      "x_min": 0.34765625,\n      "y_min": 0.490234375,\n      "x_max": 0.43359375,\n      "y_max": 0.884765625\n    },\n    {\n      "x_min": 0.46923828125,\n      "y_min": 0.6044921875,\n      "x_max": 0.53857421875,\n      "y_max": 0.8720703125\n    }\n  ]\n}';
