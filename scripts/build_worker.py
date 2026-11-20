"""Bundle the generated storefront and same-origin try-on API for Worker hosting."""

import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
pages = {}
for path in dist.rglob("index.html"):
    route = "/" if path == dist / "index.html" else "/" + path.parent.relative_to(dist).as_posix() + "/"
    pages[route] = path.read_text(encoding="utf-8")

asset_types = {".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8"}
assets = {}
for name in ("remap.css", "remap.js", "react-bits.css", "react-bits.js", "react-bits-license.txt", "tryon.css", "tryon.js", "live-tryon.css", "live-tryon.js", "decart-live.js", "products.json"):
    path = dist / name
    assets["/" + name] = {"type": asset_types[path.suffix], "content": path.read_text(encoding="utf-8")}

products = json.loads((dist / "products.json").read_text(encoding="utf-8"))["products"]
product_images = {
    product["handle"]: {"handle": product["handle"], "type": product.get("product_type", ""), "images": [image["src"] for image in product["images"]]}
    for product in products
}

shopify_variants = {
    str(variant["id"]): {"handle": product["handle"], "price": variant["price"]}
    for product in products
    for variant in product["variants"]
}

prefix = "\n".join(
    f"const {name} = {json.dumps(value, ensure_ascii=False, separators=(',', ':'))};"
    for name, value in (("pages", pages), ("siteAssets", assets), ("productImages", product_images), ("shopifyVariants", shopify_variants))
)
worker = (root / "worker" / "index.js").read_text(encoding="utf-8")
output = dist / "server" / "index.js"
output.parent.mkdir(exist_ok=True)
output.write_text(prefix + "\n" + worker, encoding="utf-8")
(output.parent / "package.json").write_text('{"type":"module"}\n', encoding="utf-8")
print(f"Bundled {len(pages)} pages and {len(assets)} assets into {output.stat().st_size:,} bytes")
