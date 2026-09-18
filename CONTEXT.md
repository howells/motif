# Motif

Motif is a public creative automation interface for fal.ai media endpoints, with a domain centered on structured generation workflows that agents and humans can inspect before spending credits.

## Language

**Series**: A reusable creative context for generating related images with shared style, tone, **References** and local output history. _Avoid_: Project, collection, album

**Series Run**: A finite batch of planned image generations created from one theme inside a **Series**. _Avoid_: Batch, multi-generate, campaign

**Reference**: An image that guides a **Task** without being changed: tagged and attached to a **Series** to carry visual identity, character, location or layout into future generations, or passed with one request (an image given to generate, the style restyle copies, the garment in a try-on). _Avoid_: Edit image, sample, input image

**Source**: The image or video a **Task** changes, such as the photo erase works on or the person in a try-on. generate makes a new image, so it has no **Source**. _Avoid_: Input, edit image, original

**Theme**: The user's high-level creative brief for a **Series Run**. _Avoid_: Prompt, style prompt

**Scene Prompt**: The per-image creative instruction generated from a **Theme** or supplied by the user. _Avoid_: Prompt when referring only to one image inside a series

**Task**: One job Motif does to or with an image, named for its outcome (erase, reframe, relight), with Motif choosing the **Model** that performs it. _Avoid_: Function, capability, tool, job

**Model**: The provider endpoint that performs a **Task**. Motif chooses it; the user names one only to override that choice. _Avoid_: Tool, engine, endpoint

**Tier**: How far a **Task** trades cost and speed for quality - fast, balanced or quality - which moves Motif's choice along that **Task**'s ranked **Models**. _Avoid_: Quality, mode, speed

**Look**: A named house visual register - medium, finish, framing and exclusions - that Motif adds to a prompt, carrying its own default **Model** and aspect ratio. _Avoid_: Style, preset, recipe

**Mood**: A named light condition, added to a prompt alongside a photographic **Look** or applied to an existing image by relighting it. _Avoid_: Lighting, atmosphere, style

## Relationships

- A **Series** contains zero or more **References**.
- A **Series** contains zero or more **Series Runs**.
- A **Series Run** contains one or more **Scene Prompts**.
- A **Scene Prompt** is generated within exactly one **Series Run** when the user asks for a themed set.
- A **Reference** can be reused by many **Series Runs** in the same **Series**.
- Every **Task** ranks its **Models**. Motif uses the highest-ranked **Model** that can do what the request asks for (transparency, several references, the ratio, a video input) at the chosen **Tier**; the prompt never affects the choice.
- An explicit **Model** overrides the ranking, and a **Look**'s **Model** comes before the **Task**'s ranking, so a **Tier** has no effect on a **Look**.
- vary reuses the **Model** of the image it varies while Motif still offers that **Model**; otherwise it chooses one as a new generation would.
- A **Task** takes an image, and a video too where a video **Model** exists; the input narrows which **Models** qualify.
- The CLI exposes each **Task** as one verb; flags only adjust a **Task**.
- generate takes zero or more **References** and no **Source**; every other **Task** changes one **Source** and may take **References**.
- A **Series** has no **Model** of its own; its generations choose one as any other generation does.
- A generation uses at most one **Look** and at most one **Mood**.
- In a generation, a **Mood** applies only to a photographic **Look**; flat **Looks** (surfaces, paintings, illustrations, studio objects) carry their own light and refuse a **Mood**. Relighting applies a **Mood** to any existing image.
- A project can pin a **Task**'s **Model**; otherwise a release that changes a ranking changes that **Task**'s results.
- A **Series** can pin one **Look** and one **Mood**, which then apply to every generation in it.
- Only Motif defines **Looks**. A user's own visual identity lives in a **Series**, through its **References** and style prompt.

## Example Dialogue

> **Dev:** "If the user asks for six brutalist architecture images, do we create six standalone generations?" **Domain expert:** "No. Create or reuse a **Series**, treat 'brutalist architecture' as the **Theme**, plan a **Series Run** with six **Scene Prompts**, and keep them visually consistent through shared style and selected **References**."

## Flagged Ambiguities

- "series generator" was used both for the existing persistent **Series** feature and for a new themed multi-image workflow; resolved: the new workflow is a **Series Run** inside a **Series**.
- "function", "capability", "tool" and "command" were all used for a job Motif does; resolved: the job is a **Task**, a command is only how the CLI exposes one, and "tool" (a raw fal endpoint listed by model name) is retired.
- "style" meant three things: a model's own style parameter, a **Series** style prompt, and the house visual register; resolved: the house register is a **Look**, a model's own style setting is an override like any other model-only option, and "style" in Motif's language means only a **Series** style prompt.
- "reference" meant both an image attached to a **Series** and any image passed with -e; resolved: both are **References**, and the image a **Task** changes is its **Source**.
