"""Bundle the generated storefront and same-origin APIs for Worker hosting.

Besides bundling, this adds what every page needs on the live domain:
canonical and social tags, product structured data, analytics tags, a
sitemap and robots.txt, and content-hashed script and style URLs so
browsers can cache them safely between deploys.
"""

import hashlib
import html
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
SITE = "https://myruchs.com"
DEFAULT_SHARE_IMAGE = "/showcase/brand-share.jpg"
# Tracking IDs carried over from the ruchs.in theme (Google & YouTube and Meta apps).
GA_MEASUREMENT_ID = "G-M0EHDZSDPJ"
META_PIXEL_ID = "1412294113670313"
NOINDEX_ROUTES = {"/search/", "/pages/swym-wishlist/", "/404/"}

pages = {}
for path in dist.rglob("index.html"):
    route = "/" if path == dist / "index.html" else "/" + path.parent.relative_to(dist).as_posix() + "/"
    pages[route] = path.read_text(encoding="utf-8")

asset_types = {".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8"}
assets = {}
for name in ("remap.css", "remap.js", "motion.css", "motion.js", "addons.js", "react-bits.css", "react-bits.js", "react-bits-license.txt", "tryon.css", "tryon.js", "recolour.js", "live-tryon.css", "live-tryon.js", "decart-live.js", "products.json"):
    path = dist / name
    assets["/" + name] = {"type": asset_types[path.suffix], "content": path.read_text(encoding="utf-8")}

products = json.loads((dist / "products.json").read_text(encoding="utf-8"))["products"]
by_handle = {product["handle"]: product for product in products}
def product_summary(product: dict) -> str:
    """First sentences of the description, plain text: tells the try-on model the cut and fabric."""
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", product.get("body_html") or ""))).strip()
    sentences = re.split(r"(?<=[.!?])\s+", text)
    summary = ""
    for sentence in sentences:
        if len(summary) + len(sentence) > 420:
            break
        summary = f"{summary} {sentence}".strip()
    return summary


product_images = {
    product["handle"]: {"handle": product["handle"], "title": product["title"], "type": product.get("product_type", ""),
                        "summary": product_summary(product), "images": [image["src"] for image in product["images"]]}
    for product in products
}

shopify_variants = {
    str(variant["id"]): {"handle": product["handle"], "price": variant["price"]}
    for product in products
    for variant in product["variants"]
}


def catalog_image(url: str) -> str:
    return f"/catalog/{url.split('?')[0].rsplit('/', 1)[-1]}.webp"


def attr(value: str) -> str:
    return html.escape(html.unescape(value), quote=True)


def product_data(product: dict, url: str) -> str:
    description = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", product.get("body_html") or ""))).strip()
    data = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product["title"],
        "url": url,
        "image": [SITE + catalog_image(image["src"]) for image in product["images"][:6]],
        "description": description[:5000],
        "brand": {"@type": "Brand", "name": "Ruchs"},
        "offers": [
            {
                "@type": "Offer",
                "url": url,
                "priceCurrency": "INR",
                "price": variant["price"],
                "availability": "https://schema.org/InStock" if variant.get("available") else "https://schema.org/OutOfStock",
                "itemCondition": "https://schema.org/NewCondition",
                **({"sku": variant["sku"]} if variant.get("sku") else {}),
                "name": variant["title"],
            }
            for variant in product["variants"]
        ],
    }
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + "</script>"


ANALYTICS = f'''<script async src="https://www.googletagmanager.com/gtag/js?id={GA_MEASUREMENT_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','{GA_MEASUREMENT_ID}');
!function(f,b,e,v,n,t,s){{if(f.fbq)return;n=f.fbq=function(){{n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','{META_PIXEL_ID}');fbq('track','PageView');</script>'''


def head_tags(route: str, page_html: str) -> str:
    url = SITE + route
    title = re.search(r"<title>(.*?)</title>", page_html, re.S).group(1).strip()
    description_match = re.search(r'<meta name="description" content="([^"]*)"', page_html)
    description = description_match.group(1) if description_match else ""
    handle_match = re.fullmatch(r"/products/([^/]+)/", route)
    product = by_handle.get(handle_match.group(1)) if handle_match else None
    image = catalog_image(product["images"][0]["src"]) if product and product["images"] else DEFAULT_SHARE_IMAGE
    tags = [
        f'<link rel="canonical" href="{url}">',
        '<meta name="robots" content="noindex, follow">' if route in NOINDEX_ROUTES else "",
        '<meta property="og:site_name" content="Ruchs">',
        f'<meta property="og:type" content="{"product" if product else "website"}">',
        f'<meta property="og:url" content="{url}">',
        f'<meta property="og:title" content="{attr(title)}">',
        f'<meta property="og:description" content="{attr(description)}">',
        f'<meta property="og:image" content="{SITE}{image}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{attr(title)}">',
        f'<meta name="twitter:description" content="{attr(description)}">',
        f'<meta name="twitter:image" content="{SITE}{image}">',
    ]
    if product:
        first = product["variants"][0]
        tags += [
            f'<meta property="product:price:amount" content="{first["price"]}">',
            '<meta property="product:price:currency" content="INR">',
            product_data(product, url),
        ]
    return "".join(tag for tag in tags if tag) + ANALYTICS


# Content-hashed URLs: pages reference /remap.js?v=<hash>, so a deploy changes
# the URL and browsers can keep each version for a year.
versions = {path: hashlib.sha256(asset["content"].encode("utf-8")).hexdigest()[:10] for path, asset in assets.items()}
for route, page_html in pages.items():
    for path, version in versions.items():
        page_html = page_html.replace(f'src="{path}"', f'src="{path}?v={version}"').replace(f'href="{path}"', f'href="{path}?v={version}"')
    pages[route] = page_html.replace("</head>", head_tags(route, page_html) + "</head>", 1)

indexable = sorted(route for route in pages if route not in NOINDEX_ROUTES)
assets["/sitemap.xml"] = {
    "type": asset_types[".xml"],
    "content": '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{SITE}{route}</loc></url>\n" for route in indexable)
    + "</urlset>\n",
}
assets["/robots.txt"] = {
    "type": asset_types[".txt"],
    "content": f"User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /search/\n\nSitemap: {SITE}/sitemap.xml\n",
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
