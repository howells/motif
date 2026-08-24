#!/usr/bin/env python3
"""
Check that every demonstration actually demonstrates something.

The failure this exists to prevent: running a restoration tool on a clean image,
looking at the two pictures separately, and describing a difference that is not
there. Measured, a Topaz restore of an already-sharp render moved edge variance
by 8% - noise - while the page claimed recovered detail.

So each demo declares what should change and in which direction, and this
asserts it. A demo that cannot show its effect is a demo that should not ship,
or should ship at a magnification where the effect is real.

    python3 scripts/verify-demos.py            # check everything produced so far
    python3 scripts/verify-demos.py --json     # machine-readable

Reads only. Spends nothing.
"""

import glob
import json
import os
import statistics
import sys

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXAMPLES = os.path.join(ROOT, "docs/tools/examples")
MANIFEST = json.load(open(os.path.join(ROOT, "scripts/demo-manifest.json")))

# What each demo must change, and which way. "differs" is the weak claim - the
# output is not substantially the same picture - and is the floor for anything
# whose effect is structural rather than measurable in one number.
EXPECT = {
    "colourise": ("saturation up", lambda a, b: b["sat"] > a["sat"] * 3),
    # Measured natively, not from the thumbnail - see native_noise.
    "denoise": ("noise down", lambda a, b: b["noise"] < a["noise"] * 0.7),
    "upscale": ("more pixels", lambda a, b: b["px"] > a["px"] * 1.5),
    "rmbg": ("alpha present", lambda a, b: b["alpha"] > 0.05),
    "depth": ("differs", lambda a, b: b["diff"] > 0.15),
    "pose": ("differs", lambda a, b: b["diff"] > 0.15),
    "lineart": ("differs", lambda a, b: b["diff"] > 0.15),
    "normals": ("differs", lambda a, b: b["diff"] > 0.15),
    "unlight": ("differs", lambda a, b: b["diff"] > 0.04),
    "relight": ("differs", lambda a, b: b["diff"] > 0.04),
    # Localised by definition: judge the most-changed tile, not the frame.
    "erase-cheap": ("local change", lambda a, b: b["peak"] > 0.04),
    "erase-good": ("local change", lambda a, b: b["peak"] > 0.04),
    "text-removal": ("local change", lambda a, b: b["peak"] > 0.04),
    "layers-type": ("local change", lambda a, b: b["peak"] > 0.04),
    "expand": ("aspect changed", lambda a, b: abs(b["ar"] - a["ar"]) > 0.05),
    "reframe": ("aspect changed", lambda a, b: abs(b["ar"] - a["ar"]) > 0.05),
    "tiling": ("differs", lambda a, b: b["diff"] > 0.05),
    "colourise_": (None, None),
}


def stats(path):
    im = Image.open(path)
    alpha = 0.0
    if im.mode in ("RGBA", "LA"):
        a = im.getchannel("A").resize((120, 120))
        data = list(a.getdata())
        alpha = sum(1 for v in data if v < 250) / len(data)
    rgb = im.convert("RGB")
    small = rgb.resize((160, 160))
    hsv = small.convert("HSV")
    sat = sum(hsv.split()[1].getdata()) / (160 * 160)
    grey = small.convert("L")
    lap = grey.filter(ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], 1, 128))
    edge = statistics.pvariance(list(lap.getdata()))
    return {
        "alpha": alpha,
        "ar": im.width / im.height,
        "edge": edge,
        "px": im.width * im.height,
        "sat": sat,
        "small": small,
    }


def native_noise(path, crop=700):
    """
    Pixel-scale noise, measured at native resolution on a centre crop.

    Not from the downsampled thumbnail every other metric here uses: resizing
    averages pixel noise out of existence, so a denoiser that removed 67% of it
    measured as no change at all. Noise lives at the pixel, so the instrument
    has to look at pixels. Third time this session that measuring at the wrong
    scale produced a confident wrong answer.
    """
    im = Image.open(path).convert("L")
    side = min(crop, im.width, im.height)
    left, top = (im.width - side) // 2, (im.height - side) // 2
    im = im.crop((left, top, left + side, top + side))
    blurred = im.filter(ImageFilter.GaussianBlur(1.2))
    pairs = zip(list(im.getdata()), list(blurred.getdata()))
    return sum(abs(x - y) for x, y in pairs) / (side * side)


def mean_abs_diff(a, b):
    """Normalised mean absolute difference between two images, scale-independent."""
    pa, pb = list(a["small"].convert("L").getdata()), list(b["small"].convert("L").getdata())
    return sum(abs(x - y) for x, y in zip(pa, pb)) / (len(pa) * 255)


