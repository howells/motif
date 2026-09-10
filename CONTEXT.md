# Motif

Motif is a public creative automation interface for fal.ai media endpoints, with a domain centered on structured generation workflows that agents and humans can inspect before spending credits.

## Language

**Series**: A reusable creative context for generating related images with shared style, tone, references, model defaults, and local output history. _Avoid_: Project, collection, album

**Series Run**: A finite batch of planned image generations created from one theme inside a **Series**. _Avoid_: Batch, multi-generate, campaign

**Reference**: A tagged source image attached to a **Series** to carry visual identity, style, character, location, or layout into future generations. _Avoid_: Edit image, sample, input image

**Theme**: The user's high-level creative brief for a **Series Run**. _Avoid_: Prompt, style prompt

**Scene Prompt**: The per-image creative instruction generated from a **Theme** or supplied by the user. _Avoid_: Prompt when referring only to one image inside a series

**Look**: A named house visual register - medium, finish, framing and exclusions - that Motif adds to a prompt, carrying its own default model and aspect ratio. _Avoid_: Style, preset, recipe

**Mood**: A named light condition added to a prompt alongside a photographic **Look**. _Avoid_: Lighting, atmosphere, style

## Relationships

- A **Series** contains zero or more **References**.
- A **Series** contains zero or more **Series Runs**.
- A **Series Run** contains one or more **Scene Prompts**.
- A **Scene Prompt** is generated within exactly one **Series Run** when the user asks for a themed set.
- A **Reference** can be reused by many **Series Runs** in the same **Series**.
- A generation uses at most one **Look** and at most one **Mood**.
- A **Mood** applies only to a photographic **Look**; flat **Looks** (scans, prints, paintings, studio objects) carry their own light and refuse a **Mood**.
- A **Series** can pin one **Look** and one **Mood**, which then apply to every generation in it.

## Example Dialogue

> **Dev:** "If the user asks for six brutalist architecture images, do we create six standalone generations?" **Domain expert:** "No. Create or reuse a **Series**, treat 'brutalist architecture' as the **Theme**, plan a **Series Run** with six **Scene Prompts**, and keep them visually consistent through shared style and selected **References**."

## Flagged Ambiguities

- "series generator" was used both for the existing persistent **Series** feature and for a new themed multi-image workflow; resolved: the new workflow is a **Series Run** inside a **Series**.
- "style" meant three things: a model's own style parameter, a **Series** style prompt, and the house visual register; resolved: the house register is a **Look**, and "style" is kept for the first two only.
