# Image model curation — 7 October 2026

## Findings

**Sunburst and Flare are the leading generation and editing choices on both current independent boards.** Artificial Analysis now uses **AA-Image-T2I v2.0** and **AA-Image-Editing v2.0**, so the pre-refresh August 23 snapshot in Motif was stale and its Elo scale must not be compared with the new scores. Arena was updated **6 October 2026**, and already includes preliminary Nano Banana 2.1 results. [AA generation][aa-gen] [AA editing][aa-edit] [Arena generation][arena-gen] [Arena editing][arena-edit]

At the investigation baseline, the biggest verified global coverage gaps were **MAI-Image-2.6**, **MAI-Image-2.6-Flash**, **Muse Image**, and **Nano Banana 2.1**. The refresh now includes Nano Banana 2.1. The first three lack verified fal endpoints in this investigation; their absence from Motif is a provider-availability gap, not a reason to silently route a weaker family member under their name. Motif already registered Sunburst, Flare and Grok Image 2.0, but their curated Task selection and benchmark metadata lagged. The implementation below refreshes both.

## How to interpret the evidence

- AA ranks blind pairwise human preferences using its recruited panel plus public Image Arena votes cast before 1 January 2026. Its current boards expose 95% Elo intervals and comparison counts. FLUX.2 dev is fixed at 1000 as an anchor. Fetch date is 7 October; no separate board-update timestamp was visible. [AA FAQ and tables][aa-gen]
- Arena uses community blind comparisons and labels new entries preliminary. Its published score intervals and rank spreads should be retained; this note does not assume the displayed Arena interval has a stated confidence level identical to AA. [Arena explanation][arena-method] [Arena board][arena-gen]
- Scores cannot be combined across providers, Task boards or versions. Overlapping confidence intervals weaken strict ordering: AA Sunburst/Flare generation rank range is 1–2; Arena Nano Banana 2.1 generation rank spread is 4–6 and editing is 4–7.
- Match the exact variant: AA GPT 2.5 scores are **max**; GPT Image 2 is **high**; Arena GPT Image 2 is **medium**, Banana 2 enables web search, Pro is 2K, and Grok canvas is distinct from its dated API variant. No score should be transferred to another quality, endpoint or generation merely because its name resembles it.
- These boards measure preference on their prompt populations, not mask editing correctness, Series consistency, transparency, vector output, latency, fal reliability or total cost. Unranked means unknown, not bad.
- AA quoted API pricing belongs to the benchmark/provider, not necessarily fal; use verified fal prices for Motif tiers. No paid generations were run.

## AA generation: complete top 20

Captured live from [AA-Image-T2I v2.0][aa-gen]. Elo ± value is the displayed 95% interval half-width.

| Rank | Rank range | Exact benchmark model | Elo ±95% | Comparisons | API $/1,000 images |
| --- | --- | --- | --- | --- | --- |
| 1 | 1-2 | GPT Image 2.5 Sunburst (max) | 1198 ±9 | 14,432 | $210.7 /1k imgs |
| 2 | 1-2 | GPT Image 2.5 Flare (max) | 1191 ±9 | 13,808 | $210.7 /1k imgs |
| 3 | 3 | GPT Image 2 (high) | 1172 ±8 | 15,522 | $211.0 /1k imgs |
| 4 | 4-5 | Grok Imagine Image 2.0 | 1156 ±11 | 7,352 | $60.0 /1k imgs |
| 5 | 4-5 | MAI-Image-2.6 | 1151 ±10 | 9,665 | $38.9 /1k imgs |
| 6 | 6 | Nano Banana 2 (Gemini 3.1 Flash Image) | 1126 ±7 | 19,044 | $67.0 /1k imgs |
| 7 | 7-8 | Muse Image | 1115 ±9 | 8,959 | $10.0 /1k imgs |
| 8 | 7-12 | GPT Image 1.5 (high) | 1107 ±8 | 15,144 | $133.0 /1k imgs |
| 9 | 8-12 | MAI-Image-2.6-Flash | 1105 ±9 | 6,135 | $19.5 /1k imgs |
| 10 | 8-12 | MAI-Image-2.5 | 1104 ±8 | 15,366 | $48.1 /1k imgs |
| 11 | 8-13 | Nano Banana Pro (Gemini 3 Pro Image) | 1102 ±8 | 17,591 | $134.0 /1k imgs |
| 12 | 9-13 | MAI-Image-2.5-Pro | 1100 ±7 | 15,111 | $108.5 /1k imgs |
| 13 | 11-14 | Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image) | 1095 ±8 | 17,590 | $33.6 /1k imgs |
| 14 | 13-15 | Qwen-Image-3.0-Pro | 1088 ±9 | 6,598 | $40.0 /1k imgs |
| 15 | 14-16 | Seedream 5.0 Pro | 1081 ±8 | 13,184 | $90.0 /1k imgs |
| 16 | 15-16 | Qwen-Image-3.0 | 1075 ±9 | 6,281 | $30.0 /1k imgs |
| 17 | 17 | grok-imagine-image-quality | 1046 ±7 | 19,506 | $50.0 /1k imgs |
| 18 | 18-23 | Qwen-Image-2.1 | 1035 ±9 | 5,489 | No API available |
| 19 | 18-24 | MAI-Image-2.5-Flash | 1032 ±9 | 6,210 | $20.0 /1k imgs |
| 20 | 18-24 | Qwen Image 2.0 Pro (2026-04-22) | 1032 ±9 | 6,469 | $75.0 /1k imgs |

