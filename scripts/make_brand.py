"""Create the myruchs.com brand assets from the Ruchs logo files in assets/brand.

ruchs-logo-source.png      - stacked logo (monogram above RUCHS wordmark), transparent
ruchs-monogram-source.webp - monogram only, transparent
RUCHS LOGO.ai              - Illustrator master (logo on wine); source of the wine colour

Run: python scripts/make_brand.py   (writes into assets/showcase, then npm run build)
"""
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[1]
brand, out = root / 'assets' / 'brand', root / 'assets' / 'showcase'
WINE = (75, 21, 57)  # #4b1539, sampled from the Illustrator artboard


def trim(image, pad=0):
    box = image.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    image = image.crop(box)
    if pad:
        canvas = Image.new('RGBA', (image.width + 2 * pad, image.height + 2 * pad), (0, 0, 0, 0))
        canvas.paste(image, (pad, pad))
        image = canvas
    return image


def height(image, h):
    return image.resize((round(image.width * h / image.height), h), Image.Resampling.LANCZOS)


stacked = trim(Image.open(brand / 'ruchs-logo-source.png').convert('RGBA'))
monogram = trim(Image.open(brand / 'ruchs-monogram-source.webp').convert('RGBA'))

# Split the stacked logo at the widest transparent band between monogram and wordmark.
alpha = stacked.getchannel('A')
rows = [sum(1 for x in range(stacked.width) if alpha.getpixel((x, y)) > 8) for y in range(stacked.height)]
gap_start = gap_end = None
best = (0, 0, 0)
y = 0
while y < stacked.height:
    if rows[y] == 0:
        start = y
        while y < stacked.height and rows[y] == 0:
            y += 1
        if y - start > best[0]:
            best = (y - start, start, y)
    y += 1
_, gap_start, gap_end = best
wordmark = trim(stacked.crop((0, gap_end, stacked.width, stacked.height)))
print('stacked', stacked.size, 'wordmark', wordmark.size, 'gap rows', gap_start, gap_end, 'monogram', monogram.size)

# Web assets (2x the largest display size).
height(stacked, 360).save(out / 'brand-logo.webp', quality=92, method=6)
height(stacked, 360).save(out / 'brand-logo.png', optimize=True)
height(wordmark, 96).save(out / 'brand-wordmark.webp', quality=92, method=6)
height(monogram, 160).save(out / 'brand-monogram.webp', quality=92, method=6)


def tile(size, mark_ratio):
    canvas = Image.new('RGBA', (size, size), WINE + (255,))
    mark = height(monogram, round(size * mark_ratio))
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas


tile(512, 0.72).save(out / 'ruchs-icon.png', optimize=True)  # existing favicon path
tile(180, 0.72).convert('RGB').save(out / 'apple-touch-icon.png', optimize=True)
tile(32, 0.82).save(out / 'favicon-32.png', optimize=True)

# Default share image (pages without a product photo): logo on wine, 1200x630.
share = Image.new('RGB', (1200, 630), WINE)
logo = height(stacked, 400)
share.paste(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2), logo)
share.save(out / 'brand-share.jpg', quality=90)
for name in sorted(p.name for p in out.iterdir() if p.name.startswith(('brand-', 'ruchs-icon', 'apple-touch', 'favicon-32'))):
    print(name, Image.open(out / name).size, (out / name).stat().st_size)
