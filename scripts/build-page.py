#!/usr/bin/env python3
"""
Build the demonstration page from scripts/demo-manifest.json.

Every plate in the manifest becomes a catalogue entry: its source, its real
output, the argument for the tool as written in the manifest, the command that
produced it, and what it cost. Nothing here calls fal and nothing here spends.

Images are downscaled on the way in and inlined as data URIs, so the result is
one file you can send to somebody. Costs come from the CLI: the per-run figure
from ~/.motif/history.json where a plate recorded one, and the rate from the
tool registry via `motif tools --format json`. Neither is ever guessed.

    python3 scripts/build-page.py

Writes ~/Desktop/motif-seventy-one-endpoints.html and prints its size.
"""

import base64
import glob
import hashlib
import html
import io
import json
import os
import re
import subprocess
import sys
from datetime import datetime

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLES = os.path.join(ROOT, "docs/tools/examples")
CLI = os.path.join(ROOT, "apps/cli/dist/index.js")
HISTORY = os.path.expanduser("~/.motif/history.json")
TARGET = os.path.expanduser("~/Desktop/motif-seventy-one-endpoints.html")

MANIFEST = json.load(open(os.path.join(ROOT, "scripts/demo-manifest.json")))

# Long edge in pixels, then JPEG quality. Twenty-seven plates of full-resolution
# photography does not fit in one file, and none of it is being printed.
PAIR_EDGE, PAIR_Q = 1040, 80
TILE_EDGE, TILE_Q = 720, 78
MASK_EDGE, MASK_Q = 420, 72
CROP_SIDE, CROP_Q = 560, 88

# Patina returns its maps under one key, so the order is the registry's, not the
# filesystem's. Alphabetical would put height first and read as arbitrary.
PBR_ORDER = ["basecolor", "normal", "roughness", "metalness", "height"]


# ── Facts read from elsewhere ─────────────────────────────────────────────────