## AA editing: complete top 20

Captured live from [AA-Image-Editing v2.0][aa-edit]. This ordering differs materially from generation.

| Rank | Rank range | Exact benchmark model | Elo ±95% | Comparisons | API $/1,000 images |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | GPT Image 2.5 Sunburst (max) | 1183 ±8 | 18,413 | $210.7 /1k imgs |
| 2 | 2 | GPT Image 2.5 Flare (max) | 1163 ±7 | 19,216 | $210.7 /1k imgs |
| 3 | 3 | MAI-Image-2.6 | 1139 ±8 | 16,131 | $38.9 /1k imgs |
| 4 | 4-6 | MAI-Image-2.6-Flash | 1127 ±8 | 11,057 | $19.5 /1k imgs |
| 5 | 4-6 | GPT Image 2 (high) | 1125 ±8 | 14,480 | $211.0 /1k imgs |
| 6 | 4-7 | Muse Image | 1120 ±8 | 12,989 | $10.0 /1k imgs |
| 7 | 6-11 | MAI-Image-2.5 | 1114 ±8 | 13,259 | $48.1 /1k imgs |
| 8 | 7-12 | Grok Imagine Image 2.0 | 1110 ±9 | 8,001 | $60.0 /1k imgs |
| 9 | 7-12 | Nano Banana 2 (Gemini 3.1 Flash Image) | 1110 ±8 | 16,319 | $67.0 /1k imgs |
| 10 | 7-12 | MAI-Image-2.5-Pro | 1110 ±8 | 15,429 | $108.5 /1k imgs |
| 11 | 7-13 | Seedream 5.0 Pro | 1108 ±8 | 13,115 | $90.0 /1k imgs |
| 12 | 8-13 | GPT Image 1.5 (high) | 1103 ±8 | 13,416 | $133.0 /1k imgs |
| 13 | 11-13 | Nano Banana Pro (Gemini 3 Pro Image) | 1101 ±8 | 15,338 | $134.0 /1k imgs |
| 14 | 14-16 | MAI-Image-2.5-Flash | 1089 ±8 | 13,092 | $20.0 /1k imgs |
| 15 | 14-16 | HunyuanImage 3.5 (Preview) | 1087 ±9 | 5,907 | $24.0 /1k imgs |
| 16 | 14-16 | grok-imagine-image-quality | 1086 ±8 | 8,518 | $50.0 /1k imgs |
| 17 | 17-20 | Qwen-Image-3.0-Pro | 1077 ±8 | 13,245 | $40.0 /1k imgs |
| 18 | 17-22 | Qwen-Image-2.1 | 1074 ±9 | 5,952 | No API available |
| 19 | 17-22 | grok-imagine-image | 1073 ±8 | 5,892 | $20.0 /1k imgs |
| 20 | 17-22 | Luma UNI 1 Max | 1072 ±8 | 6,172 | $100.0 /1k imgs |

## Arena generation: complete top 20

Board dated 6 October 2026; captured 7 October. [Source][arena-gen]. P = provider marks preliminary.

