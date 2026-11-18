"""Render the Ruchs catalog in a new, accessible editorial storefront."""

from __future__ import annotations

import html
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DATA = json.loads((ROOT / "data" / "content.json").read_text(encoding="utf-8"))
PRODUCTS = json.loads((DIST / "products.json").read_text(encoding="utf-8"))["products"]
BY_HANDLE = {product["handle"]: product for product in PRODUCTS}

COLLECTIONS = [
    ("dresses", "Dresses"), ("co-ords", "Co-ords"), ("corset", "Tops"),
    ("skirts", "Skirts"), ("jumpsuits", "Jumpsuits"), ("pants", "Pants"),
    ("shirts", "Shirts"), ("skorts-shorts", "Skorts & shorts"),
]

ICONS = {
    "search": '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    "bag": '<path d="M4 8h16l-1 13H5L4 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
    "heart": '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
    "menu": '<path d="M3 6h18M3 12h18M3 18h18"/>',
    "close": '<path d="M5 5 19 19M19 5 5 19"/>',
    "arrow": '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    "chevron": '<path d="m6 9 6 6 6-6"/>',
    "minus": '<path d="M4 12h16"/>',
    "plus": '<path d="M4 12h16M12 4v16"/>',
}


def icon(name: str, label: str | None = None) -> str:
    aria = f'role="img" aria-label="{html.escape(label)}"' if label else 'aria-hidden="true"'
    return f'<svg {aria} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>'


