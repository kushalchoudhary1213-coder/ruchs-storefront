"""Find a garment's dominant colour so the try-on can offer colour previews.

The colour preview recolours pixels near the garment's hue in the browser. That
is only safe when the garment's hue is saturated and clearly apart from skin
tones; otherwise faces and arms would change colour too. For those pieces (and
for black, white and grey ones) the photo try-on shows the piece as made.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

SAFE_HUES = (160, 345)     # degrees: blues, purples, pinks. Below 160 are skin, warm walls and foliage; above 345 skin shadows
MIN_SHARE = .16            # the hue must cover at least this much of the garment area


def garment_hue(path: Path) -> int | None:
    """Dominant garment hue in degrees, or None when a recolour would not be clean."""
    with Image.open(path) as source:
        image = source.convert("RGB")
    image.thumbnail((200, 200))
    width, height = image.size
    # The garment fills the middle of a catalogue photo; the face sits above it.
    crop = image.crop((int(width * .18), int(height * .32), int(width * .82), int(height * .88))).convert("HSV")
    bins = [0] * 36
    total = 0
    for hue, saturation, value in crop.getdata():
        total += 1
        if saturation < 46 or value < 38 or value > 247:
            continue
        bins[hue * 36 // 256] += 1
    # Strongest hue outside the skin and warm-wall band, with its two neighbours.
    candidates = [i for i in range(36) if SAFE_HUES[0] <= (i + .5) * 10 <= SAFE_HUES[1]]
    peak = max(candidates, key=lambda i: bins[i - 1] + bins[i] + bins[(i + 1) % 36])
    share = (bins[peak - 1] + bins[peak] + bins[(peak + 1) % 36]) / max(total, 1)
    if share < MIN_SHARE:
        return None
    return round((peak + .5) * 10)


if __name__ == "__main__":
    import json
    import sys

    root = Path(sys.argv[1])
    sys.path.insert(0, str(root / "scripts"))
    from catalog_media import catalog_url

    products = json.loads((root / "dist" / "products.json").read_text(encoding="utf-8"))["products"]
    for product in products:
        path = root / "dist" / "static" / catalog_url(product["images"][0]["src"]).lstrip("/")
        print(product["handle"], garment_hue(path))