| Rank | Rank spread | Benchmark model | Score ±interval | Votes |
| --- | --- | --- | --- | --- |
| 1 | 1–1 | gpt-image-2.5-sunburst | 1425 ±7 P | 17,103 |
| 2 | 2–2 | gpt-image-2.5-flare | 1398 ±7 P | 16,240 |
| 3 | 3–3 | gpt-image-2 (medium) | 1383 ±4 | 92,836 |
| 4 | 4–6 | mai-image-2.6 | 1333 ±5 | 24,410 |
| 5 | 4–6 | gemini-nano-banana-2.1 | 1328 ±9 P | 5,312 |
| 6 | 4–6 | grok-imagine-image-2.0 (canvas) | 1321 ±11 P | 3,447 |
| 7 | 7–8 | reve-2.1 | 1302 ±8 | 8,249 |
| 8 | 7–8 | grok-imagine-image-2.0 (20260801) | 1297 ±6 | 13,724 |
| 9 | 9–10 | Meta muse-image | 1274 ±5 | 41,538 |
| 10 | 9–11 | reve-2.0 | 1269 ±6 | 15,773 |
| 11 | 10–14 | gemini-3.1-flash-image (nano-banana-2) [web-search] | 1261 ±4 | 59,779 |
| 12 | 11–15 | Bytedance seedream-5.0-pro | 1256 ±4 | 93,528 |
| 13 | 11–16 | qwen-image-3.0-pro | 1255 ±6 | 11,439 |
| 14 | 11–16 | mai-image-2.5 | 1254 ±4 | 61,267 |
| 15 | 12–16 | gemini-3.1-flash-lite-image (nano-banana-2-lite) | 1250 ±6 | 17,806 |
| 16 | 13–16 | gemini-3-pro-image-2k (nano-banana-pro) | 1248 ±3 | 174,996 |
| 17 | 17–18 | gpt-image-1.5-high-fidelity | 1238 ±3 | 169,476 |
| 18 | 17–19 | gemini-3-pro-image-preview (nano-banana-pro) | 1234 ±5 | 86,464 |
| 19 | 18–19 | qwen-image-2.1 | 1223 ±7 P | 10,688 |
| 20 | 20–20 | Ideogram ideogram-4.0-quality | 1205 ±4 | 59,812 |

## Arena single-image editing: complete top 20

Board dated 6 October 2026; captured 7 October. [Source][arena-edit]. P = provider marks preliminary.

| Rank | Rank spread | Benchmark model | Score ±interval | Votes |
| --- | --- | --- | --- | --- |
| 1 | 1–1 | gpt-image-2.5-sunburst | 1524 ±5 P | 59,825 |
| 2 | 2–2 | gpt-image-2.5-flare | 1481 ±5 P | 57,408 |
| 3 | 3–3 | gpt-image-2 (medium) | 1462 ±3 | 305,825 |
| 4 | 4–6 | grok-imagine-image-2.0 (canvas) | 1439 ±9 P | 11,589 |
| 5 | 4–7 | mai-image-2.6 | 1428 ±5 | 51,384 |
| 6 | 4–7 | gemini-nano-banana-2.1 | 1428 ±6 P | 12,985 |
| 7 | 5–7 | grok-imagine-image-2.0 (20260801) | 1425 ±5 | 50,427 |
| 8 | 8–9 | Meta muse-image | 1403 ±4 | 142,644 |
| 9 | 8–9 | mai-image-2.5 | 1401 ±4 | 190,081 |
| 10 | 10–14 | Bytedance seedream-5.0-pro | 1394 ±3 | 282,865 |
| 11 | 10–15 | grok-imagine-image-quality (20260519) | 1391 ±6 | 38,195 |
| 12 | 10–15 | gemini-3-pro-image-2k (nano-banana-pro) | 1390 ±3 | 651,674 |
| 13 | 10–15 | chatgpt-image-latest-high-fidelity (20251216) | 1389 ±3 | 629,464 |
| 14 | 10–15 | gemini-3.1-flash-image (nano-banana-2) [web-search] | 1387 ±3 | 229,782 |
| 15 | 11–15 | gemini-3-pro-image-preview (nano-banana-pro) | 1386 ±3 | 540,775 |
| 16 | 16–18 | reve-2.1 | 1374 ±6 | 20,792 |
| 17 | 16–18 | gpt-image-1.5-high-fidelity | 1370 ±3 | 654,249 |
| 18 | 16–19 | qwen-image-2.1 | 1369 ±6 P | 21,941 |
| 19 | 18–20 | reve-2.0 | 1359 ±6 | 19,265 |
| 20 | 19–20 | Ideogram ideogram-4.5 | 1347 ±5 P | 19,318 |

