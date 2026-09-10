/**
 * The CLI's own output, captured from the repo build. Import the assembled
 * `AGENT_SURFACE` from `@/lib/site/content`.
 */

/** From `motif --help`: the "Commands, by task" block and the looks and moods
 * lines, verbatim. */
export const HELP_EXCERPT = `Commands, by task:
  motif "prompt"                make an image from a prompt, or edit with -e
  motif erase "what" [image]    remove an object and fill the gap
  motif reframe --og [image]    extend the canvas to a new aspect ratio
  motif segment "what" [image]  cut out or mask a named thing
  motif ask "question" [image]  caption, count, detect or ask about an image
  motif enhance [image]         upscale, restore, denoise or sharpen
  motif layers [image]          split an image into transparent layers
  motif vectorize [image]       trace a raster image to a clean SVG
  motif sheet <images...>       lay images out on a captioned contact sheet
  motif series run "theme"      make a consistent set of images from a theme
  motif series <subcommand>     keep a reusable style, references and history
  motif tool list               other fal utilities: depth, 3D, relight, OCR
  motif studio                  open the interactive terminal Studio
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
    "motif erase: Remove an object, person or clutter from a photo, named in words, and fill the gap it leaves."
  ]
}`;

/** A slice of `motif --describe tasks --format json`, pretty-printed: a few
 * task words and the full entry for one command. */
export const DESCRIBE_TASKS_EXCERPT = String.raw`{
  "tasks": {
    "remove": "erase",
    "outpaint": "reframe",
    "cutout": "segment",
    "ocr": "ask",
    "upscale": "enhance",
    "svg": "vectorize",
    "depth": "tool"
  },
  "commands": {
    "erase": {
      "summary": "remove an object and fill the gap",
      "usage": "motif erase \"what\" [image]",
      "whenToUse": "Remove an object, person or clutter from a photo, named in words, and fill the gap it leaves.",
      "notFor": "An object with a visible shadow (tool finegrain-eraser), putting something else in the gap (tool bria-genfill), text (tool text-removal), or the whole background (--rmbg).",
      "tasks": ["cleanup", "delete", "erase-object", "inpaint", "remove", "remove-object"]
    }
  }
}`;
