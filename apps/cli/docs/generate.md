# Generate input

Everything `generate` accepts: the three input modes, the full stdin JSON schema, edit references, the OpenAI transparency route and the prompt warnings. Part of the [CLI agent guide](../AGENTS.md). Looks and moods are in the guide itself.

## Input Modes

### 1. CLI Flags (human-friendly)

```bash
motif "a cat" -m gpt --landscape -r 2K -n 2
```

### 2. Stdin JSON (agent-friendly)

```bash
echo '{"prompt":"a cat","model":"gpt","aspect":"16:9","resolution":"2K","numImages":2}' | motif
```

### 3. Combined (stdin base + flag overrides)

```bash
echo '{"prompt":"a cat","model":"gpt"}' | motif --landscape -r 4K
```

Flag values override stdin JSON values for the same field.

## Stdin JSON Schema

```json
{
  "prompt": "string (required for generate)",
  "model": "flare | sunburst | gpt2 | gpt | banana2 | banana | gemini | gemini3 | seedream4 | seedream45 | seedream5 | seedream5-lite | flux2-max | flux2-pro | flux2-flex | flux2-dev | flux2-turbo | flux | flux-fast | recraft | recraft4 | ideogram | ideogram4 | grok-image | qwen | qwen3",
  "aspect": "1:1 | 16:9 | 9:16 | 2:3 | 3:2 | 4:3 | 3:4 | 4:5 | 5:4 | 21:9",
  "resolution": "1K | 2K | 4K",
  "numImages": 1,
  "output": "filename.png",
  "editImages": ["path/to/ref.png"],
  "transparent": false,
  "inputFidelity": "low | high",
  "preset": "cover | square | landscape | portrait | story | reel | feed | og | wallpaper | wide | ultra",
  "noOpen": true,
  "command": "generate | upscale | rmbg | vary | video | last | history | describe | tool | tool-run | tool-list | tool-describe",
  "limit": 10,
  "offset": 0,
  "imagePath": "path/to/image.png",
  "scale": 2,
  "duration": 5,
  "generateAudio": true
}
```

## Edit references

`-e/--edit` takes one path per flag and repeats: `motif -e a.png -e b.png "a cat"`. The prompt can go anywhere. Stdin `editImages` is still an array.

## Transparency

`--transparent` on `gpt2` (or a look that resolves to it) runs through OpenAI (`gpt-image-2`) rather than fal, because fal's GPT Image 2 endpoint has no background option. It needs `OPENAI_API_KEY`; without it the run fails with `MISSING_API_KEY` (exit `3`) and `details.envVar`. The dry run shows `route: "openai"`, `endpoint: "openai:gpt-image-2"`, `providerModel` and `requiredEnv`; plain runs show `route: "fal"`. OpenAI prices gpt-image-2 by tokens, so `estimatedCost` and the recorded cost are `null` (unknown), never a guess. Edits (`-e`) go the same way. Options OpenAI can't take (seed, negative prompt, `--quality xhigh`, and so on) fail with `INVALID_OPTION`. `-m gpt --transparent` stays on fal.

Every `--transparent` run reads the saved PNG back. With no alpha channel or no fully transparent pixel it fails with `TRANSPARENCY_MISSING` (status `502`, exit `5`, retriable): nothing is reported as a success or recorded in history, and the file stays on disk (`details.paths`).

## Prompt warnings

`generate` puts `warnings: [{rule, match, message}]` in dry-run JSON and in successful JSON output (empty when nothing matches), and prints them in yellow in human output. They are advisory: generation still goes ahead. They check the caller's own prompt only, never the look or mood text.

| Rule | Fires on | Why |
| --- | --- | --- |
| `negated-object` | `no <word>` (optionally `no a/an/the <word>`), except text, logos, logo, people, person, faces, watermark, watermarks, words, lettering | Negating an object tends to draw it into the picture; describe what is present instead |
| `text-bearing-object` | `no text` or `no words` together with sign, label, poster, book, menu, newspaper, packaging, card, ticket, magazine or screen | The model is likely to render text on the object anyway |
| `edit-has-verb` | a prompt starting with remove, erase, extend or outpaint, with `-e` set | An edit regenerates the whole image; `motif erase` or `motif reframe` does that job and leaves the rest alone |
