"""Build a local snapshot of the public Ruchs storefront.

The generated pages keep the original Shopify markup and theme assets so that
the visual result stays faithful to the reference at different viewport sizes.
"""

from __future__ import annotations

import concurrent.futures
import html
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import xml.etree.ElementTree as ET

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"
ORIGIN = "https://www.ruchs.in"
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; RuchsLocalMirror/1.0)"})


def get(url: str) -> requests.Response:
    response = SESSION.get(url, timeout=45)
    response.raise_for_status()
    return response


def public_pages() -> list[str]:
    root = ET.fromstring(get(f"{ORIGIN}/sitemap.xml").content)
    paths = {"/", "/collections", "/collections/all", "/pages/faqs"}
    for loc in root.findall("s:sitemap/s:loc", NS):
        if "agentic" in loc.text:
            continue
        child = ET.fromstring(get(loc.text).content)
        for page in child.findall("s:url/s:loc", NS):
            paths.add(urlparse(page.text).path)
    paths.update(
        f"/policies/{name}"
        for name in (
            "contact-information", "privacy-policy", "refund-policy",
            "shipping-policy", "terms-of-service",
        )
    )
    return sorted(paths)


def path_for_page(path: str) -> Path:
    if path == "/":
        return OUT / "index.html"
    return OUT / path.lstrip("/") / "index.html"


def capture_page(path: str) -> tuple[str, str] | None:
    response = SESSION.get(f"{ORIGIN}{path}", timeout=45)
    if response.status_code != 200 or "text/html" not in response.headers.get("content-type", ""):
        print(f"SKIP {path}: {response.status_code}")
        return None
    source = response.text
    # Preserve the original markup and localize only first-party absolute URLs.
    source = source.replace("https://www.ruchs.in/", "/")
    source = source.replace("http://www.ruchs.in/", "/")
    source = source.replace("//www.ruchs.in/", "/")
    source = source.replace("</head>", '<link rel="stylesheet" href="/clone.css"><script defer src="/clone.js"></script></head>', 1)
    output = path_for_page(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(source, encoding="utf-8")
    return path, source


ASSET_PATTERN = re.compile(r"/cdn/[^\s\"'<>),;]+")


def asset_candidates(source: str) -> dict[str, str]:
    candidates: dict[str, str] = {}
    for raw in ASSET_PATTERN.findall(html.unescape(source)):
        raw = raw.rstrip("}]")
        parsed = urlparse(raw)
        path = parsed.path
        if not path.startswith("/cdn/"):
            continue
        old = candidates.get(path)
        # Prefer the widest Shopify variant when a srcset includes many widths.
        width = int(parse_qs(parsed.query).get("width", ["0"])[0] or 0)
        old_width = int(parse_qs(urlparse(old).query).get("width", ["0"])[0] or 0) if old else -1
        if old is None or width > old_width:
            candidates[path] = f"{ORIGIN}{raw}"
    return candidates


def download_asset(item: tuple[str, str]) -> tuple[str, int, str | None]:
    path, url = item
    target = OUT / path.lstrip("/")
    if target.exists() and target.stat().st_size:
        return path, target.stat().st_size, None
    try:
        response = get(url)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(response.content)
        return path, len(response.content), None
    except Exception as exc:
        return path, 0, str(exc)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    shutil.copyfile(ROOT / "scripts" / "clone.js", OUT / "clone.js")
    shutil.copyfile(ROOT / "scripts" / "clone.css", OUT / "clone.css")
    paths = public_pages()
    print(f"Capturing {len(paths)} public pages", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        pages = [page for page in pool.map(capture_page, paths) if page]
    assets: dict[str, str] = {}
    for _, source in pages:
        assets.update(asset_candidates(source))
    print(f"Downloading {len(assets)} first-party assets", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(download_asset, assets.items()))
    failures = [(p, err) for p, _, err in results if err]
    print(f"Downloaded {len(results) - len(failures)} assets, {sum(n for _, n, _ in results) / 1e6:.1f} MB", flush=True)
    if failures:
        print("Asset failures:", failures[:20], flush=True)

    product_data = get(f"{ORIGIN}/products.json?limit=250").json()
    (OUT / "products.json").write_text(json.dumps(product_data, ensure_ascii=False), encoding="utf-8")
    (ROOT / "mirror-manifest.json").write_text(
        json.dumps({"origin": ORIGIN, "pages": [p for p, _ in pages], "assets": len(results), "asset_failures": failures}, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
