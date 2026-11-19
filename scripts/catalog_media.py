"""Prepare locally served catalog images from the original Ruchs catalog export."""

from pathlib import Path
from urllib.parse import unquote, urlparse

from PIL import Image, ImageOps


def catalog_name(url):
    return Path(unquote(urlparse(url).path)).name


def catalog_url(url):
    return "/catalog/" + catalog_name(url) + ".webp"


def prepare_catalog(dist, products, categories):
    sources = {dist / "cdn/shop/files" / catalog_name(photo["src"])
               for product in products for photo in product["images"]}
    sources.update(dist / url.lstrip("/") for url in categories.values())
    output = dist / "static/catalog"
    output.mkdir(parents=True, exist_ok=True)
    for source in sorted(sources):
        target = output / (source.name + ".webp")
        if target.exists() and target.stat().st_mtime >= source.stat().st_mtime:
            continue
        with Image.open(source) as original:
            photo = ImageOps.exif_transpose(original)
            photo.thumbnail((1120, 1536), Image.Resampling.LANCZOS)
            photo.save(target, format="WEBP", quality=84, method=4)