def registry():
    """Tool metadata straight from the CLI. Read-only; spends nothing."""
    if not os.path.exists(CLI):
        sys.exit("Build the CLI first: pnpm --filter @howells/motif-cli build")
    out = subprocess.run(
        ["node", CLI, "tools", "--format", "json"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return json.loads(out.stdout)["tools"]


def recorded_costs():
    """
    What each plate actually cost, from the CLI's own history.

    A zero is not a price. Metered runs recorded as costing zero before that bug
    was fixed, and printing $0.000 for a call that billed something is worse than
    printing nothing, so a zero is read here as an absent figure.
    """
    if not os.path.exists(HISTORY):
        return {}
    entries = json.load(open(HISTORY))["generations"]
    by_plate = {}
    for entry in entries:
        path = entry.get("output") or ""
        if EXAMPLES not in path:
            continue
        rest = path.split(EXAMPLES + "/", 1)[1]
        plate = rest.split("/")[0] if "/" in rest else None
        if plate is None:
            stem = os.path.splitext(rest)[0]
            plate = stem[4:] if stem.startswith("out-") else None
        if plate is None:
            continue
        stamp = entry.get("timestamp") or ""
        if plate not in by_plate or stamp >= by_plate[plate][0]:
            by_plate[plate] = (stamp, entry.get("cost"))
    return {p: c for p, (_, c) in by_plate.items() if isinstance(c, (int, float)) and c > 0}


def money(value):
    """Six decimals, trailing zeros trimmed. Floats carry noise; prices do not."""
    text = f"{value:.6f}".rstrip("0").rstrip(".")
    return f"${text}"


# ── Assets ────────────────────────────────────────────────────────────────────


def first(pattern):
    hits = sorted(glob.glob(os.path.join(EXAMPLES, pattern)))
    return hits[0] if hits else None


def source_path(source_id):
    entry = next(s for s in MANIFEST["sources"] if s["id"] == source_id)
    if "have" in entry:
        return os.path.join(ROOT, entry["have"])
    return first(f"source-{source_id}.*")


def input_path(demo):
    """
    What actually went in.

    A deliberately degraded input is the point of the plate, so where one exists
    it is the before, exactly as scripts/verify-demos.py measures it.
    """
    return first(f"derived-{demo['plate']}.*") or source_path(demo["source"])


def output_path(demo):
    plate = demo["plate"]
    if demo.get("json"):
        return first(f"out-{plate}.json")
    if demo.get("dir"):
        return os.path.join(EXAMPLES, plate)
    return first(f"out-{plate}.*")


def relative(path):
    return os.path.relpath(path, ROOT)


def natural(path):
    """
    Sort keys that put -2 before -10, which lexical order does not, and the
    unsuffixed member of a run first, because that is the base plate every other
    file in the run is a piece of.
    """
    name = os.path.basename(path)
    parts = re.split(r"(\d+)", name)
    return (len(parts) > 1, [int(p) if p.isdigit() else p for p in parts])


def directory_files(plate):
    """
    The distinct files in a directory output, in an order that means something.

    Seedream writes each layer twice under two names; identical bytes are shown
    once. Patina's five maps are ordered as the registry orders them.
    """
    paths = sorted(glob.glob(os.path.join(EXAMPLES, plate, "*")), key=natural)
    kept, unique = {}, []
    for path in paths:
        digest = hashlib.md5(open(path, "rb").read()).hexdigest()
        if digest not in kept:
            kept[digest] = len(unique)
            unique.append(path)
            continue
        # Seedream writes every layer twice, once under fal's generic `images`
        # key and once as `layers`. Same bytes; only one of the two names says
        # what the file is.
        if os.path.basename(unique[kept[digest]]).startswith("images"):
            unique[kept[digest]] = path
    if plate == "pbr":
        unique.sort(key=lambda p: PBR_ORDER.index(os.path.splitext(os.path.basename(p))[0])
                    if os.path.splitext(os.path.basename(p))[0] in PBR_ORDER else 99)
    return unique


# ── Encoding ──────────────────────────────────────────────────────────────────

CHEQUER = None


def chequer_tile():
    global CHEQUER
    if CHEQUER is None:
        tile = Image.new("RGB", (24, 24), (228, 226, 219))
        for x in range(12):
            for y in range(12):
                tile.putpixel((x, y), (206, 204, 196))
                tile.putpixel((x + 12, y + 12), (206, 204, 196))
        CHEQUER = tile
    return CHEQUER


def flatten(im):
    """Transparency shown the way every image editor shows it, and said so in the caption."""
    if im.mode not in ("RGBA", "LA", "P"):
        return im.convert("RGB"), False
    rgba = im.convert("RGBA")
    low, high = rgba.getchannel("A").getextrema()
    if low == 255:
        return rgba.convert("RGB"), False
    tile = chequer_tile()
    ground = Image.new("RGB", rgba.size)
    for x in range(0, rgba.width, tile.width):
        for y in range(0, rgba.height, tile.height):
            ground.paste(tile, (x, y))
    ground.paste(rgba, (0, 0), rgba)
    return ground, True


def encode(path, edge, quality):
    """Downscale, flatten, inline. Returns the tag data a figure needs."""
    im = Image.open(path)
    im, transparent = flatten(im)
    im.thumbnail((edge, edge), Image.LANCZOS)
    buffer = io.BytesIO()
    im.save(buffer, "JPEG", quality=quality, optimize=True, progressive=True)
    raw = buffer.getvalue()
    return {
        "uri": "data:image/jpeg;base64," + base64.b64encode(raw).decode(),
        "w": im.width,
        "h": im.height,
        "bytes": len(raw),
        "transparent": transparent,
    }


def encode_svg(path):
    raw = open(path, "rb").read()
    return {
        "uri": "data:image/svg+xml;base64," + base64.b64encode(raw).decode(),
        "w": 0,
        "h": 0,
        "bytes": len(raw),
        "transparent": False,
    }


def detail_box(im, side):
    """
    Where the detail is.

    A centre crop of a still life is often a wall. The window with the highest
    edge variance is the one where a restoration tool has something to show, and
    picking it by measurement rather than by eye keeps the page reproducible.
    """
    grey = im.convert("L")
    best, box = -1.0, (0, 0)
    steps = 6
    span_x = max(grey.width - side, 0)
    span_y = max(grey.height - side, 0)
    for ix in range(steps):
        for iy in range(steps):
            left = span_x * ix // max(steps - 1, 1)
            top = span_y * iy // max(steps - 1, 1)
            tile = grey.crop((left, top, left + side, top + side)).resize((96, 96))
            lap = tile.filter(ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], 1, 128))
            values = list(lap.getdata())  # noqa: pillow 14 renames this to get_flattened_data
            mean = sum(values) / len(values)
            score = sum((v - mean) ** 2 for v in values) / len(values)
            if score > best:
                best, box = score, (left, top)
    return box


def encode_crop_pair(before_path, after_path):
    """The same region of both frames, each at its own pixel scale."""
    after = Image.open(after_path).convert("RGB")
    before = Image.open(before_path).convert("RGB")
    side = min(CROP_SIDE, after.width, after.height)
    left, top = detail_box(after, side)
    fx, fy = left / after.width, top / after.height
    fs = side / after.width

    b_side = max(int(round(fs * before.width)), 16)
    b_left = min(int(round(fx * before.width)), max(before.width - b_side, 0))
    b_top = min(int(round(fy * before.height)), max(before.height - b_side, 0))

    out = []
    for im, box in (
        (before, (b_left, b_top, b_left + b_side, b_top + b_side)),
        (after, (left, top, left + side, top + side)),
    ):
        crop = im.crop(box)
        buffer = io.BytesIO()
        crop.save(buffer, "JPEG", quality=CROP_Q, optimize=True, progressive=True)
        raw = buffer.getvalue()
        out.append({
            "uri": "data:image/jpeg;base64," + base64.b64encode(raw).decode(),
            "w": crop.width,
            "h": crop.height,
            "bytes": len(raw),
            "transparent": False,
        })
    return out