def peak_block_diff(a, b, grid=8):
    """
    The most-changed tile, not the average.

    A whole-image mean cannot see a localised edit: removing one small bottle
    from a wide still life moves under 1% of pixels, which reads identical to
    doing nothing. Erase, inpaint and text removal are all localised by
    definition, so the instrument has to look where the change is.
    """
    ga = a["small"].convert("L")
    gb = b["small"].convert("L")
    step = ga.width // grid
    peak = 0.0
    for gy in range(grid):
        for gx in range(grid):
            box = (gx * step, gy * step, (gx + 1) * step, (gy + 1) * step)
            pa, pb = list(ga.crop(box).getdata()), list(gb.crop(box).getdata())
            d = sum(abs(x - y) for x, y in zip(pa, pb)) / (len(pa) * 255)
            peak = max(peak, d)
    return peak


def find(pattern):
    hits = sorted(glob.glob(os.path.join(EXAMPLES, pattern)))
    return hits[0] if hits else None


def source_for(demo):
    entry = next(s for s in MANIFEST["sources"] if s["id"] == demo["source"])
    if "have" in entry:
        return os.path.join(ROOT, entry["have"])
    return find(f"source-{demo['source']}.*")


def output_for(demo):
    plate = demo["plate"]
    if demo.get("json"):
        return find(f"out-{plate}.json")
    if demo.get("dir"):
        inside = sorted(glob.glob(os.path.join(EXAMPLES, plate, "*")))
        return inside[0] if inside else None
    return find(f"out-{plate}.*")


rows = []
for demo in MANIFEST["demos"]:
    plate = demo["plate"]
    out = output_for(demo)
    if out is None:
        # Some artefacts are deliberately not kept: a 15MB mesh that no page can
        # render earns nothing in a public repo. Absent by design is not a
        # failure, but it must be declared in the manifest rather than assumed.
        if demo.get("artefactNotRetained"):
            rows.append((plate, "ok", "artefact not retained; regenerate to verify"))
        else:
            rows.append((plate, "MISSING", "no output produced"))
        continue
    if out.endswith(".json"):
        # Judge content, not bytes. A correct OCR transcription of a two-line
        # label is legitimately tiny; a byte threshold would fail it and pass a
        # large response that said nothing.
        payload = json.load(open(out))
        text = json.dumps(payload)
        meaningful = len([v for v in str(payload) if v.isalnum()]) > 12
        rows.append((plate, "ok" if meaningful else "EMPTY", text[:88].replace("\n", " ")))
        continue
    if out.endswith((".svg", ".glb", ".zip", ".ply")):
        size = os.path.getsize(out)
        rows.append((plate, "ok" if size > 500 else "THIN", f"{os.path.basename(out)}, {size:,} bytes"))
        continue

    src = source_for(demo)
    derived = find(f"derived-{plate}.*")
    a = stats(derived or src)
    b = stats(out)
    b["diff"] = mean_abs_diff(a, b)
    b["peak"] = peak_block_diff(a, b)
    a["noise"] = native_noise(derived or src)
    b["noise"] = native_noise(out)
    a["diff"] = 0.0
    a["peak"] = 0.0

    label, test = EXPECT.get(plate, ("differs", lambda x, y: y["diff"] > 0.02))
    if test is None:
        rows.append((plate, "ok", "no assertion"))
        continue
    passed = test(a, b)
    detail = (
        f"diff {b['diff']:.3f} peak {b['peak']:.3f} | sat {a['sat']:.0f}->{b['sat']:.0f} | "
        f"edge {a['edge']:.0f}->{b['edge']:.0f} | noise {a['noise']:.1f}->{b['noise']:.1f} | "
        f"{a['px'] // 1000}k->{b['px'] // 1000}k px"
    )
    rows.append((plate, "ok" if passed else f"NO EFFECT ({label})", detail))

if "--json" in sys.argv:
    print(json.dumps([{"plate": p, "status": s, "detail": d} for p, s, d in rows], indent=2))
else:
    width = max(len(r[0]) for r in rows)
    for plate, status, detail in rows:
        mark = " " if status == "ok" else "!"
        print(f"{mark} {plate.ljust(width)}  {status.ljust(22)}  {detail}")
    bad = [r for r in rows if r[1] != "ok"]
    print(f"\n{len(rows) - len(bad)}/{len(rows)} demonstrate their effect.")
    if bad:
        print("Not shippable as-is: " + ", ".join(r[0] for r in bad))
        sys.exit(1)
