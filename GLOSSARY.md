# Motif

Motif is a creative automation interface for fal.ai media endpoints, built around structured generation workflows that agents and humans can inspect before spending credits.

## Language

**Task**: One job Motif does to or with an image, named for its outcome (erase, reframe, relight). Motif chooses the Model that performs it. _Avoid_: Function, capability, tool, job

**Model**: The provider endpoint that performs a Task. Motif chooses it; the user names one only to override that choice. _Avoid_: Tool, engine, endpoint

**Tier**: How far a Task trades cost and speed for quality: fast, balanced or quality. It moves Motif's choice along that Task's ranked Models. _Avoid_: Quality, mode, speed

**Source**: The image or video a Task changes, such as the photo erase works on. Generate makes a new image, so it has no Source. _Avoid_: Input, original

**Reference**: An image that guides a Task without being changed: tagged and attached to a Series, or passed with one request. _Avoid_: Edit image, sample, input image

**Series**: A reusable creative context for generating related images with shared style, tone, References and local output history. _Avoid_: Project, collection, album

**Series Run**: A finite batch of planned generations created from one Theme inside a Series. _Avoid_: Batch, campaign

**Theme**: The user's high-level creative brief for a Series Run. _Avoid_: Prompt, style prompt

**Scene Prompt**: The per-image instruction generated from a Theme or supplied by the user. _Avoid_: Prompt, when referring to one image inside a series

**Look**: A named house visual register (medium, finish, framing, exclusions) that Motif adds to a prompt, carrying its own default Model and aspect ratio. Only Motif defines Looks. _Avoid_: Style, preset, recipe

**Mood**: A named light condition, added alongside a photographic Look or applied to an existing image by relighting it. Flat Looks refuse a Mood. _Avoid_: Lighting, atmosphere

## Relationships

- Every Task ranks its Models; Motif uses the highest-ranked Model that can do what the request asks for at the chosen Tier. What the prompt says never affects the choice; whether there is a prompt, and any other option, can rule out a Model that cannot take it.
- An explicit Model overrides the ranking, and a Look's Model comes before the Task's ranking, so a Tier has no effect on a Look.
- A Series has no Model of its own, and can pin one Look and one Mood for every generation in it.
- Motif knows images, words and settings, never what product is in a picture. Whoever calls Motif keeps product identity, true size and samples.