## Registered Motif generation models

Investigation baseline: the 31 registered generation models before this refresh. Both AA columns are exact benchmark rows when available, with explicit family/configuration caveats. An editing score does not itself mean the current Motif entry supports editing. Full votes, CIs and exact variants are retained in the raw table evidence. [AA generation][aa-gen] [AA editing][aa-edit] [Registry](../../packages/motif-sdk/src/models.ts)

| Motif model | AA generation rank / Elo | AA editing rank / Elo | Interpretation |
| --- | --- | --- | --- |
| `flare` | #2 / 1191 ±9 | #2 / 1163 ±7 | Pre-refresh default was high; refreshed default is max. |
| `sunburst` | #1 / 1198 ±9 | #1 / 1183 ±8 | Pre-refresh default was high; refreshed default is max. |
| `gpt2` | #3 / 1172 ±8 | #5 / 1125 ±8 | AA high; Arena medium is a different configuration. |
| `gpt` | #8 / 1107 ±8 | #12 / 1103 ±8 | AA high; Arena high-fidelity label differs. |
| `banana2` | #6 / 1126 ±7 | #9 / 1110 ±8 | Arena variant enables web search; match request configuration. |
| `banana` | #11 / 1102 ±8 | #13 / 1101 ±8 | Arena variant uses 2K; match resolution. |
| `gemini` | #60 / 985 ±9 | #50 / 987 ±9 | Exact named benchmark; check configuration when routing. |
| `gemini3` | Unranked / no exact match | Unranked / no exact match | AA does not distinguish legacy preview route from stable Pro; family evidence only. |
| `seedream4` | #21 / 1030 ±9 | #36 / 1015 ±8 | Exact named benchmark; check configuration when routing. |
| `seedream45` | #26 / 1022 ±9 | #32 / 1037 ±9 | Exact named benchmark; check configuration when routing. |
| `seedream5` | #15 / 1081 ±8 | #11 / 1108 ±8 | Exact named benchmark; check configuration when routing. |
| `seedream5-lite` | #36 / 1012 ±9 | #24 / 1057 ±8 | Exact named benchmark; check configuration when routing. |
| `flux2-max` | #28 / 1020 ±8 | #49 / 997 ±8 | Exact named benchmark; check configuration when routing. |
| `flux2-pro` | #41 / 1004 ±8 | #41 / 1007 ±7 | Exact named benchmark; check configuration when routing. |
| `flux2-flex` | #22 / 1027 ±9 | #42 / 1007 ±7 | Exact named benchmark; check configuration when routing. |
| `flux2-dev` | #42 / 1000 | #45 / 1000 | Exact named benchmark; check configuration when routing. |
| `flux2-turbo` | #46 / 998 ±8 | #44 / 1004 ±7 | AA names dev Turbo; verify wrapper equivalence. |
| `flux` | #102 / 895 ±7 | Unranked / no exact match | No exact editing benchmark; Kontext scores are a different model. |
| `flux-fast` | #141 / 802 ±7 | Unranked / no exact match | Exact named benchmark; check configuration when routing. |
| `recraft` | #121 / 869 ±7 | Unranked / no exact match | Exact named benchmark; check configuration when routing. |
| `recraft4` | #62 / 984 ±9 | Unranked / no exact match | Exact named benchmark; check configuration when routing. |
| `ideogram` | #101 / 897 ±7 | Unranked / no exact match | Exact named benchmark; check configuration when routing. |
| `ideogram4` | #40 / 1004 ±8 | Unranked / no exact match | Quality variant separately ranks #37, 1012±7; default row #40. |
| `grok-image` | #30 / 1019 ±8 | #19 / 1073 ±8 | Exact named benchmark; check configuration when routing. |
| `grok-image-2` | #4 / 1156 ±11 | #8 / 1110 ±9 | Exact named benchmark; check configuration when routing. |
| `qwen` | #106 / 890 ±7 | Unranked / no exact match | Editing Qwen Image Edit is a separate model, not this generation endpoint. |
| `qwen3` | #16 / 1075 ±9 | #25 / 1056 ±8 | Editing score is model-family evidence; current Motif entry has no edit endpoint. |
| `mai-image-2.5-pro` | #12 / 1100 ±7 | #10 / 1110 ±8 | Exact named benchmark; check configuration when routing. |
| `banana2-lite` | #13 / 1095 ±8 | #26 / 1046 ±8 | Pre-refresh Motif was generation-only; the verified Lite edit route is now registered. |
| `ideogram3-transparent` | Unranked / no exact match | Unranked / no exact match | Transparency specialist unranked; absence is not evidence of low task quality. |
| `recraft41` | #53 / 989 ±9 | Unranked / no exact match | Exact named benchmark; check configuration when routing. |