# ── Markup ────────────────────────────────────────────────────────────────────

FIGURES = []


def esc(text):
    return html.escape(str(text), quote=True)


def figure(asset, caption, extra=""):
    FIGURES.append(asset)
    note = " <span class=\"alpha\">chequer is transparency</span>" if asset["transparent"] else ""
    size = f' width="{asset["w"]}" height="{asset["h"]}"' if asset["w"] else ""
    return (
        f'<figure class="{extra}">'
        f'<img src="{asset["uri"]}"{size} alt="{esc(caption)}" loading="lazy">'
        f"<figcaption>{esc(caption)}{note}</figcaption></figure>"
    )


def command_for(demo):
    """The command scripts/run-demos.mjs issues, with paths relative to the repo root."""
    parts = ["motif", "tool", "run", demo["tool"]]
    parts += ["--inputs" if demo.get("inputs") else "-i", relative(input_path(demo))]
    if not demo.get("json"):
        target = output_path(demo)
        parts += ["-o", relative(target) + ("/" if demo.get("dir") else "")]
    if demo.get("opts"):
        parts += ["--json", "'" + json.dumps(demo["opts"], separators=(",", ": ")) + "'"]
    return " ".join(parts)


JSON_KEY = re.compile(r'(&quot;[^&]*?&quot;)(\s*:)')
JSON_STR = re.compile(r'(:\s*)(&quot;.*?&quot;)')
JSON_NUM = re.compile(r'(:\s*)(-?\d+\.?\d*)')
JSON_LIT = re.compile(r'(:\s*)(true|false|null)')


def json_block(path):
    payload = json.load(open(path))
    text = esc(json.dumps(payload, indent=2))
    text = JSON_KEY.sub(r'<span class="k">\1</span>\2', text)
    text = JSON_STR.sub(r'\1<span class="s">\2</span>', text)
    text = JSON_NUM.sub(r'\1<span class="n">\2</span>', text)
    text = JSON_LIT.sub(r'\1<span class="n">\2</span>', text)
    return f'<pre class="data" tabindex="0"><code>{text}</code></pre>'


def cost_line(demo, prices, rates):
    plate = demo["plate"]
    rate = rates.get(demo["tool"], {}).get("pricing")
    bits = []
    if plate in prices:
        bits.append(f'<b>{money(prices[plate])}</b> this run')
    else:
        bits.append('<em>this run not recorded</em>')
    if rate:
        bits.append(f"<span>{esc(rate)}</span>")
    return '<p class="cost">' + " &middot; ".join(bits) + "</p>"


