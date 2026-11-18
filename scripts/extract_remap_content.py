"""Extract catalog structure and published copy from the original snapshot."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
OUT = ROOT / "data" / "content.json"


def soup(path: Path) -> BeautifulSoup:
    return BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")


def main() -> None:
    collections = {}
    for path in sorted((DIST / "collections").rglob("index.html")):
        slug = path.parent.name if path.parent != DIST / "collections" else "index"
        doc = soup(path)
        title = doc.find("h1")
        handles = []
        for anchor in doc.select("ul.product-grid a[href]"):
            route = urlparse(anchor["href"]).path
            if route.startswith("/products/"):
                handle = route.split("/")[2]
                if handle not in handles:
                    handles.append(handle)
        collections[slug] = {"title": title.get_text(" ", strip=True) if title else slug.title(), "products": handles}

    home = soup(DIST / "index.html")
    category_images = {}
    for image in home.find_all("img", alt=True):
        alt = image["alt"].strip()
        if alt in {"Co-ord Sets", "Corset/Tops", "Skirts", "Dresses", "Jumpsuits", "Pants", "Shirts", "Skorts/Shorts"}:
            category_images[alt] = urlparse(image.get("src", "")).path

    pages = {}
    for path in sorted(list((DIST / "pages").rglob("index.html")) + list((DIST / "policies").rglob("index.html")) + list((DIST / "blogs").rglob("index.html"))):
        route = "/" + str(path.parent.relative_to(DIST)).replace("\\", "/")
        doc = soup(path)
        main_node = doc.select_one("#MainContent") or doc.find("main")
        blocks = []
        if main_node:
            for node in main_node.find_all(["h1", "h2", "h3", "p", "li"]):
                if node.find_parent(["product-card", "footer"]):
                    continue
                value = node.get_text(" ", strip=True)
                if value and (not blocks or blocks[-1]["text"] != value):
                    blocks.append({"tag": node.name, "text": value})
        pages[route] = blocks

    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps({"collections": collections, "category_images": category_images, "pages": pages}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(collections)} collection maps, {len(pages)} content pages to {OUT}")


if __name__ == "__main__":
    main()
