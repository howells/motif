# Nano Banana refresh — 7 October 2026

## Finding

The new release is **Nano Banana 2.1**, generally available **6 October 2026**, with Gemini API ID `gemini-nano-banana-2.1`. Google calls it the replacement for Nano Banana 2 and has deprecated `gemini-3.1-flash-image`, with **no shutdown date announced**. fal already exposes `google/nano-banana-2.1` and `google/nano-banana-2.1/edit`. This is a new model to consider for Motif, which already has Nano Banana 2, Pro and Lite. [Google release notes][releases] [Google model card][card] [fal generation schema][fal21] [fal edit schema][fal21edit]

This note records live, read-only first-party documentation. No generations, paid canaries or quality/latency measurements were run. “Improved,” “fastest,” and similar performance statements below are provider claims.

## What is new

Google's 2.1 model card claims improved realism and visual quality, prompt adherence, text rendering and infographic layouts, and character consistency across successive edits. It specifically reports **fixed tiling artifacts in 1:4, 4:1, 1:8 and 8:1 images at 2K and 4K**. That is a concrete improvement for banners and panoramas. Flash-level speed is claimed, without a numerical latency guarantee. [Google model card][card]

The main operational changes are lower image-output pricing, a new `medium` thinking level that is also the default, and the loss of 512px output. 2.1 supports 1K, 2K and 4K; Nano Banana 2 also supported 0.5K. Fourteen references, four-character/ten-object fidelity, extreme aspect ratios, and web/image grounding already existed in Nano Banana 2: 2.1 improves these capabilities rather than introducing them. [Google generation guide][guide] [Google pricing][pricing]

Google still describes Pro as the premium option for complex visual work, brand consistency, advanced localization and precise creative control. It describes Lite as fastest/cheapest for velocity and scale, explicitly **not optimized for multiple references or sequential multi-turn editing**. fal's Lite description instead advertises “fast multi-turn local edits” and “sub-2 second latency”; that stronger suitability claim is unverified here and disagrees with Google's guidance. [Google model selection][guide] [fal Lite generation][fallite]

## Family and dates

| Model | Current Gemini API ID | Release history | fal endpoints |
| --- | --- | --- | --- |
| Nano Banana 2.1 | `gemini-nano-banana-2.1` | GA 6 October 2026 | `google/nano-banana-2.1`, `/edit` |
| Nano Banana 2 | `gemini-3.1-flash-image` | Preview 26 February 2026; GA 28 May 2026; deprecated 6 October 2026, no shutdown date | `fal-ai/nano-banana-2`, `/edit` |
| Nano Banana Pro | `gemini-3-pro-image` | Preview 20 November 2025; GA 28 May 2026 | `fal-ai/nano-banana-pro`, `/edit` |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | GA 30 June 2026 | `google/nano-banana-2-lite`, `/edit` |
| Original Nano Banana | `gemini-2.5-flash-image` | Stable release 2 October 2025; scheduled shutdown 15 March 2027 | Legacy routes require individual fal verification |

Google recommends Lite as the original stable model's replacement. `gemini-3.1-flash-image-preview` and `gemini-3-pro-image-preview` shut down on the **Google API** on 25 June 2026. That does not prove equivalent fal aliases have stopped working; endpoint labels and upstream routing can differ. [Google release notes][releases] [Google deprecations][deprecations] [fal 2 schema][fal2] [fal Pro schema][falpro] [fal Lite edit schema][falliteedit]

The original Nano Banana 2 announcement remains useful context: world knowledge, grounded subjects, text translation/localization, rapid iteration and production-friendly aspect ratios were already its selling points in February. [Google announcement][announcement]

## fal 2.1 request surface

Both new endpoints use token billing and return `images` plus `description`. Their documented common controls are: [fal generation schema][fal21] [fal edit schema][fal21edit]