def set_aspect(shapes):
    """
    One box shape for a whole set of outputs.

    Where the members agree, the box is their shape and nothing is letterboxed.
    Where they disagree - a decomposed scene returns tall bottles and a wide
    room - no shared shape suits any of them, so a square treats them equally.
    """
    if max(shapes) / min(shapes) > 1.5:
        return 1.0
    return sorted(shapes)[len(shapes) // 2]


def media_for(demo, number):
    """The artefact, shown as whatever kind of thing the tool returns."""
    plate = demo["plate"]
    src = input_path(demo)
    out = output_path(demo)
    wide = False
    note = ""

    if demo.get("json"):
        body = (
            '<div class="media split">'
            + figure(encode(src, TILE_EDGE, TILE_Q), f"in · {os.path.basename(src)}")
            + '<figure class="artefact">'
            + json_block(out)
            + f"<figcaption>out · {esc(os.path.basename(out))}</figcaption></figure>"
            + "</div>"
        )
        return body, note, wide

    if demo.get("crop"):
        wide = True
        before, after = encode_crop_pair(src, out)
        body = (
            '<div class="media pair">'
            + figure(encode(src, PAIR_EDGE, PAIR_Q), f"in \u00b7 {os.path.basename(src)}")
            + figure(encode(out, PAIR_EDGE, PAIR_Q), f"out \u00b7 {os.path.basename(out)}")
            + "</div>"
            + '<div class="media pair crops">'
            + figure(before, f"before \u00b7 {before['w']}\u00d7{before['h']} of the frame")
            + figure(after, f"after \u00b7 {after['w']}\u00d7{after['h']} of the frame")
            + "</div>"
        )
        note = (
            "The two whole frames read alike at page width. The magnified pair is the same "
            "region of each, cut out at its own pixel scale and shown at one size. The before "
            "holds fewer pixels for that region, so it is the enlargement you would otherwise "
            "be judging."
        )
        return body, note, wide

    if demo.get("dir"):
        wide = True
        source = encode(src, TILE_EDGE, TILE_Q)
        tiles = [figure(source, f"in \u00b7 {os.path.basename(src)}")]
        shapes = [source["w"] / source["h"]]
        for path in directory_files(plate):
            name = os.path.basename(path)
            if path.endswith((".glb", ".ply", ".zip")):
                size = os.path.getsize(path)
                tiles.append(
                    '<figure class="artefact"><div class="filecard">'
                    f'<span class="ext">{esc(os.path.splitext(name)[1].lstrip("."))}</span>'
                    f'<span class="fsize">{size / 1_048_576:.1f} MB</span></div>'
                    f"<figcaption>{esc(name)}</figcaption></figure>"
                )
                note = (
                    "The output is geometry, not a picture. There is nothing to reproduce here "
                    "that would not be a render of it, so the file is listed rather than shown."
                )
                continue
            edge, quality = (MASK_EDGE, MASK_Q) if "individual_mask" in name else (TILE_EDGE, TILE_Q)
            asset = encode(path, edge, quality)
            shapes.append(asset["w"] / asset["h"])
            tiles.append(figure(asset, name))
        cols = next((c for c in range(7, 1, -1) if len(tiles) % c == 0), min(len(tiles), 6))
        return (
            f'<div class="media set" style="--cols:{cols};--ar:{set_aspect(shapes):.3f}">'
            + "".join(tiles)
            + "</div>",
            note,
            wide,
        )

    if demo.get("svg"):
        markup = open(out).read()
        elements = re.findall(r"<path[^>]*/>", markup)
        # The first path is the background rectangle. The second is drawn artwork,
        # which is the one worth showing as evidence that these really are paths.
        excerpt = elements[1] if len(elements) > 1 else elements[0]
        body = (
            '<div class="media pair">'
            + figure(encode(src, PAIR_EDGE, PAIR_Q), f"in \u00b7 {os.path.basename(src)}")
            + figure(encode_svg(out), f"out \u00b7 {os.path.basename(out)}, {len(elements)} paths")
            + "</div>"
            + f'<pre class="data wide" tabindex="0"><code>{esc(excerpt[:520])}'
            + ("\u2026" if len(excerpt) > 520 else "")
            + "</code></pre>"
        )
        note = (
            f"One of the {len(elements)} paths, as it comes back. The whole file is "
            f"{os.path.getsize(out) / 1024:.1f} kB and it is the file itself rendering above, "
            "not a picture of it."
        )
        return body, note, wide

    body = (
        '<div class="media pair">'
        + figure(encode(src, PAIR_EDGE, PAIR_Q), f"in \u00b7 {os.path.basename(src)}")
        + figure(encode(out, PAIR_EDGE, PAIR_Q), f"out \u00b7 {os.path.basename(out)}")
        + "</div>"
    )
    return body, note, wide


def is_wide(demo):
    """A set of outputs, a magnified pair or a path dump needs the full measure."""
    return bool(demo.get("dir") or demo.get("crop") or demo.get("svg"))


def widths(demos):
    """
    Which entries take a full row.

    The grid is two columns at page width, so an odd run of half-width entries
    leaves one stranded beside a gap. Stretching the stranded one reads as a
    decision rather than as a hole.
    """
    wide = [is_wide(d) for d in demos]
    run = []
    for index, full in enumerate(wide + [True]):
        if not full:
            run.append(index)
            continue
        if len(run) % 2 == 1:
            wide[run[-1]] = True
        run = []
    return wide


def entry(demo, number, prices, rates, force_wide=False):
    body, note, wide = media_for(demo, number)
    wide = wide or force_wide
    meta = rates.get(demo["tool"], {})
    return f"""<article class="entry{' wide' if wide else ''}" id="p-{esc(demo['plate'])}">
  {body}
  <div class="entry-text">
    <p class="entry-top"><span class="entry-no">{number:02d}</span>
      <span class="entry-tool">{esc(demo['tool'])}</span>
      <span class="entry-name">{esc(meta.get('name', ''))}</span></p>
    <h3>{esc(demo['title'])}</h3>
    <p class="why">{esc(demo['why'])}</p>
    {f'<p class="note">{esc(note)}</p>' if note else ''}
    <pre class="cmd"><code>{esc(command_for(demo))}</code></pre>
    {cost_line(demo, prices, rates)}
  </div>
</article>"""


# ── Page ──────────────────────────────────────────────────────────────────────

STYLE = """
:root {
  --ground: #f1f0ec;
  --plate: #fbfaf7;
  --ink: #1f1e1a;
  --muted: #6c6960;
  --rule: #d8d5cd;
  --accent: #5e6440;
  --accent-soft: #eceedf;
  --shadow: 0 1px 2px rgba(31, 30, 26, .05), 0 8px 24px rgba(31, 30, 26, .06);
  --sans: "Schibsted Grotesk", ui-sans-serif, system-ui, -apple-system, sans-serif;
  --mono: "Spline Sans Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --bar: rgba(241, 240, 236, .88);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --ground: #171714;
    --plate: #201f1c;
    --ink: #edebe5;
    --muted: #948f84;
    --rule: #33322c;
    --accent: #a6ac79;
    --accent-soft: #262820;
    --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 8px 24px rgba(0, 0, 0, .35);
    --bar: rgba(23, 23, 20, .88);
  }
}
:root[data-theme="dark"] {
  --ground: #171714;
  --plate: #201f1c;
  --ink: #edebe5;
  --muted: #948f84;
  --rule: #33322c;
  --accent: #a6ac79;
  --accent-soft: #262820;
  --shadow: 0 1px 2px rgba(0, 0, 0, .3), 0 8px 24px rgba(0, 0, 0, .35);
  --bar: rgba(23, 23, 20, .88);
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 72px; }
body {
  margin: 0;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 17px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 1180px; margin: 0 auto; padding: 0 clamp(20px, 5vw, 64px); }

/* ── Masthead ─────────────────────────────────────────── */
.masthead { padding: clamp(56px, 12vw, 128px) 0 clamp(36px, 6vw, 64px); }
.eyebrow {
  font-family: var(--mono); font-size: 12px; letter-spacing: .16em;
  text-transform: uppercase; color: var(--accent); margin: 0 0 28px;
}
.masthead h1 {
  font-size: clamp(40px, 8vw, 82px); line-height: 1.02; letter-spacing: -.035em;
  font-weight: 700; margin: 0 0 24px; text-wrap: balance; max-width: 15ch;
}
.masthead .lede {
  font-size: clamp(18px, 2.4vw, 22px); line-height: 1.5; color: var(--muted);
  margin: 0; max-width: 56ch;
}

.tally {
  display: grid; gap: 1px; background: var(--rule);
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  border: 1px solid var(--rule); margin: clamp(40px, 7vw, 64px) 0 0;
}
.tally div { background: var(--ground); padding: 20px 22px; }
.tally dt {
  font-family: var(--mono); font-size: 11px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--muted); margin: 0 0 8px;
}
.tally dd {
  margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -.03em;
  font-variant-numeric: tabular-nums;
}
.tally dd span { font-size: 15px; font-weight: 400; color: var(--muted); letter-spacing: 0; }

/* ── Navigation ───────────────────────────────────────── */
.bar {
  position: sticky; top: 0; z-index: 20;
  background: var(--bar); backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--rule);
}
/* Nine titles do not fit the text column, so the bar takes the full measure and
   scrolls below the width where they do. The fade is there so a cut-off title
   reads as more to come rather than as a clipped word. */
.bar nav {
  margin: 0 auto; padding: 11px clamp(20px, 5vw, 64px);
  display: flex; gap: clamp(12px, 1.4vw, 18px);
  overflow-x: auto; scrollbar-width: none;
}
@media (max-width: 1420px) {
  .bar nav { mask-image: linear-gradient(to right, #000 calc(100% - 40px), transparent); }
}
.bar nav::-webkit-scrollbar { display: none; }
.bar a {
  color: var(--muted); text-decoration: none; font-size: 12px; white-space: nowrap;
  display: flex; gap: 6px; align-items: baseline;
}
.bar a i {
  font-family: var(--mono); font-style: normal; font-size: 10px;
  letter-spacing: .06em; color: var(--accent);
}
.bar a:hover { color: var(--ink); }

.contents { border-top: 1px solid var(--rule); padding: clamp(32px, 5vw, 56px) 0; }
.contents ol {
  list-style: none; margin: 0; padding: 0;
  display: grid; gap: 1px; background: var(--rule);
  border: 1px solid var(--rule);
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
.contents li { background: var(--ground); padding: 20px 22px; }
.contents a { text-decoration: none; color: inherit; display: block; }
.contents a:hover h2 { color: var(--accent); }
.contents .num {
  font-family: var(--mono); font-size: 10.5px; letter-spacing: .16em;
  text-transform: uppercase; color: var(--accent);
  display: flex; justify-content: space-between; margin-bottom: 10px;
}
.contents h2 {
  font-size: 19px; font-weight: 700; letter-spacing: -.02em; margin: 0 0 6px;
}
.contents p { margin: 0; color: var(--muted); font-size: 14.5px; line-height: 1.5; }

/* ── Sections ─────────────────────────────────────────── */
.section { padding: clamp(48px, 8vw, 88px) 0 0; border-top: 1px solid var(--rule); }
.section-head { max-width: 62ch; margin-bottom: clamp(28px, 4vw, 40px); }
.section-no {
  font-family: var(--mono); font-size: 11px; letter-spacing: .18em;
  text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 14px;
}
.section-head h2 {
  font-size: clamp(28px, 4.4vw, 44px); line-height: 1.1; letter-spacing: -.03em;
  font-weight: 700; margin: 0 0 14px; text-wrap: balance;
}
.standfirst { font-size: clamp(17px, 2vw, 19px); color: var(--muted); margin: 0; }

.entries {
  display: grid; gap: clamp(16px, 2vw, 22px);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
  padding-bottom: clamp(40px, 6vw, 68px);
}

/* ── Catalogue entry ──────────────────────────────────── */
.entry {
  background: var(--plate); border: 1px solid var(--rule);
  display: flex; flex-direction: column;
}
.entry.wide { grid-column: 1 / -1; }
.entry-text { padding: 20px clamp(18px, 2.4vw, 26px) 22px; }
.entry-top {
  display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap;
  font-family: var(--mono); font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; margin: 0 0 12px;
}
.entry-no { color: var(--ink); font-weight: 500; }
.entry-tool { color: var(--accent); letter-spacing: .06em; text-transform: none; font-size: 12px; }
.entry-name { color: var(--muted); letter-spacing: .06em; text-transform: none; font-size: 12px; }
.entry h3 {
  font-size: clamp(20px, 2.3vw, 24px); line-height: 1.2; letter-spacing: -.022em;
  font-weight: 700; margin: 0 0 10px; text-wrap: balance;
}
.entry .why { margin: 0; color: var(--muted); font-size: 16px; max-width: 62ch; }
.entry .note {
  margin: 14px 0 0; padding-left: 14px; border-left: 2px solid var(--accent);
  color: var(--muted); font-size: 14.5px; line-height: 1.55; max-width: 62ch;
}

/* ── Media ────────────────────────────────────────────── */
.media { display: grid; gap: 1px; background: var(--rule); border-bottom: 1px solid var(--rule); }
.media.pair { grid-template-columns: 1fr 1fr; }
/* Both cells shrink to their content, so the gap-as-background trick would
   leave a rule-coloured void under the shorter one. */
.media.split {
  grid-template-columns: minmax(0, 4fr) minmax(0, 5fr);
  align-items: start; gap: 0; background: var(--ground);
}
.media.split figcaption { margin-top: 8px; }
.media.split > .artefact { border-left: 1px solid var(--rule); padding: 0; }
.media.split > .artefact figcaption { padding: 9px 18px 12px; }
/* The gap is the container showing through, so a part-filled last row reads as
   a grey slab. Each set is given a column count that divides its own length. */
.media.set { grid-template-columns: repeat(var(--cols, 6), minmax(0, 1fr)); }
.media.set img, .media.set .filecard { aspect-ratio: var(--ar, 1); object-fit: contain; }
.media.crops { grid-template-columns: 1fr 1fr; border-top: 1px solid var(--rule); }
.media figure {
  margin: 0; background: var(--ground); padding: 14px 14px 0;
  display: flex; flex-direction: column;
}
.media img {
  display: block; width: 100%; height: auto; object-fit: contain;
}
pre.data.wide {
  border-bottom: 1px solid var(--rule); white-space: pre-wrap; overflow-wrap: anywhere;
}
figcaption {
  font-family: var(--mono); font-size: 10.5px; line-height: 1.5;
  color: var(--muted); padding: 9px 0 12px; margin-top: auto;
  overflow-wrap: anywhere;
}
figcaption .alpha { color: var(--accent); }

.filecard {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 6px;
  background: var(--accent-soft); border: 1px dashed var(--rule);
}
.filecard .ext {
  font-family: var(--mono); font-size: 22px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--accent); font-weight: 500;
}
.filecard .fsize { font-family: var(--mono); font-size: 12px; color: var(--muted); }

pre.data {
  margin: 0; background: var(--ground); padding: 16px 18px;
  font-family: var(--mono); font-size: 11.5px; line-height: 1.6;
  color: var(--muted); overflow: auto; max-height: 460px;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
pre.data code { background: none; padding: 0; }
pre.data .k { color: var(--ink); }
pre.data .s { color: var(--accent); }
pre.data .n { color: var(--ink); }

code {
  font-family: var(--mono); font-size: .88em;
  background: var(--accent-soft); padding: .12em .38em; border-radius: 2px;
}
pre.cmd {
  font-family: var(--mono); font-size: 12px; line-height: 1.65;
  background: var(--ground); border: 1px solid var(--rule);
  padding: 12px 16px; margin: 18px 0 0; overflow-x: auto;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
pre.cmd code { background: none; padding: 0; }
pre.cmd code::before { content: "$ "; color: var(--accent); }

.cost {
  margin: 12px 0 0; font-family: var(--mono); font-size: 11.5px;
  color: var(--muted); letter-spacing: .01em;
}
.cost b { color: var(--ink); font-weight: 500; font-variant-numeric: tabular-nums; }
.cost em { font-style: normal; }

/* ── Reference ────────────────────────────────────────── */
.ref { padding: clamp(48px, 9vw, 96px) 0; border-top: 1px solid var(--rule); }
.ref h2 {
  font-size: clamp(24px, 3.4vw, 34px); letter-spacing: -.028em; font-weight: 700;
  margin: 0 0 10px;
}
.ref .standfirst { margin-bottom: 32px; max-width: 62ch; }
.tablewrap { overflow-x: auto; border: 1px solid var(--rule); }
table { border-collapse: collapse; width: 100%; min-width: 620px; background: var(--plate); }
th, td { text-align: left; padding: 13px 18px; border-bottom: 1px solid var(--rule); }
tbody tr:last-child td { border-bottom: none; }
th {
  font-family: var(--mono); font-size: 11px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--muted); font-weight: 500;
}
td:first-child { font-family: var(--mono); font-size: 13px; color: var(--accent); white-space: nowrap; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--muted); }

.findings { display: grid; gap: 1px; background: var(--rule); border: 1px solid var(--rule); margin-top: 12px; }
.finding { background: var(--plate); padding: 22px clamp(18px, 3vw, 28px); }
.finding h3 { font-size: 17px; font-weight: 700; margin: 0 0 8px; letter-spacing: -.01em; }
.finding p { margin: 0; color: var(--muted); font-size: 16px; }
.finding .factor {
  font-family: var(--mono); font-size: 11px; letter-spacing: .14em;
  text-transform: uppercase; color: var(--accent); display: block; margin-bottom: 10px;
}

footer {
  border-top: 1px solid var(--rule); padding: 40px 0 72px;
  font-family: var(--mono); font-size: 12px; line-height: 1.8; color: var(--muted);
}
@media (max-width: 720px) {
  .media.split { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  * { animation: none !important; transition: none !important; }
}
"""

VERBS = """  <section class="ref">
    <h2>The seven verbs</h2>
    <p class="standfirst">Everything else stays reachable through <code>motif tool run</code>.
      These are the ones that earned a word of their own.</p>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Command</th><th>Does</th><th>Behind it</th><th>Cost</th></tr></thead>
        <tbody>
          <tr><td>motif segment</td><td>Mask an object named in a phrase</td><td>sam3-image</td><td class="num">$0.005</td></tr>
          <tr><td>motif ask</td><td>Question, caption, detect or point</td><td>moondream 3</td><td class="num">metered</td></tr>
          <tr><td>motif erase</td><td>Remove a prompted object</td><td>object-removal</td><td class="num">$0.024</td></tr>
          <tr><td>motif reframe</td><td>Change ratio without regenerating</td><td>ideogram-reframe</td><td class="num">$0.06</td></tr>
          <tr><td>motif enhance</td><td>Restore, denoise, sharpen, upscale</td><td>topaz &times;8</td><td class="num">per 24MP</td></tr>
          <tr><td>motif layers</td><td>Decompose into editable layers</td><td>qwen-layered</td><td class="num">metered</td></tr>
          <tr><td>motif vectorize</td><td>Raster to SVG</td><td>recraft-vectorize</td><td class="num">$0.04</td></tr>
        </tbody>
      </table>
    </div>
  </section>"""

BUGS = """  <section class="ref">
    <h2>Thirteen bugs, none of them a crash</h2>
    <p class="standfirst">Every defect found building this was a confidently wrong value while
      the tests stayed green. Nine were fixed before release and four after, once an
      adversarial pass went looking specifically for numbers that lie.</p>
    <div class="findings">
      <div class="finding">
        <span class="factor">33&times; over</span>
        <h3>A price that would refuse a job costing 26p</h3>
        <p>Video background removal was encoded at $0.14 a second against a real $0.00425. An
          agent budgeting a sixty-second clip computed &pound;8.40. Two more prices contradicted
          fal outright, and two were simply wrong on re-sourcing.</p>
      </div>
      <div class="finding">
        <span class="factor">Root cause</span>
        <h3>One fact, two hand-maintained copies</h3>
        <p>Prices lived twice: as prose for humans and as a number for agents. They drifted.
          Both are now generated from fal's own billing record through a single table, so they
          cannot disagree again.</p>
      </div>
      <div class="finding">
        <span class="factor">Sandbox</span>
        <h3>Directories escaped a check that files passed</h3>
        <p>Output paths are meant to stay inside the working directory. The file branch
          validated; the directory branch did not, so <code>-o /anywhere/</code> wrote wherever
          it liked while the same path as a file was correctly refused.</p>
      </div>
      <div class="finding">
        <span class="factor">2:3 vs 3:4</span>
        <h3>Reframe reported one ratio and requested another</h3>
        <p>A cover preset's 2:3 passed through a bucket that rounds it to 3:4. The output said
          2:3. For a generate call that bucket is a fair approximation of an intent; for reframe
          the ratio is the entire deliverable.</p>
      </div>
      <div class="finding">
        <span class="factor">$0.00196</span>
        <h3>A cost that was knowable all along</h3>
        <p>Metered runs recorded as costing zero, so history under-reported spend. The fix was
          not to mark them unknown: a per-megapixel rate cannot be projected before a call but
          resolves exactly afterwards, because the output has been written and measured. A
          1400&times;1400 result at $0.001 per megapixel now records $0.00196, to the penny.
          Only genuinely metered endpoints stay null, and null never prints as $0.000.</p>
      </div>
      <div class="finding">
        <span class="factor">Silently</span>
        <h3>Half of layerize never downloaded</h3>
        <p>The layers arrive nested one level deeper than the previews, and the URL collector
          only looked at the top level. Ten files come down now where five did, and the five
          missing were the half carrying the names, z-order and coordinates. Those names now
          become the filenames.</p>
      </div>
      <div class="finding">
        <span class="factor">Two vendors</span>
        <h3>A price that was right about the wrong question</h3>
        <p>Each model carried a benchmark price alongside fal's. Both were correct - one is
          what the model's own vendor charges, one is what fal charges - but sitting unlabelled
          in the same object, anything reading a model for cost could take the wrong one. Reve
          read five times its real price. The guard that replaced it is structural: no
          price-shaped field may live inside a benchmark block at all.</p>
      </div>
      <div class="finding">
        <span class="factor">Guards</span>
        <h3>Two checks that cost nothing to run</h3>
        <p>A drift canary tests every registry entry's output keys against fal's live schema,
          and a schema tool prints any endpoint's real inputs, outputs and price. Both read
          published documents; neither runs a model or spends a penny.</p>
      </div>
    </div>
  </section>"""


def build():
    rates = registry()
    prices = recorded_costs()

    order = [s["id"] for s in MANIFEST["sections"]]
    by_section = {sid: [d for d in MANIFEST["demos"] if d["section"] == sid] for sid in order}
    missing = [d["plate"] for d in MANIFEST["demos"] if d["section"] not in by_section]
    if missing:
        sys.exit(f"plates in an unknown section: {', '.join(missing)}")

    number = 0
    sections_html = []
    for index, meta in enumerate(MANIFEST["sections"], start=1):
        demos = by_section[meta["id"]]
        entries = []
        for demo, full in zip(demos, widths(demos)):
            number += 1
            entries.append(entry(demo, number, prices, rates, force_wide=full))
        sections_html.append(f"""<section class="section" id="s-{esc(meta['id'])}">
  <header class="section-head">
    <span class="section-no">Section {index:02d} &mdash; {len(demos)} plates</span>
    <h2>{esc(meta['title'])}</h2>
    <p class="standfirst">{esc(meta['standfirst'])}</p>
  </header>
  <div class="entries">
{chr(10).join(entries)}
  </div>
</section>""")

    nav = "".join(
        f'<a href="#s-{esc(s["id"])}"><i>{i:02d}</i>{esc(s["title"])}</a>'
        for i, s in enumerate(MANIFEST["sections"], start=1)
    )
    contents = "".join(
        f'<li><a href="#s-{esc(s["id"])}">'
        f'<span class="num"><span>Section {i:02d}</span>'
        f'<span>{len(by_section[s["id"]])} plates</span></span>'
        f'<h2>{esc(s["title"])}</h2><p>{esc(s["standfirst"])}</p></a></li>'
        for i, s in enumerate(MANIFEST["sections"], start=1)
    )

    spend = sum(prices.get(d["plate"], 0) for d in MANIFEST["demos"])
    recorded = sum(1 for d in MANIFEST["demos"] if d["plate"] in prices)

    page = f"""<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Seventy-One Endpoints</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;700&family=Spline+Sans+Mono:wght@400;500&display=swap">
<style>{STYLE}</style>
</head>
<body>
<div class="wrap">
  <header class="masthead">
    <p class="eyebrow">Motif &middot; non-generation tooling</p>
    <h1>Seventy-one endpoints</h1>
    <p class="lede">fal hosts around two hundred image endpoints that make nothing new: they
      read, cut, repair, decompose and measure. Motif wrapped almost none of them. This is what
      it wraps now, shown against real output rather than described.</p>
    <dl class="tally">
      <div><dt>Registry</dt><dd>{len(rates)} <span>was 22</span></dd></div>
      <div><dt>Promoted verbs</dt><dd>7</dd></div>
      <div><dt>MCP tools</dt><dd>10 <span>was 5</span></dd></div>
      <div><dt>Plates shown</dt><dd>{len(MANIFEST['demos'])} <span>in {len(MANIFEST['sections'])} sections</span></dd></div>
      <div><dt>Recorded spend</dt><dd>${spend:.2f} <span>{recorded} of {len(MANIFEST['demos'])}</span></dd></div>
    </dl>
  </header>
</div>

<div class="bar"><nav>{nav}</nav></div>

<div class="wrap">
  <section class="contents">
    <ol>{contents}</ol>
  </section>

{chr(10).join(sections_html)}

{VERBS}

{BUGS}

  <footer>
    <div>@howells/motif-sdk 1.2.0 &middot; @howells/motif-cli 1.9.0 &middot; @howells/motif-mcp 0.4.0</div>
    <div>Every plate produced through the CLI against the source beside it, and checked by
      scripts/verify-demos.py to have measurably changed the picture. Source photography made
      for this page. Prices are the registry's; per-run figures are the CLI's own history.</div>
    <div>Built {datetime.now().strftime('%-d %B %Y')} from scripts/demo-manifest.json.</div>
  </footer>
</div>
</body>
</html>
"""

    open(TARGET, "w").write(page)
    size = os.path.getsize(TARGET)
    print(f"{TARGET}")
    print(f"  {len(MANIFEST['sections'])} sections, {len(MANIFEST['demos'])} plates, "
          f"{len(FIGURES)} images")
    print(f"  {size / 1_048_576:.2f} MB")
    print(f"  {money(spend)} recorded across {recorded} plates")
    if size > 12 * 1_048_576:
        sys.exit("over the 12MB budget")


if __name__ == "__main__":
    build()