def text(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def image_path(source: str) -> str:
    return "/cdn/shop/files/" + Path(urlparse(source).path).name


def first_image(product: dict) -> str:
    return image_path(product["images"][0]["src"])


def price(product: dict) -> str:
    amount = min(float(v["price"]) for v in product["variants"])
    return f"₹ {amount:,.0f}"


def product_card(product: dict, index: int = 0) -> str:
    handle = text(product["handle"])
    title = text(product["title"])
    image = first_image(product)
    return f'''<article class="product-card" data-order="{index}" data-title="{title.lower()}" data-price="{min(float(v['price']) for v in product['variants'])}">
      <a class="product-card__image" href="/products/{handle}/" aria-label="View {title}">
        <img src="{image}" alt="{title}" loading="{'eager' if index < 4 else 'lazy'}" width="{product['images'][0].get('width',800)}" height="{product['images'][0].get('height',1100)}">
        <span class="product-card__view">View piece {icon('arrow')}</span>
      </a>
      <div class="product-card__meta"><div><h3><a href="/products/{handle}/">{title}</a></h3><p>{price(product)}</p></div>
        <button class="icon-button wish-button" type="button" data-wish="{handle}" aria-label="Save {title} to wishlist" aria-pressed="false">{icon('heart')}</button></div>
    </article>'''


def header() -> str:
    links = ''.join(f'<a href="/collections/{slug}/">{label}</a>' for slug, label in COLLECTIONS[:4])
    return f'''<a class="skip-link" href="#main">Skip to content</a>
    <div class="announcement"><span>Thoughtfully made. Beautifully worn.</span><a href="/collections/all/">Explore the collection {icon('arrow')}</a></div>
    <header class="site-header"><div class="header-inner">
      <button type="button" class="icon-button mobile-menu-button" data-menu-open aria-label="Open menu" aria-expanded="false">{icon('menu')}</button>
      <nav class="primary-nav" aria-label="Primary"><a href="/collections/all/">Shop all</a><a href="/collections/">Collections</a><a href="/pages/about-us/">Our story</a></nav>
      <a class="brand" href="/" aria-label="Ruchs home"><span>RUCHS</span><small>BY RUCHI SACHDEVA</small></a>
      <div class="header-actions"><button type="button" class="icon-button" data-search-open aria-label="Search">{icon('search')}</button>
        <a class="icon-button" href="/pages/swym-wishlist/" aria-label="Wishlist">{icon('heart')}</a>
        <button type="button" class="icon-button bag-button" data-cart-open aria-label="Open cart">{icon('bag')}<span class="cart-count" data-cart-count hidden>0</span></button></div>
    </div></header>
    <div class="mobile-menu" id="mobile-menu" hidden><div class="mobile-menu__top"><span>Explore Ruchs</span><button class="icon-button" data-menu-close aria-label="Close menu">{icon('close')}</button></div><nav aria-label="Mobile">
      <a href="/collections/all/">Shop all {icon('arrow')}</a>{links}<a href="/pages/about-us/">Our story</a><a href="/pages/contact/">Contact</a></nav></div>
    <div class="search-panel" id="search-panel" hidden><div class="search-panel__inner"><form action="/search/" role="search"><label for="site-search">Search the collection</label><div><input id="site-search" name="q" type="search" placeholder="Try dresses, sets, skirts…" autocomplete="off"><button type="submit" aria-label="Submit search">{icon('arrow')}</button></div></form><button class="icon-button" data-search-close aria-label="Close search">{icon('close')}</button></div></div>'''


def footer() -> str:
    collection_links = ''.join(f'<a href="/collections/{slug}/">{label}</a>' for slug, label in COLLECTIONS[:6])
    return f'''<footer class="site-footer"><div class="footer-main wrap"><div class="footer-brand"><a class="brand" href="/"><span>RUCHS</span><small>BY RUCHI SACHDEVA</small></a><p>Thoughtful clothing for the many ways you move through the world.</p></div>
      <div class="footer-links"><h2>Explore</h2><a href="/collections/all/">Shop all</a>{collection_links}</div>
      <div class="footer-links"><h2>About</h2><a href="/pages/about-us/">Our story</a><a href="/pages/contact/">Contact</a><a href="/policies/shipping-policy/">Shipping</a><a href="/policies/refund-policy/">Returns & exchanges</a><a href="/policies/privacy-policy/">Privacy</a></div>
      <div class="footer-connect"><h2>Stay close</h2><p>New pieces, styling notes, and a slower way to dress.</p><a class="text-link" href="https://www.instagram.com/ruchsofficial/" target="_blank" rel="noopener">Follow on Instagram {icon('arrow')}</a></div></div>
      <div class="footer-bottom wrap"><span>© 2026 Ruchs</span><span>Made with intention</span><a href="/policies/terms-of-service/">Terms of service</a></div></footer>
      <div class="cart-layer" id="cart-layer" hidden><button class="cart-scrim" data-cart-close aria-label="Close cart"></button><aside class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title"><header><h2 id="cart-title">Your bag <span data-cart-heading-count>0</span></h2><button class="icon-button" data-cart-close aria-label="Close cart">{icon('close')}</button></header><div class="cart-drawer__body" data-cart-lines></div><footer data-cart-footer></footer></aside></div>'''


def page(title: str, body: str, description: str = "Thoughtfully crafted sustainable fashion by Ruchs.", kind: str = "product") -> str:
    return f'''<!doctype html><html lang="en" data-type="{kind}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#43162b"><meta name="page-type" content="{kind}"><meta name="site-kind" content="other"><meta name="description" content="{text(description)}"><title>{text(title)} — Ruchs</title><link rel="icon" href="/cdn/shop/files/IMG_3941_48cfe4a1-81fc-463d-9b5d-aed2d550434b.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet"><link rel="stylesheet" href="/remap.css"><link rel="stylesheet" href="/tryon.css"><script defer src="/remap.js"></script><script defer src="/tryon.js"></script></head><body>{header()}<main id="main">{body}</main>{footer()}</body></html>'''


def home() -> str:
    hero_product = BY_HANDLE["mira-modular-white-co-ord-set"]
    category = DATA["category_images"]
    featured = [BY_HANDLE[h] for h in ["angelic-cinderella-dress", "vera-luxe-co-ord-set", "aria-hibiscus-set", "luna-burgundy-jumpsuit"]]
    categories = [("Dresses", "dresses"), ("Co-ord Sets", "co-ords"), ("Corset/Tops", "corset"), ("Skirts", "skirts")]
    cards = ''.join(f'''<a href="/collections/{slug}/" class="category-card"><img src="{category.get(label,first_image(featured[0]))}" alt="" loading="lazy"><span>{text(label)} {icon('arrow')}</span></a>''' for label, slug in categories)
    body = f'''<section class="home-hero"><div class="home-hero__copy"><p class="eyebrow" data-enter>RUCHS · THE NEW EDIT</p><h1 data-enter>Clothing that moves <em>with you.</em></h1><p data-enter>Thoughtful silhouettes, plant-based fabrics, and pieces made for more than one moment.</p><a data-enter class="button button-light" href="/collections/all/">Explore the collection {icon('arrow')}</a><span class="hero-footnote">SUSTAINABLE STYLE · DESIGNED TO LAST</span></div><div class="home-hero__visual"><img src="{first_image(hero_product)}" alt="Model wearing the Mira Modular White Co-ord Set" fetchpriority="high" width="{hero_product['images'][0]['width']}" height="{hero_product['images'][0]['height']}"></div></section>
    <section class="intro-band"><div class="wrap"><span class="eyebrow">A MORE CONSIDERED WARDROBE</span><p>Beautiful things should feel good to wear — and good to keep.</p></div></section>
    <section class="section section-categories wrap"><div class="section-heading"><div><p class="eyebrow">FIND YOUR FORM</p><h2>Shop by collection</h2></div><a class="text-link" href="/collections/">View all collections {icon('arrow')}</a></div><div class="category-grid">{cards}</div></section>
    <section class="story-section"><div class="story-section__image"><img src="{first_image(BY_HANDLE['ella-petal-set'])}" alt="Ruchs floral two-piece set styled outdoors" loading="lazy"></div><div class="story-section__copy"><p class="eyebrow">THE RUCHS POINT OF VIEW</p><h2>Rooted in nature.<br><em>Inspired by you.</em></h2><p>We believe fashion should empower, not harm. Our pieces pair timeless design with plant-based, ethically sourced materials.</p><a class="button button-outline" href="/pages/about-us/">Discover our story {icon('arrow')}</a></div></section>
    <section class="section section-products wrap"><div class="section-heading"><div><p class="eyebrow">THE PIECES TO KNOW</p><h2>Our current favourites</h2></div><a class="text-link" href="/collections/all/">Shop all pieces {icon('arrow')}</a></div><div class="product-grid">{''.join(product_card(p,i) for i,p in enumerate(featured))}</div></section>
    <section class="values-band"><div class="wrap"><div><span>01</span><h3>Natural fibres</h3><p>Materials chosen with care.</p></div><div><span>02</span><h3>Made to last</h3><p>Considered forms beyond the season.</p></div><div><span>03</span><h3>Wear it your way</h3><p>Versatile pieces for real life.</p></div></div></section>
    <section class="closing-story"><div><p class="eyebrow">DRESS WITH INTENTION</p><h2>More ways to wear.<br><em>More reasons to love.</em></h2><a class="button button-light" href="/collections/all/">Find your next piece {icon('arrow')}</a></div><img src="{first_image(BY_HANDLE['angelic-cinderella-dress'])}" alt="Angelic Cinderella Dress by Ruchs" loading="lazy"></section>'''
    return page("Sustainable style for modern women", body, "Explore considered womenswear, versatile silhouettes, and plant-based materials at Ruchs.")


def collection_index() -> str:
    cards = []
    for label, slug in [("Dresses", "dresses"), ("Co-ord Sets", "co-ords"), ("Corset/Tops", "corset"), ("Skirts", "skirts"), ("Jumpsuits", "jumpsuits"), ("Pants", "pants"), ("Shirts", "shirts"), ("Skorts/Shorts", "skorts-shorts")]:
        image = DATA["category_images"].get(label, "")
        cards.append(f'<a class="collection-tile" href="/collections/{slug}/"><img src="{image}" alt="" loading="lazy"><span>{text(label)} {icon("arrow")}</span></a>')
    body = f'<section class="page-intro wrap"><p class="eyebrow">EXPLORE RUCHS</p><h1>Find your <em>kind of beautiful.</em></h1><p>Discover pieces designed to move with your plans and your point of view.</p></section><section class="section wrap"><div class="collection-grid">{"".join(cards)}</div></section>'
    return page("Collections", body)


def listing(slug: str, details: dict) -> str:
    handles = details["products"]
    products = [BY_HANDLE[h] for h in handles if h in BY_HANDLE]
    title = details["title"] if slug not in {"all", "shop"} else "The collection"
    chips = '<a href="/collections/all/" class="collection-chip">All pieces</a>' + ''.join(f'<a href="/collections/{s}/" class="collection-chip">{label}</a>' for s,label in COLLECTIONS)
    body = f'''<section class="listing-intro wrap"><p class="eyebrow">THE RUCHS EDIT</p><h1>{text(title)}</h1><p>Thoughtful pieces for wherever the day takes you.</p></section>
      <section class="listing-section wrap"><nav class="collection-chips" aria-label="Shop categories">{chips}</nav>
      <div class="listing-toolbar"><span data-result-count>{len(products)} pieces</span><label>Sort by <select id="sort-products"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name</option></select></label></div>
      <div class="product-grid" id="listing-grid">{''.join(product_card(p,i) for i,p in enumerate(products))}</div><p class="empty-results" id="empty-results" hidden>No pieces match this search.</p></section>'''
    return page(title, body, f"Shop {title.lower()} from Ruchs.")


def product_detail(product: dict) -> str:
    title = text(product["title"])
    images = product["images"]
    gallery = ''.join(f'<button type="button" class="gallery-thumb {"is-active" if i==0 else ""}" data-gallery-image="{image_path(image["src"])}" data-image-index="{i}" aria-label="Show image {i+1} of {len(images)}"><img src="{image_path(image["src"])}" alt="" loading="lazy"></button>' for i, image in enumerate(images))
    option_groups = []
    for option in product["options"]:
        values = option.get("values", [])
        if not values:
            continue
        group = ''.join(f'<label class="variant-choice"><input type="radio" name="option-{option["position"]}" value="{text(value)}" {"checked" if i==0 else ""}><span>{text(value)}</span></label>' for i,value in enumerate(values))
        option_groups.append(f'<fieldset class="variant-group"><legend>{text(option["name"])}</legend><div>{group}</div></fieldset>')
    description = BeautifulSoup(product.get("body_html") or "", "html.parser")
    first_paragraph = description.find("p")
    summary = first_paragraph.get_text(" ", strip=True) if first_paragraph else ""
    summary = re.split(r"(?<=[.!?])\s+", summary)[0][:190].strip()
    for tag in description.find_all(True):
        if tag.name not in {"p", "ul", "ol", "li", "strong", "em", "br", "h3", "h4"}:
            tag.unwrap()
        else:
            tag.attrs.clear()
    body = f'''<div class="breadcrumbs wrap"><a href="/">Home</a><span>/</span><a href="/collections/all/">Shop</a><span>/</span><span>{title}</span></div>
      <section class="product-detail wrap" data-product-handle="{text(product['handle'])}"><div class="product-gallery"><div class="product-gallery__main"><img id="main-product-image" src="{first_image(product)}" alt="{title}" width="{images[0].get('width',800)}" height="{images[0].get('height',1100)}"></div><div class="product-gallery__thumbs" aria-label="Product photos">{gallery}</div></div>
      <div class="product-information"><p class="eyebrow">RUCHS · THOUGHTFULLY MADE</p><h1>{title}</h1><p class="product-price" id="product-price">{price(product)}</p><p class="product-intro">{text(summary)}</p>
      {''.join(option_groups)}<div class="buy-row"><div class="quantity-control" aria-label="Quantity"><button type="button" data-qty-minus aria-label="Decrease quantity">{icon('minus')}</button><input id="product-quantity" type="number" inputmode="numeric" min="1" value="1" aria-label="Quantity"><button type="button" data-qty-plus aria-label="Increase quantity">{icon('plus')}</button></div><button type="button" class="button button-dark add-button" data-add-to-cart>Add to bag {icon('arrow')}</button></div>
      <button type="button" class="button button-outline tryon-launch" data-tryon-open>Try it on with your photo {icon('arrow')}</button><p class="tryon-intro">Preview this piece on yourself before you choose.</p>
      <button type="button" class="save-product" data-wish="{text(product['handle'])}" aria-pressed="false">{icon('heart')} Save to wishlist</button>
      <div class="product-accordions"><details open><summary>Details {icon('chevron')}</summary><div>{str(description)}</div></details><details><summary>Shipping & returns {icon('chevron')}</summary><p>Delivery and exchange information is available in our published policies.</p><p><a href="/policies/shipping-policy/">Shipping policy</a> · <a href="/policies/refund-policy/">Refund policy</a></p></details></div></div></section>
      <section class="section wrap related-section"><div class="section-heading"><div><p class="eyebrow">CONTINUE EXPLORING</p><h2>You might also like</h2></div><a class="text-link" href="/collections/all/">Shop all {icon('arrow')}</a></div><div class="product-grid">{''.join(product_card(p,i) for i,p in enumerate([p for p in PRODUCTS if p['handle'] != product['handle']][:4]))}</div></section>
      <div class="tryon-layer" id="tryon-layer" hidden><div class="tryon-backdrop" data-tryon-close></div><section class="tryon-dialog" role="dialog" aria-modal="true" aria-labelledby="tryon-title" aria-describedby="tryon-description"><button type="button" class="icon-button tryon-close" data-tryon-close aria-label="Close virtual try-on">{icon('close')}</button><div class="tryon-copy"><p class="eyebrow">THE RUCHS FITTING ROOM</p><h2 id="tryon-title">See it on <em>you.</em></h2><p id="tryon-description">Upload a clear, front-facing photo to preview the {title}. Your photo is sent to our try-on provider only when you choose Generate.</p><div class="tryon-source"><img src="{first_image(product)}" alt="{title}" data-tryon-garment><div><span>01 / YOUR PIECE</span><strong>{title}</strong><small>Current product photo</small></div></div><label class="tryon-upload" for="tryon-person"><span>02 / YOUR PHOTO</span><strong data-tryon-file-label>Choose a photo</strong><small>JPG, PNG or WebP · front-facing · up to 15 MB</small></label><input id="tryon-person" class="tryon-file-input" data-tryon-file type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose your photo for virtual try-on"><p class="tryon-privacy">Your photo is used to create this preview and is not saved in this storefront. The provider may retain the generated image for up to one day. The preview is illustrative and does not determine size or fit.</p><button type="button" class="button button-dark tryon-generate" data-tryon-generate disabled>Generate preview {icon('arrow')}</button><p class="tryon-status" data-tryon-status role="status" aria-live="polite"></p></div><div class="tryon-visual"><div class="tryon-result" data-tryon-result><div class="tryon-placeholder"><span>VIRTUAL TRY-ON</span><p>Your look appears here.</p></div></div><a class="button button-light tryon-download" data-tryon-download hidden download="ruchs-virtual-try-on.png">Download your look {icon('arrow')}</a></div></section></div>'''
    return page(product["title"], body, f"Explore the {product['title']} at Ruchs.")


def content_page(route: str, blocks: list[dict]) -> str:
    if route == "/pages/swym-wishlist":
        body = '<section class="page-intro wrap"><p class="eyebrow">YOUR EDIT</p><h1>Saved pieces</h1><p>Keep the pieces you love close.</p></section><section class="section wrap"><div class="product-grid" id="wishlist-grid"></div><p class="empty-results" id="wishlist-empty">Your wishlist is empty. <a href="/collections/all/">Explore the collection</a>.</p></section>'
        return page("Wishlist", body)
    if route == "/pages/womens-wear":
        return listing("all", DATA["collections"]["all"])
    title = next((b["text"] for b in blocks if b["tag"] == "h1"), route.split("/")[-1].replace("-", " ").title())
    elements = []
    for block in blocks:
        tag = block["tag"]
        value = block["text"].replace("�", "–")
        if tag == "h1":
            continue
        if tag in {"h2", "h3"}:
            elements.append(f'<h2>{text(value)}</h2>')
        elif tag == "li":
            elements.append(f'<p class="article-list-item">{text(value)}</p>')
        else:
            elements.append(f'<p>{text(value)}</p>')
    if route == "/pages/contact":
        elements.insert(0, '<a class="button button-dark" href="mailto:ruchsofficial@gmail.com">Email the Ruchs team ' + icon("arrow") + '</a>')
    if route == "/blogs/news" and len(elements) == 0:
        elements.append('<p>There are no published stories yet. Discover the collection while we prepare the next chapter.</p>')
    body = f'<section class="page-intro wrap"><p class="eyebrow">RUCHS · INFORMATION</p><h1>{text(title)}</h1></section><section class="article-section wrap"><div class="article-content">{"".join(elements)}</div></section>'
    return page(title, body)


def search_page() -> str:
    body = f'<section class="page-intro wrap"><p class="eyebrow">FIND YOUR PIECE</p><h1>Search the collection</h1><form class="search-page-form" action="/search/" role="search"><label for="search-query">What are you looking for?</label><div><input id="search-query" type="search" name="q" placeholder="Search dresses, sets, skirts…"><button type="submit" aria-label="Search">{icon("arrow")}</button></div></form></section><section class="section wrap"><p class="search-count" id="search-count"></p><div class="product-grid" id="search-grid">{"".join(product_card(p,i) for i,p in enumerate(PRODUCTS))}</div><p class="empty-results" id="search-empty" hidden>No pieces found. Try another search.</p></section>'
    return page("Search", body)


def write(route: str, markup: str) -> None:
    output = DIST / route.strip("/") / "index.html" if route != "/" else DIST / "index.html"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(markup, encoding="utf-8")


def main() -> None:
    shutil.copyfile(ROOT / "scripts" / "remap.css", DIST / "remap.css")
    shutil.copyfile(ROOT / "scripts" / "tryon.css", DIST / "tryon.css")
    shutil.copyfile(ROOT / "scripts" / "remap.js", DIST / "remap.js")
    shutil.copyfile(ROOT / "scripts" / "tryon.js", DIST / "tryon.js")
    write("/", home())
    write("/collections", collection_index())
    for slug, details in DATA["collections"].items():
        if slug != "index":
            write(f"/collections/{slug}", listing(slug, details))
    for product in PRODUCTS:
        write(f"/products/{product['handle']}", product_detail(product))
    for route, blocks in DATA["pages"].items():
        write(route, content_page(route, blocks))
    write("/search", search_page())
    print("Rendered home, collections, products, content pages, and search")


if __name__ == "__main__":
    from bs4 import BeautifulSoup
    main()