## Curation decisions

The implementation can cover verified fal leaders now while separately tracking stronger global models whose fal routes are unverified. Root verification found `microsoft/mai-image-2.5` and `/edit` available; unlike the pre-existing Pro variant, it ranks AA generation **#10, 1104±8**, editing **#7, 1114±8**. It is a useful verified addition, though MAI2.6 remains the stronger global model. Availability is documentation evidence, not a successful paid generation. [fal MAI2.5 generation][fal-mai] [fal MAI2.5 editing][fal-mai-edit]

| Decision | Models | Reason |
| --- | --- | --- |
| Add | Nano Banana 2.1, MAI Image 2.5 | Current preliminary Arena evidence for 2.1; current AA evidence for MAI2.5; verified fal documentation |
| Frontier/core alternatives | Sunburst, Flare, GPT2, GPT1.5, Banana Pro, Banana2, Banana2Lite, Grok2.0, Seedream5Pro, Qwen3, MAI2.5Pro | Representative current families; choose Task-specific ordering and price/quality defaults |
| Retain specialists | Ideogram3Transparent, Recraft4.1, Ideogram4, FLUX2Pro, FLUX2Flex, FLUX2Turbo, Grok original, Seedream5Lite | Transparency, design, Look/control or budget roles need explicit rationale; not general-quality leaders |
| Archive from curated choices | Gemini2.5, Gemini3Preview, Seedream4, Seedream4.5, FLUX2Max, FLUX2Dev, FLUX1Ultra, FLUXSchnell, RecraftV3, RecraftV4, IdeogramV3, Qwen original | Superseded or weak overall evidence; preserve explicit IDs and existing Look pins for compatibility |
| Watch as coverage gaps | MAI2.6, MAI2.6Flash, Muse Image, Qwen3Pro | Globally competitive but fal route not verified; no invented routing |

