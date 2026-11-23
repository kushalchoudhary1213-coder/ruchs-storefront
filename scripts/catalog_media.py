"""Prepare locally served catalog images from the original Ruchs catalog export."""

from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image, ImageOps


def catalog_name(url):
    return Path(unquote(urlparse(url).path)).name


def catalog_url(url):
    return "/catalog/" + catalog_name(url) + ".webp"


# Small copies for cards, thumbnails and tiles: phones and small slots load these.
SMALL = 560


def catalog_small_url(url):
    return "/catalog/" + catalog_name(url) + f".{SMALL}.webp"


_widths = {}


def catalog_widths(dist, url):
    """Real widths of the small and full copies, for srcset descriptors."""
    if url not in _widths:
        sizes = []
        for path in (catalog_small_url(url), catalog_url(url)):
            with Image.open(dist / "static" / path.lstrip("/")) as photo:
                sizes.append(photo.width)
        _widths[url] = tuple(sizes)
    return _widths[url]


def prepare_catalog(dist, products, categories):
    sources = {dist / "cdn/shop/files" / catalog_name(photo["src"])
               for product in products for photo in product["images"]}
    sources.update(dist / url.lstrip("/") for url in categories.values())
    output = dist / "static/catalog"
    output.mkdir(parents=True, exist_ok=True)
    for source in sorted(sources):
        target = output / (source.name + ".webp")
        small = output / (source.name + f".{SMALL}.webp")
        fresh = [path.exists() and path.stat().st_mtime >= source.stat().st_mtime for path in (target, small)]
        if all(fresh):
            continue
        with Image.open(source) as original:
            photo = ImageOps.exif_transpose(original)
            photo.thumbnail((1120, 1536), Image.Resampling.LANCZOS)
            photo.save(target, format="WEBP", quality=84, method=4)
            photo.thumbnail((SMALL, round(SMALL * 1536 / 1120)), Image.Resampling.LANCZOS)
            photo.save(small, format="WEBP", quality=80, method=4)