| Control | Documented behavior |
| --- | --- |
| `prompt` | Required text |
| `num_images` | 1–4, default 1 |
| `resolution` | `1K`, `2K`, `4K`; default `1K`; **no `0.5K`** |
| `aspect_ratio` | `auto` plus `21:9`, `16:9`, `3:2`, `4:3`, `5:4`, `1:1`, `4:5`, `3:4`, `2:3`, `9:16`, `4:1`, `1:4`, `8:1`, `1:8` |
| `output_format` | `jpeg`, `png`, `webp`; default `png` |
| `thinking_level` | `minimal`, `medium`, `high`; default `medium` |
| `enable_web_search` | Boolean; default false |
| `system_prompt` | Optional instruction, default empty |
| `seed` | Optional integer; deterministic repeatability is not established by this research |
| `limit_generations` | Default true; provider calls it experimental and says it may affect generation quality |
| `safety_tolerance` | Strings `1`–`6`, default `4` |
| `sync_mode` | Default false; true returns data URI and excludes media from request history |

The edit endpoint additionally takes `image_urls`, `video_url` and `pdf_url`. Images are optional when video or PDF context is supplied. Inline file context is limited to **15 MB** per documented video/PDF field; YouTube URLs are passed through without downloading. These inputs provide context for **image output**, not video generation or video editing. No `audio_url` is in the new 2.1 schema; Google's guide says image generation does not support audio input. [fal edit schema][fal21edit] [Google limitations][guide]

Google documents up to **14 reference images**, with fidelity for up to **4 characters and 10 objects**. fal's public edit schema does not specify `maxItems`, so the Google capability limit is the evidence for that cap rather than a fal schema constraint. Pro also allows 14 images overall, with different guidance: 5 characters, 6 objects and 3 style references. [Google generation guide][guide]

Google exposes separate Web Search and Image Search grounding configuration. fal 2.1 documents only the `enable_web_search` switch, so don't promise an independent image-search control through Motif without verifying adapter behavior. [Google grounding guide][guide] [fal generation schema][fal21]

## Pricing: distinguish providers and totals

All prices are USD, checked 7 October 2026. Image-output figures exclude input, generated text/thinking and grounding unless stated. [Google pricing][pricing] [fal 2.1 pricing explanation][fal21page] [fal 2 pricing][fal2] [fal Pro pricing][falpro] [fal Lite pricing][fallite]

| Model | Google standard image output | fal image output / advertised base |
| --- | --- | --- |
| 2.1 | 1K **$0.0336**; 2K **$0.0504**; 4K **$0.1134** from pricing-page token count | Token output: 1K **$0.03953**; 2K **$0.05929**; 4K **$0.13341**. fal representative short-prompt, medium-thinking totals: **$0.040 / $0.059 / $0.134** |
| 2 | 0.5K $0.045; 1K $0.067; 2K $0.101; 4K $0.151 (Google rounded values) | 0.5K **$0.06**; 1K **$0.08**; 2K **$0.12**; 4K **$0.16**; search +$0.015, high thinking +$0.002 |
| Pro | 1K/2K **$0.134**; 4K **$0.24** | 1K/2K **$0.15**; 4K **$0.30**; search +$0.015 |
| Lite | Fixed 1K **$0.0336** | Fixed 1K image output **$0.042** from 1,120 tokens at $37.50/M; plus input/text |

For 2.1, Google charges **$1.50/M input**, **$7.50/M text/thinking output**, **$30/M image output**. fal charges **$1.764/M input**, **$8.823/M text/thinking output**, **$35.294/M image output**. fal says there are **no separate resolution, thinking or search surcharges**: those settings alter token usage. Its published example for an edit with two 1K references is approximately **$0.044 / $0.063 / $0.138** at 1K/2K/4K. [Google pricing][pricing] [fal pricing explanation][fal21page]

Compared with fal 2's $0.08/$0.12/$0.16 base, fal's representative 2.1 totals are roughly **50% cheaper at 1K/2K, 16% cheaper at 4K**. These are documented example prices, not measured bills; long prompts, reference images, thinking and search affect totals. New 2.1 input and text/thinking token rates are also higher than Google's old 2 rates, so an image-output discount is not a universal total-cost guarantee. [Google pricing][pricing] [fal pricing explanation][fal21page]