1. **Promote Sunburst/Flare for quality generation and editing using measured max variants.** Their existing defaults must be aligned with the measured configuration or the evidence clearly labeled; max results do not justify high-default scores. Maintain distinct generation/editing rankings.
2. **Add Nano Banana 2.1 as a balanced workhorse with provisional evidence.** Arena has generation #5 (1328±9, 5,312 votes) and editing #6 (1428±6, 12,985 votes), both preliminary; AA currently has no 2.1 row. Keep the distinction between provisional ranking and provider claims. [2.1 investigation](nano-banana-refresh-2026-10-07.md)
3. **Track global leaders without inventing fal routes.** Microsoft documents MAI2.6/Flash in Foundry public preview; Meta documents Muse Image in its consumer products. No verified fal integration was located from their official announcements. Qwen3Pro is globally competitive (#14/#17 AA) but also lacks a verified fal route here. Their presence in the benchmark should remain visible as a coverage gap. [Microsoft availability][mai-news] [Meta availability][muse-news]
4. **Retain strong alternatives with a reason:** GPT Image 2, Grok Image 2.0, Banana Pro, Banana 2.1, Seedream 5 Pro and selected efficient/specialist models. General editing evidence favors Grok 2.0 over old Grok; Banana Lite has weaker editing than generation.
5. **Prune general-purpose curated Task selection of superseded entries**, while preserving explicit compatibility routes: old Gemini 2.5, Gemini3 preview alias, Seedream4/4.5, Qwen original, FLUX1 Ultra/Schnell, RecraftV3 and IdeogramV3. FLUX2 dev/pro/max/flex and RecraftV4/V4.1 also need a cost/control/design-specific rationale; they are not current overall-quality leaders. “Newer” alone does not qualify Ideogram4.5 either: AA generation #33, editing #23.
6. **Keep capability specialists despite weak/absent general scores** when their Task needs justify them: transparent images, vectors/design controls, custom sizes, inexpensive drafts, masks or open weights. General preference rank is not a blanket removal rule. Specialist exceptions should have explicit documented reasons and not occupy quality defaults.
7. **Refresh provenance together.** Replace August benchmark snapshots and per-model scores with current model variants, date, source, score/rank and ideally interval/comparison counts. Do not retain unsupported Reve2.1 or quality rankings as if current AA data still measured them; Reve2.1 appears on Arena (#7 generation, #16 editing), not these live AA boards.

## Implemented refresh

The recommended generation list now has **21 Models**, down from 31 after archiving 12 predecessors and adding Nano Banana 2.1 (`banana21`) and MAI 2.5 (`mai-image-2.5`). The default choices are Sunburst at `max` for quality, Nano Banana 2.1 for balanced, and Nano Banana 2 Lite for fast generation. Fast editing chooses the stronger editing-ranked budget Grok route. Generation with References uses the editing order.

Separate Task rankings now use the current AA v2 evidence; the 2.1 placement is explicitly based on preliminary Arena evidence. Both GPT 2.5 variants default to the benchmarked `max`, with explicit quality overrides still available. Token-billed 2.1, Lite and MAI 2.5 have unknown total cost in dry runs. The Lite edit endpoint is enabled. No family score is fabricated for the unverified legacy Gemini preview route or Reve's missing current AA row.

Archived routes stay available only through explicit overrides, pins, prior-image reuse and existing Looks. Specialist exceptions retain specific roles: Ideogram V3 Transparent supplies alpha on fal; Recraft 4.1 supplies design-oriented generation; Ideogram 4 supplies typography/style controls; FLUX.2 Pro supplies tuned Looks; FLUX.2 Flex exposes guidance/steps; FLUX.2 Turbo supplies inexpensive drafts; Grok and Seedream 5 Lite supply budget edits. These are curation judgments, not claims that these specialists lead general preference boards.

Bench alignment records the actual configured quality and advances its cohort version, so prior high-quality runs cannot be mixed with refreshed max-quality runs. Existing package names, versions, public export declarations and package file allowlists are unchanged.

## Evidence and verification

Raw HTML and parsed row arrays are stored outside the repo under `/tmp/motif-{aa-t2i,aa-edit,arena-t2i,arena-edit}-20261007.{html,txt,rows.json}`. `/tmp/motif-curation-evidence-20261007.json` bundles all four complete boards and the registry mapping. Source pages were read with unauthenticated HTTP; no paid scraping, model calls or dependency installs.

Verification completed: `pnpm build`, `pnpm typecheck`, `pnpm lint`, and `pnpm test` passed. The full suite passed 1,264 tests (SDK 530, CLI 411, benchmark core 127, workflows 82, web 98, database 11, environment 5); three opt-in SDK checks were skipped. Lint retains existing warnings and reports no errors. CLI dry runs confirmed generation/editing tier choices, Sunburst max and explicit high, Nano Banana 2.1 medium thinking and 0.5K refusal, and retained predecessor overrides. SDK/CLI `npm pack --dry-run --ignore-scripts --json` manifests contain only allowlisted package contents and npm’s required manifest. `git diff --check` passed. Paid image comparisons remain a separate opt-in check, particularly for masks, text correctness and Series consistency.

[aa-gen]: https://artificialanalysis.ai/image/leaderboard/text-to-image
[aa-edit]: https://artificialanalysis.ai/image/leaderboard/editing
[arena-gen]: https://arena.ai/leaderboard/text-to-image
[arena-edit]: https://arena.ai/leaderboard/image-edit
[arena-method]: https://arena.ai/how-it-works
[mai-news]: https://microsoft.ai/news/mai-image-2-6-launches-at-no-2-on-arena-ahead-of-google-meta-and-xai/
[muse-news]: https://ai.meta.com/blog/introducing-muse-image-muse-video-msl/
[fal-mai]: https://fal.ai/models/microsoft/mai-image-2.5/llms.txt
[fal-mai-edit]: https://fal.ai/models/microsoft/mai-image-2.5/edit/llms.txt