Grounding is provider-specific: Google native pricing grants 5,000 shared Gemini 3.x search requests/month, then **$14/1,000 searches**, billed per query; retrieved grounding context is not input-token billed. fal explicitly says no separate search fee and search results are billed as input tokens. Do not apply Google's native quota or old fal 2's $0.015 surcharge to fal 2.1. [Google pricing][pricing] [fal pricing explanation][fal21page]

**Documentation inconsistency:** Google's generation guide currently lists **2,520** output tokens for 2.1 4K images, while its pricing page and fal's detailed explanation both list **3,780**. The table above uses the pricing page and fal's matching published examples. Resolve this before treating the SDK estimate as exact. fal's general prose also says “5K” once while the schema and Google card say 4K; 5K should not be exposed from that prose. [Google generation guide][guide] [Google pricing][pricing] [fal pricing explanation][fal21page]

## Initial Motif refresh recommendation

1. **Add 2.1 as a separate model candidate for generation and editing.** Use the verified `google/` endpoints and retain pinned existing aliases. It is a strong candidate for the balanced workhorse tier, given Google's positioning and fal's documented cost; quality-rank promotion needs comparative evidence.
2. **Handle the request differences deliberately:** `medium` thinking, 14-reference capability, model-specific resolution validation, token-based estimates, and documented PNG/JPEG/WebP output. Motif's current internal `ThinkingLevel` only permits `minimal | high`; omitting it uses fal's `medium` default, and an explicit model-only `thinking_level=medium` parameter is supported. Extreme aspect ratios already exist in Motif's type surface.
3. **Review selection and Looks separately.** At the investigation baseline, Task rankings predated this launch; `creative.ts` pins Look generations to `banana`/Pro. Updating Task rankings alone will not update those runs. Keep existing Look pins until there is evidence for changing their quality behavior.
4. **Correct adjacent known facts within a focused refresh:** Nano Banana 2's four-reference cap understates Google's published capability; its search/high-thinking surcharges should be reflected in estimates. Lite now has a documented edit endpoint, but choose its editing Tasks cautiously because Google discourages sequential editing and multi-reference workflows.
5. **Verify offline first.** Test resolver routing, dry-run payloads, 0.5K rejection, `medium` acceptance only on compatible models, reference limits, selected output format and cost estimates at each resolution. Then build/typecheck/lint/test. If approved later, run a small paid comparison of text-heavy posters, repeated character edits, reference fusion and extreme 2K/4K panoramas before changing quality defaults.

Repository evidence: [`models.ts`](../../packages/motif-sdk/src/models.ts), [`types.ts`](../../packages/motif-sdk/src/types.ts), [`tasks.ts`](../../packages/motif-sdk/src/tasks.ts), and [`creative.ts`](../../packages/motif-sdk/src/creative.ts). The initial investigation captured no verified 2.1 benchmark result. The subsequent [curation audit](image-model-curation-2026-10-07.md) captured preliminary Arena results: generation #5 and editing #6, and implemented 2.1 as the balanced default. It does not inherit its predecessor's AA Elo. That audit documents the final routing and verification; the recommendations above preserve the initial investigation context.

[releases]: https://ai.google.dev/gemini-api/docs/changelog
[card]: https://ai.google.dev/gemini-api/docs/models/gemini-nano-banana-2.1
[guide]: https://ai.google.dev/gemini-api/docs/image-generation
[pricing]: https://ai.google.dev/gemini-api/docs/pricing
[deprecations]: https://ai.google.dev/gemini-api/docs/deprecations
[announcement]: https://blog.google/innovation-and-ai/technology/ai/nano-banana-2/
[fal21]: https://fal.ai/models/google/nano-banana-2.1/llms.txt
[fal21edit]: https://fal.ai/models/google/nano-banana-2.1/edit/llms.txt
[fal21page]: https://fal.ai/models/google/nano-banana-2.1
[fal2]: https://fal.ai/models/fal-ai/nano-banana-2/edit/llms.txt
[falpro]: https://fal.ai/models/fal-ai/nano-banana-pro/llms.txt
[fallite]: https://fal.ai/models/google/nano-banana-2-lite/llms.txt
[falliteedit]: https://fal.ai/models/google/nano-banana-2-lite/edit/llms.txt
