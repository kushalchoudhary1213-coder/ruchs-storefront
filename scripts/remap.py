"""Render the Ruchs catalog in a new, accessible editorial storefront."""

from __future__ import annotations

import html
import json
import re
import base64
import shutil
from pathlib import Path
from catalog_media import catalog_small_url, catalog_url, catalog_widths, prepare_catalog
from garment_colour import garment_hue

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
    "star": '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
    "pause": '<path d="M9 5v14M15 5v14"/>',
    "play": '<path d="M8 5.5v13l11-6.5-11-6.5Z"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
}


def icon(name: str, label: str | None = None) -> str:
    aria = f'role="img" aria-label="{html.escape(label)}"' if label else 'aria-hidden="true"'
    return f'<svg {aria} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>'


def text(value: object) -> str:
    return html.escape(str(value or ""), quote=True)


def image_path(source: str) -> str:
    return catalog_url(source)


def first_image(product: dict) -> str:
    return image_path(product["images"][0]["src"])


# Slot widths for srcset: the browser picks the small copy wherever it is enough.
CARD_SIZES = "(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 25vw"


def photo(source: str, sizes: str) -> str:
    """src, srcset and sizes for a catalog photo (the 560px copy and the full one)."""
    small, full = catalog_widths(DIST, source)
    if full <= small:
        return f'src="{catalog_small_url(source)}"'
    return f'src="{catalog_small_url(source)}" srcset="{catalog_small_url(source)} {small}w, {catalog_url(source)} {full}w" sizes="{sizes}"'


def price(product: dict) -> str:
    amounts = [float(v["price"]) for v in product["variants"]]
    low = min(amounts)
    return f"From ₹ {low:,.0f}" if max(amounts) > low else f"₹ {low:,.0f}"


def film_base(product: dict) -> str:
    """URL base of the piece's film (without extension), or "" when none was made."""
    handle = product["handle"]
    return f"/films/{handle}" if (ROOT / "assets" / "films" / f"{handle}.mp4").exists() else ""


def product_card(product: dict, index: int = 0) -> str:
    handle = text(product["handle"])
    title = text(product["title"])
    alternate = ""
    if len(product["images"]) > 1:
        alternate = f'<img class="product-card__alternate" alt="" aria-hidden="true" {photo(product["images"][1]["src"], CARD_SIZES)} loading="lazy" width="{product['images'][1].get('width',800)}" height="{product['images'][1].get('height',1100)}">'
    film = film_base(product)
    film_attr = f' data-film="{film}"' if film else ""
    return f'''<article class="product-card"{film_attr} data-order="{index}" data-title="{title.lower()}" data-price="{min(float(v['price']) for v in product['variants'])}">
      <div class="product-card__media">
        <a class="product-card__image" href="/products/{handle}/" aria-label="View {title}">
          <img {photo(product["images"][0]["src"], CARD_SIZES)} alt="{title}" loading="{'eager' if index < 4 else 'lazy'}" width="{product['images'][0].get('width',800)}" height="{product['images'][0].get('height',1100)}">
          {alternate}<span class="product-card__view">View piece {icon('arrow')}</span>
        </a>
        <button class="icon-button wish-button" type="button" data-wish="{handle}" aria-label="Save {title} to wishlist" aria-pressed="false">{icon('heart')}</button>
        <button type="button" class="quick-view-button" data-quick-view="{handle}" aria-label="Quick view of the {title}">Quick view</button>
      </div>
      <div class="product-card__meta"><div><h3><a href="/products/{handle}/">{title}</a></h3><p>{price(product)}</p></div></div>
    </article>'''


def header() -> str:
    links = ''.join(f'<a href="/collections/{slug}/">{label}</a>' for slug, label in COLLECTIONS[:4])
    return f'''<a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header"><div class="header-inner">
      <button type="button" class="icon-button mobile-menu-button" data-menu-open aria-label="Open menu" aria-expanded="false">{icon('menu')}</button>
      <nav class="primary-nav" aria-label="Primary"><a href="/collections/all/">Shop</a><a href="/#lookbook">Lookbook</a><a href="/#wardrobe">Selected pieces</a></nav>
      <a class="brand brand--logo" href="/" aria-label="Ruchs home"><img class="brand-monogram" src="/showcase/brand-monogram.webp" alt="" width="34" height="40"><img class="brand-wordmark" src="/showcase/brand-wordmark.webp" alt="Ruchs" width="101" height="24"></a>
      <div class="header-actions"><button type="button" class="icon-button" data-search-open aria-label="Search">{icon('search')}</button>
        <a class="icon-button" href="/account" aria-label="Your account">{icon('user')}</a>
        <a class="icon-button" href="/pages/swym-wishlist/" aria-label="Wishlist">{icon('heart')}</a>
        <button type="button" class="icon-button bag-button" data-cart-open aria-label="Open cart">{icon('bag')}<span class="cart-count" data-cart-count hidden>0</span></button></div>
    </div></header>
    <div class="mobile-menu" id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" hidden><div class="mobile-menu__top"><span>Explore Ruchs</span><button class="icon-button" data-menu-close aria-label="Close menu">{icon('close')}</button></div><nav aria-label="Mobile">
      <a href="/collections/all/">Shop all {icon('arrow')}</a>{links}<a href="/#lookbook">Lookbook</a><a href="/#wardrobe">Selected pieces</a><a href="/pages/swym-wishlist/">Wishlist</a><a href="/account">Your account</a><a href="/pages/about-us/">Our story</a><a href="/pages/contact/">Contact</a></nav></div>
    <div class="search-panel" id="search-panel" hidden><div class="search-panel__inner"><form action="/search/" role="search"><label for="site-search">Search the collection</label><div><input id="site-search" name="q" type="search" placeholder="Try dresses, sets, skirts…" autocomplete="off"><button type="submit" aria-label="Submit search">{icon('arrow')}</button></div></form><button class="icon-button" data-search-close aria-label="Close search">{icon('close')}</button></div></div>'''


def footer() -> str:
    collection_links = ''.join(f'<a href="/collections/{slug}/">{label}</a>' for slug, label in COLLECTIONS[:6])
    return f'''<footer class="site-footer"><div class="footer-main wrap"><div class="footer-brand"><a class="brand brand--footer" href="/" aria-label="Ruchs home"><img src="/showcase/brand-logo.webp" alt="Ruchs" width="186" height="120" loading="lazy"><small>BY RUCHI SACHDEVA</small></a><p>Womenswear by Ruchi Sachdeva.</p></div>
      <div class="footer-links"><h2>Explore</h2><a href="/collections/all/">Shop all</a>{collection_links}</div>
      <div class="footer-links"><h2>About</h2><a href="/pages/about-us/">Our story</a><a href="/pages/contact/">Contact</a><a href="/policies/shipping-policy/">Shipping</a><a href="/policies/refund-policy/">Returns & exchanges</a><a href="/policies/privacy-policy/">Privacy</a></div>
      <div class="footer-connect"><h2>Join the Ruchs list</h2><p>New pieces, restocks and private previews, by email.</p>
        <form class="newsletter-form" action="/api/subscribe" method="post" data-ajax-form><input type="hidden" name="source" value="footer"><label class="visually-hidden" for="newsletter-email">Email address</label><div><input id="newsletter-email" name="email" type="email" autocomplete="email" spellcheck="false" placeholder="Your email address" required><button type="submit" aria-label="Join the list">{icon('arrow')}</button></div><input class="form-trap" name="company" tabindex="-1" autocomplete="off" aria-hidden="true"><p class="form-status" role="status" aria-live="polite"></p></form>
        <a class="text-link" href="https://www.instagram.com/ruchsofficial/" target="_blank" rel="noopener">Follow on Instagram {icon('arrow')}</a></div></div>
      <div class="footer-bottom wrap"><span>© 2026 Ruchs</span><a href="/policies/terms-of-service/">Terms of service</a></div></footer>
      <div class="cart-layer" id="cart-layer" hidden><button class="cart-scrim" data-cart-close aria-label="Close cart"></button><aside class="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title"><header><h2 id="cart-title">Your bag <span data-cart-heading-count>0</span></h2><button class="icon-button" data-cart-close aria-label="Close cart">{icon('close')}</button></header><div class="cart-drawer__body" data-cart-lines></div><footer data-cart-footer></footer></aside></div>'''


def page(title: str, body: str, description: str = "Thoughtfully crafted sustainable fashion by Ruchs.", kind: str = "product") -> str:
    styles = ["/remap.css", "/showcase/shop.css", "/motion.css", "/showcase/agency.css"]
    scripts = ["/remap.js", "/motion.js", "/addons.js"]
    # The motion engine runs on every page; it lifts the curtain once it has started.
    home_resources = ('<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches){var h=document.documentElement;h.classList.add("a-js");'
                      'if("CSSViewTransitionRule" in window&&document.referrer.indexOf(location.origin+"/")===0)h.classList.add("a-vt")}'
                      # A skipped page transition is harmless; keep its rejection out of the console.
                      'function q(e){var t=e.viewTransition,n=function(){};if(t){t.ready.catch(n);t.finished.catch(n);if(t.updateCallbackDone)t.updateCallbackDone.catch(n)}}addEventListener("pagereveal",q);addEventListener("pageswap",q);addEventListener("unhandledrejection",function(e){var r=e.reason;if(r&&r.name==="InvalidStateError"&&/[Tt]ransition/.test(r.message))e.preventDefault()})</script>'
                      # Prefetch likely next pages while the visitor hovers or presses a link.
                      '<script type="speculationrules">{"prefetch":[{"where":{"and":[{"href_matches":"/*"},{"not":{"href_matches":"/api/*"}},{"not":{"href_matches":"/account*"}}]},"eagerness":"moderate"}]}</script>'
                      '<script type="module" src="/showcase/site-motion.js"></script>')
    if kind == "home":
        styles.append("/showcase/showcase.css")
    if "data-colour-demo" in body:
        styles.append("/tryon.css")
        scripts.append("/recolour.js")
    if "data-product-handle=" in body:
        styles.extend(["/tryon.css", "/live-tryon.css"])
        scripts.extend(["/recolour.js", "/tryon.js", "/live-tryon.js"])
    styles.append("/showcase/frontier.css")  # the frontier layer always loads last
    css = "".join(f'<link rel="stylesheet" href="{url}">' for url in styles)
    js = "".join(f'<script defer src="{url}"></script>' for url in scripts)
    return f'''<!doctype html><html lang="en" data-type="{kind}"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#4b1539">
    <meta name="description" content="{text(description)}"><title>{text(title)} — Ruchs</title>
    <link rel="icon" href="/showcase/favicon-32.png" sizes="32x32" type="image/png"><link rel="icon" href="/showcase/ruchs-icon.png" sizes="512x512" type="image/png"><link rel="apple-touch-icon" href="/showcase/apple-touch-icon.png">
    {css}{js}{home_resources}</head><body><div class="a-curtain" aria-hidden="true"><div class="a-curtain__inner"><img src="/showcase/brand-monogram.webp" alt="" width="68" height="80"></div></div>{header()}<main id="main">{body}</main>{footer()}</body></html>'''


FABRIC_WORDS = ("cotton", "tencel", "satin", "georgette", "viscose", "jacquard", "linen", "silk", "modal", "twill", "slub", "crepe", "chiffon", "organza")


def fabric_of(product: dict) -> str:
    """The fabric as the product description names it, or "" when it names none."""
    plain = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", product.get("body_html") or "")))
    match = re.search(r"(?:crafted|made|cut|tailored)\s+(?:from|in|of)\s+([^.,;]{4,80})", plain, re.I)
    if not match:
        return ""
    phrase = re.split(r"\s+(?:with|for|that|which|to|offering|giving)\s+", match.group(1).strip())[0]
    phrase = re.sub(r"^(?:a|an|the|luxurious|premium|soft|fine)\s+", "", phrase, flags=re.I).strip()
    phrase = re.sub(r"\s+fabrics?$", "", phrase, flags=re.I)
    if not any(word in phrase.lower() for word in FABRIC_WORDS):
        return ""
    phrase = re.sub(r"\btencel\b", "Tencel", phrase.lower())
    return phrase[0].upper() + phrase[1:]


# The piece on the frosted card over the hero film.
HERO_PIECE = "elena-signature-trio"
# Selected pieces, under the hero.
SELECTED = ["ella-petal-set", "dusty-blue-lace-dress", "jasmine-royal-coord-set", "wednesday-muse-dress"]
# The red edit: pieces in wine, burgundy and rose, sliding over the satin window.
RED_EDIT = ["luna-burgundy-jumpsuit", "rosabella-convertible-set", "aria-hibiscus-set"]
# The lookbook: two films side by side, each a still window (handle, mood).
LOOKBOOK = [("mira-modular-white-co-ord-set", "White on white"), ("zoya-eclipse-dress", "After dark")]
# Our favourites: six different pieces in the coverflow.
FAVOURITES = ["angelic-cinderella-dress", "scarlett-blue-dress", "rosabella-convertible-set",
              "tia-blossom-mini", "ariana-ombre-set", "ariels-garden-duo-set"]
# The category strip at the end of the page (label, collection slug, category photo).
STRIP = [("Dresses", "dresses", "Dresses"), ("Co-ord sets", "co-ords", "Co-ord Sets"), ("Tops", "corset", "Corset/Tops"),
         ("Skirts", "skirts", "Skirts"), ("Jumpsuits", "jumpsuits", "Jumpsuits")]


def window_film(sources: str, poster: str) -> str:
    """A film held still on screen while its section scrolls: the section is the window."""
    return (f'<video muted loop playsinline preload="none" poster="{poster}" aria-hidden="true" data-window-film>'
            f'{sources}</video>')


def hero_card(handle: str) -> str:
    """A frosted card on the hero film: one piece, its photo, name and price."""
    piece = BY_HANDLE[handle]
    title = text(piece["title"])
    return f'''<a class="lx-glass" href="/products/{piece["handle"]}/" data-lx-glass>
          <img src="{catalog_small_url(piece["images"][0]["src"])}" alt="" width="96" height="128">
          <span class="lx-glass__copy"><span class="lx-glass__kicker">Featured piece</span><span class="lx-glass__name">{title}</span><span class="lx-glass__price">{price(piece)}</span></span></a>'''


def edit_window() -> str:
    """The red edit opens on a still window of red satin; the pieces slide up over it.
    Film: Mixkit "Red wavy fabric texture" (Stock Video Free License), graded by make_stock.py."""
    sources = '<source src="/showcase/stock/red-satin.webm" type="video/webm"><source src="/showcase/stock/red-satin.mp4" type="video/mp4">'
    return f'''<section class="lx-window lx-window--satin" aria-labelledby="edit-title" data-window>
      <div class="lx-window__media">{window_film(sources, "/showcase/stock/red-satin.webp")}</div>
      <div class="lx-window__copy" data-window-copy><p class="lx-kicker">The red edit</p><h2 id="edit-title">In shades of <em>wine and rose</em></h2>
        <a class="lx-link" href="#red-edit">Shop the edit {icon("arrow")}</a></div>
    </section>'''


def edit_row() -> str:
    """Three red edit pieces; each photo names its fabric on hover."""
    pieces = [BY_HANDLE[handle] for handle in RED_EDIT]
    items = "".join(f'''<article class="lx-edit__piece">
        <a class="lx-edit__photo" href="/products/{piece["handle"]}/"><img {photo(piece["images"][0]["src"], "(max-width: 900px) 64vw, 33vw")} alt="{text(piece["title"])}" loading="lazy" width="800" height="1100">
          <span class="lx-edit__fabric">{text(fabric_of(piece) or piece.get("product_type") or "Ruchs")}</span><span class="lx-edit__view">View the piece</span></a>
        <h3><a href="/products/{piece["handle"]}/">{text(piece["title"])}</a></h3><p>{price(piece)}</p></article>''' for piece in pieces)
    return f'''<section class="lx-edit" id="red-edit" aria-label="The red edit pieces">
      <div class="lx-edit__row" data-lx-rise>{items}</div>
      <a class="lx-link lx-edit__all" href="/collections/all/">Shop all {len(PRODUCTS)} pieces {icon("arrow")}</a>
    </section>'''


def lookbook_split() -> str:
    """Two lookbook films side by side; each half is its own still window."""
    halves = []
    for handle, mood in LOOKBOOK:
        piece = BY_HANDLE[handle]
        film = film_base(piece)
        sources = f'<source src="{film}.webm" type="video/webm"><source src="{film}.mp4" type="video/mp4">' if film else ""
        halves.append(f'''<a class="lx-half" href="/products/{piece["handle"]}/" data-window>
        <span class="lx-half__media">{window_film(sources, catalog_small_url(piece["images"][0]["src"]))}</span>
        <span class="lx-half__copy" data-window-copy><span class="lx-kicker">{text(mood)}</span><span class="lx-half__name">{text(piece["title"])}</span><span class="lx-half__price">{price(piece)}</span></span></a>''')
    return f'''<section class="lx-split" id="lookbook" aria-label="The lookbook">{"".join(halves)}</section>'''


def coverflow() -> str:
    """Our favourites: scrolling turns a coverflow; the centre piece is the one named."""
    pieces = [BY_HANDLE[handle] for handle in FAVOURITES]
    items = "".join(
        f'''<a class="lx-flow__item" href="/products/{piece["handle"]}/" data-flow-item data-title="{text(piece["title"])}" data-price="{text(price(piece))}">'''
        f'''<span class="lx-flow__photo"><img {photo(piece["images"][0]["src"], "(max-width: 700px) 58vw, 22vw")} alt="{text(piece["title"])}" loading="lazy" width="800" height="1100"></span>'''
        f'''<span class="lx-flow__label">{text(piece["title"])}</span></a>'''
        for piece in pieces)
    first = pieces[0]
    return f'''<section class="lx-fav" aria-labelledby="fav-title" data-coverflow>
      <div class="lx-fav__head"><p class="lx-kicker">Our favourites</p><h2 id="fav-title">Worn, restyled <em>and worn again.</em></h2>
        <p>Womenswear by Ruchi Sachdeva: dresses, co-ords, skirts and jumpsuits in organic cotton, Tencel and satin.</p>
        <a class="lx-pill" href="/pages/about-us/">Our story</a></div>
      <div class="lx-fav__pin">
        <div class="lx-flow" data-flow>{items}</div>
        <div class="lx-flow__caption"><h3 data-flow-name>{text(first["title"])}</h3><p data-flow-price>{price(first)}</p>
          <a class="lx-pill lx-pill--dark" href="/products/{first["handle"]}/" data-flow-link>View the piece</a></div>
        <div class="lx-flow__nav"><button type="button" data-flow-prev aria-label="Previous piece">{icon("arrow")}</button><span data-flow-count>01 / {len(pieces):02d}</span><button type="button" data-flow-next aria-label="Next piece">{icon("arrow")}</button></div>
      </div>
    </section>'''


def category_strip() -> str:
    """The categories run edge to edge at the end of the page."""
    tiles = "".join(
        f'''<a class="lx-strip__tile" href="/collections/{slug}/"><img {photo(DATA["category_images"][image], "(max-width: 700px) 62vw, (max-width: 900px) 46vw, 20vw")} alt="" loading="lazy" width="900" height="1200">'''
        f'''<span>{text(label)} <em>{len(DATA["collections"][slug]["products"])}</em></span></a>'''
        for label, slug, image in STRIP)
    return f'''<section class="lx-strip" aria-labelledby="strip-title">
      <div class="lx-strip__head"><h2 id="strip-title">Shop by category</h2><a class="lx-link" href="/collections/">All collections {icon("arrow")}</a></div>
      <div class="lx-strip__row" data-lx-rise>{tiles}</div>
    </section>'''


def home() -> str:
    lowest = min(float(v["price"]) for product in PRODUCTS for v in product["variants"])
    demo = BY_HANDLE["luna-burgundy-jumpsuit"]
    demo_hue = garment_hue(DIST / "static" / first_image(demo).lstrip("/"))
    selected = "".join(product_card(BY_HANDLE[handle], index + 4) for index, handle in enumerate(SELECTED))
    body = f'''<div class="showcase" data-showcase>
    <section class="sc-studio" id="studio" aria-labelledby="studio-title" data-window>
      <div class="sc-wardrobe-frame">
        <video data-film data-window-film autoplay muted loop playsinline preload="auto" poster="/media/wardrobe-poster.webp" aria-label="A close look along a rail of garments on wooden hangers">
          <source media="(max-width: 700px)" src="/media/wardrobe-mobile.mp4" type="video/mp4">
          <source src="/media/wardrobe-film.mp4" type="video/mp4">
        </video>
        <div class="sc-wardrobe-copy"><p class="sc-hero-kicker">Ruchs · Womenswear</p>
          <h1 id="studio-title" data-sc-title aria-label="Womenswear by Ruchi Sachdeva"><span class="sc-word" aria-hidden="true"><span>Womenswear</span></span> <em class="sc-word" aria-hidden="true"><span>by Ruchi Sachdeva.</span></em></h1>
          <p class="sc-hero-fact">Dresses, co-ords and sets in organic cotton, Tencel and satin. {len(PRODUCTS)} pieces from ₹{lowest:,.0f}.</p>
          <div class="sc-hero-actions"><a class="sc-hero-shop" href="/collections/all/"><span>Shop the collection</span> {icon("arrow")}</a><a class="sc-hero-second" href="#lookbook">Watch the lookbook</a></div>
        </div>
        {hero_card(HERO_PIECE)}
        <button type="button" class="sc-film-toggle" data-film-toggle aria-label="Pause the film"><span class="sc-film-pause">{icon("pause")}</span><span class="sc-film-play">{icon("play")}</span></button>
      </div>
    </section>
    <section class="sc-new lx-curated" id="wardrobe" aria-labelledby="new-title">
      <div class="sc-head"><h2 id="new-title">Selected <em>pieces</em></h2><a class="sc-pieces-all sc-underline" href="/collections/all/"><span>Shop all {len(PRODUCTS)} pieces</span> {icon("arrow")}</a></div>
      <div class="lx-grid" data-lx-grid>{selected}</div>
    </section>
    {edit_window()}
    {edit_row()}
    {lookbook_split()}
    {coverflow()}
    <section class="sc-tryon" aria-labelledby="tryon-demo-title" data-colour-demo data-hue="{demo_hue if demo_hue is not None else ''}">
      <div class="sc-tryon__visual"><img class="sc-tryon__photo" src="{first_image(demo)}" alt="{text(demo['title'])}" width="800" height="1100" loading="lazy" data-colour-photo><img class="sc-tryon__next" src="{first_image(demo)}" alt="" aria-hidden="true" data-colour-next></div>
      <div class="sc-tryon__copy">
        <h2 id="tryon-demo-title">Try a piece on before you order</h2>
        <p class="sc-tryon__lead">Every piece has a virtual fitting room. Choose a colour to see how a preview changes the {text(demo['title'])}.</p>
        {colour_swatches("demo", "Colour", first_image(demo))}
        <dl class="sc-tryon__ways"><div><dt>Photo try-on</dt><dd>Upload one photo and see the piece on you, in fine detail.</dd></div><div><dt>Live fitting</dt><dd>Your camera for 30 seconds, with colour and fabric finish changing live.</dd></div></dl>
        <a class="button button-dark" href="/products/{demo['handle']}/#try-on">Try on the {text(demo['title'])} {icon("arrow")}</a>
        <p class="tryon-colour-note">Colour previews are illustrative; each piece is made as shown in its photos.</p>
      </div>
    </section>
    {category_strip()}
    </div>'''
    return page("Womenswear by Ruchi Sachdeva", body, f"Dresses, co-ords and sets by Ruchi Sachdeva in organic cotton, Tencel and satin: {len(PRODUCTS)} pieces from ₹{lowest:,.0f}, with a virtual fitting room for every piece.", kind="home")


def collection_index() -> str:
    cards = []
    for label, slug in [("Dresses", "dresses"), ("Co-ord Sets", "co-ords"), ("Corset/Tops", "corset"), ("Skirts", "skirts"), ("Jumpsuits", "jumpsuits"), ("Pants", "pants"), ("Shirts", "shirts"), ("Skorts/Shorts", "skorts-shorts")]:
        cards.append(f'<a class="collection-tile" href="/collections/{slug}/"><img {photo(DATA["category_images"][label], "(max-width: 1100px) 50vw, 25vw")} alt="" loading="lazy"><span>{text(label)} {icon("arrow")}</span></a>')
    body = f'<section class="page-intro wrap"><h1>Collections</h1></section><section class="section wrap"><div class="collection-grid">{"".join(cards)}</div></section>'
    return page("Collections", body)


def listing(slug: str, details: dict) -> str:
    handles = details["products"]
    products = [BY_HANDLE[h] for h in handles if h in BY_HANDLE]
    title = details["title"] if slug not in {"all", "shop"} else "The collection"
    chips = ""
    for category_slug, label in [("all", "All pieces"), *COLLECTIONS]:
        selected = ' aria-current="page"' if category_slug == ("all" if slug == "shop" else slug) else ""
        chips += f'<a href="/collections/{category_slug}/" class="collection-chip"{selected}>{text(label)}</a>'
    body = f'''<section class="listing-intro wrap"><a class="collection-back" href="/collections/">Collections</a><h1>{text(title)}</h1></section>
      <section class="listing-section wrap"><nav class="collection-chips" aria-label="Shop categories">{chips}</nav>
      <div class="listing-toolbar"><span data-result-count>{len(products)} pieces</span><label>Sort by <select id="sort-products"><option value="featured">Featured</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option><option value="name">Name</option></select></label></div>
      <h2 class="visually-hidden">Pieces in this collection</h2><div class="product-grid" id="listing-grid">{''.join(product_card(p,i) for i,p in enumerate(products))}</div><p class="empty-results" id="empty-results" hidden>No pieces match this search.</p></section>'''
    return page(title, body, f"Shop {title.lower()} from Ruchs.")


# Standard Indian women's body measurements (inches). A general guide only:
# Ruchs has not published garment measurements, and fit varies by piece.
# Colour previews in the try-on (key, label, hex). worker/index.js accepts the same keys.
TRYON_COLOURS = [("wine", "Wine", "#4b1539"), ("rose", "Rose", "#b85c64"), ("blush", "Blush", "#e3a9a8"),
                 ("emerald", "Emerald", "#1f6f54"), ("midnight", "Midnight", "#1d2b4f"), ("lavender", "Lavender", "#9d8ec7")]
# Fabric finishes for the live fitting (key, label, prompt wording).
TRYON_FINISHES = [("satin", "Satin sheen", "a smooth satin finish with a soft, light-catching sheen"),
                  ("crepe", "Matte crepe", "a matte crepe finish with a fine pebbled surface"),
                  ("linen", "Linen weave", "a slubbed linen weave with visible natural texture"),
                  ("velvet", "Velvet", "a plush velvet finish with a soft, deep pile")]


def colour_swatches(group: str, legend: str, original_image: str) -> str:
    """Round fabric swatches: the piece as made, then the preview colours."""
    swatches = [f'<button type="button" class="swatch swatch--original is-active" data-colour="" aria-pressed="true" title="As made" style="--swatch-image:url({original_image})"><span class="visually-hidden">As made</span></button>']
    swatches += [f'<button type="button" class="swatch" data-colour="{key}" data-label="{label}" data-hex="{hex_value}" aria-pressed="false" title="{label}" style="--swatch:{hex_value}"><span class="visually-hidden">{label}</span></button>'
                 for key, label, hex_value in TRYON_COLOURS]
    return f'<fieldset class="tryon-swatches" data-{group}-colours><legend>{legend} <span data-{group}-colour-name>As made</span></legend><div>{"".join(swatches)}</div></fieldset>'


def finish_chips() -> str:
    chips = ['<button type="button" class="finish is-active" data-finish="" aria-pressed="true">As made</button>']
    chips += [f'<button type="button" class="finish finish--{key}" data-finish="{key}" data-finish-text="{text(wording)}" aria-pressed="false">{label}</button>'
              for key, label, wording in TRYON_FINISHES]
    return f'<fieldset class="tryon-finishes" data-live-finishes><legend>Fabric finish</legend><div>{"".join(chips)}</div></fieldset>'


SIZE_CHART = [("XS", 32, 26, 35), ("S", 34, 28, 37), ("M", 36, 30, 39), ("L", 38, 32, 41),
              ("XL", 40, 34, 43), ("2XL", 42, 36, 45), ("3XL", 44, 38, 47)]


def size_guide() -> str:
    rows = "".join(
        f"<tr><th scope=\"row\">{size}</th><td>{bust} in <span>{round(bust * 2.54)} cm</span></td><td>{waist} in <span>{round(waist * 2.54)} cm</span></td><td>{hip} in <span>{round(hip * 2.54)} cm</span></td></tr>"
        for size, bust, waist, hip in SIZE_CHART
    )
    return f'''<details class="size-guide"><summary>Size guide {icon('chevron')}</summary><div class="size-guide__body">
      <p>Body measurements for each size. Where a piece comes in a combined size such as XS – S, it is cut to fit both.</p>
      <div class="size-guide__table"><table><caption class="visually-hidden">Body measurements by size</caption><thead><tr><th scope="col">Size</th><th scope="col">Bust</th><th scope="col">Waist</th><th scope="col">Hip</th></tr></thead><tbody>{rows}</tbody></table></div>
      <h2 class="size-guide__subhead">How to measure</h2>
      <ul><li><strong>Bust:</strong> around the fullest part of your chest, keeping the tape level.</li><li><strong>Waist:</strong> around your natural waist, the narrowest part of your torso.</li><li><strong>Hip:</strong> around the fullest part of your hips, feet together.</li></ul>
      <p>Between two sizes? Choose the larger for a relaxed fit. This is a general guide, so fit can vary by piece. For help choosing, <a href="/pages/contact/">write to us</a>.</p>
    </div></details>'''


def product_detail(product: dict) -> str:
    title = text(product["title"])
    images = product["images"]
    gallery = ''.join(f'<button type="button" class="gallery-thumb {"is-active" if i==0 else ""}" data-gallery-image="{image_path(image["src"])}" data-image-index="{i}" aria-label="Show image {i+1} of {len(images)}"><img src="{catalog_small_url(image["src"])}" alt="" loading="lazy"></button>' for i, image in enumerate(images))
    option_groups = []
    for option in product["options"]:
        values = option.get("values", [])
        if not values:
            continue
        preselect = len(values) == 1 or "size" not in option["name"].lower()
        group = ''.join(f'<label class="variant-choice"><input type="radio" name="option-{option["position"]}" value="{text(value)}" {"checked" if preselect and i==0 else ""}><span>{text(value)}</span></label>' for i,value in enumerate(values))
        option_groups.append(f'<fieldset class="variant-group"><legend>{text(option["name"].strip().capitalize())}</legend><div>{group}</div><p class="variant-error" data-variant-error role="alert" hidden></p></fieldset>')
        if "size" in option["name"].lower() and len(values) > 1 and not any("size-guide" in g for g in option_groups):
            option_groups.append(size_guide())
    description = BeautifulSoup(product.get("body_html") or "", "html.parser")
    first_paragraph = description.find("p")
    summary = first_paragraph.get_text(" ", strip=True) if first_paragraph else ""
    summary = re.split(r"(?<=[.!?])\s+", summary)[0][:190].strip()
    product_type = (product.get("product_type") or "").lower()
    if any(word in product_type or word in product["title"].lower() for word in ("shirt", "top", "corset")):
        region = "upper body garment"
    elif any(word in product_type or word in product["title"].lower() for word in ("skirt", "pants", "shorts")):
        region = "lower body garment"
    else:
        region = "outfit"
    live_prompt = f"Substitute the {region} with the exact {product['title']} shown in the reference image. {summary}"
    hue = garment_hue(DIST / "static" / first_image(product).lstrip("/"))
    for tag in description.find_all(True):
        if tag.name not in {"p", "ul", "ol", "li", "strong", "em", "br", "h3", "h4"}:
            tag.unwrap()
        else:
            tag.attrs.clear()
    live_modal = f'''<div class="live-layer" id="live-tryon-layer" hidden><div class="live-backdrop" data-live-close></div><section class="live-dialog" role="dialog" aria-modal="true" aria-labelledby="live-title" aria-describedby="live-description"><button type="button" class="icon-button live-close" data-live-close data-live-close-button aria-label="Close live try-on">{icon('close')}</button><div class="live-copy"><h2 id="live-title">See it in <em>motion.</em></h2><p id="live-description">Try the {title} on through your camera. This live AI preview follows your movement, but does not measure size or fit.</p><div class="live-piece"><img src="{first_image(product)}" alt="{title}" data-live-garment><div><span>Your piece</span><strong>{title}</strong><small data-live-piece-note>Current product photo</small></div></div><div class="live-custom">{colour_swatches("live", "Colour", first_image(product))}{finish_chips()}<p class="tryon-colour-note">Colour and finish change live, even mid-session. They are a styling preview; the {title} is made as shown in its photos.</p></div><button type="button" class="button button-dark live-start" data-live-start disabled>Start live try-on {icon('arrow')}</button><button type="button" class="button button-outline live-stop" data-live-stop hidden>Stop camera {icon('close')}</button><p class="live-status" data-live-status role="status" aria-live="polite"></p><p class="live-notice">Your camera video is sent to Decart only while the live session runs. Each session lasts at most 30 seconds and uses Decart credits. This catalog uses model photos, so garment details may vary in the live preview.</p></div><div class="live-visual"><div class="live-stage" data-live-stage><video class="live-camera" data-live-camera autoplay muted playsinline aria-label="Your camera preview"></video><video class="live-result" data-live-result autoplay muted playsinline aria-label="AI live try-on result"></video><div class="live-placeholder"><span>Live virtual try-on</span><p>Your fitting starts here.</p></div></div><div class="live-stage-label"><span>Live preview</span><span data-live-timer></span></div></div></section></div>'''
    body = f'''<div class="breadcrumbs wrap"><a href="/">Home</a><span>/</span><a href="/collections/all/">Shop</a><span>/</span><span>{title}</span></div>
      <section class="product-detail wrap" data-product-handle="{text(product['handle'])}" data-live-prompt="{text(live_prompt)}"><div class="product-gallery"><div class="product-gallery__main">{(f'<button type="button" class="gallery-film-toggle" data-gallery-film="{film_base(product)}" aria-pressed="false"><span class="is-play">{icon("play")}</span><span class="is-pause">{icon("pause")}</span><span data-film-label>Watch the film</span></button>') if film_base(product) else ''}<img id="main-product-image" src="{first_image(product)}" alt="{title}" width="{images[0].get('width',800)}" height="{images[0].get('height',1100)}"></div><div class="product-gallery__thumbs" aria-label="Product photos">{gallery}</div></div>
      <div class="product-information"><h1>{title}</h1><a class="rating-summary" href="#reviews" data-rating-summary hidden></a><p class="product-price" id="product-price">{price(product)}</p><p class="product-intro">{text(summary)}</p>{(f'<div class="pdp-fabric"><span class="pdp-fabric__macro" data-macro style="--macro:url({first_image(product)})" role="img" aria-label="Close-up of the fabric of the {title}"></span><div><span>Fabric</span><strong>{text(fabric_of(product))}</strong></div></div>') if fabric_of(product) else ''}
      {''.join(option_groups)}<div class="buy-row"><div class="quantity-control" aria-label="Quantity"><button type="button" data-qty-minus aria-label="Decrease quantity">{icon('minus')}</button><input id="product-quantity" type="number" inputmode="numeric" min="1" value="1" aria-label="Quantity"><button type="button" data-qty-plus aria-label="Increase quantity">{icon('plus')}</button></div><button type="button" class="button button-dark add-button" data-add-to-cart>Add to bag {icon('arrow')}</button></div>
      <ul class="buy-facts"><li>Dispatched within 3–7 business days, then usually 3–7 business days to arrive within India.</li><li>Pay online with UPI or cards, or choose cash on delivery.</li><li>Damaged, defective or wrong item? Report it within 2 days of delivery for an exchange. <a href="/policies/refund-policy/">Exchange policy</a></li></ul>
      <fieldset class="fitting-options"><legend>Virtual fitting room</legend><div>
      <button type="button" class="button button-outline tryon-launch" data-tryon-open>Try it on with your photo {icon('arrow')}</button>
      <button type="button" class="button button-outline live-launch" data-live-open>Try it on live {icon('arrow')}</button></div></fieldset>
      <button type="button" class="save-product" data-wish="{text(product['handle'])}" aria-pressed="false">{icon('heart')} Save to wishlist</button>
      <div class="product-accordions"><details open><summary>Details {icon('chevron')}</summary><div>{str(description)}</div></details><details><summary>Shipping & exchanges {icon('chevron')}</summary><p>Orders are dispatched within 3–7 business days. Delivery within India usually takes 3–7 business days after that, and you get a tracking link when your order ships. Shipping charges are shown at checkout.</p><p>Exchanges are offered for damaged, defective or wrong items reported within 2 days of delivery, unused and in original packaging. Sale items and gift cards can’t be exchanged, and refunds aren’t given as money.</p><p><a href="/policies/shipping-policy/">Shipping policy</a> · <a href="/policies/refund-policy/">Exchange policy</a></p></details></div></div></section>
      <section class="section wrap reviews" id="reviews" aria-labelledby="reviews-title" data-reviews="{text(product['handle'])}">
        <div class="reviews__head"><h2 id="reviews-title">Reviews</h2><p class="reviews__summary" data-reviews-summary>Loading reviews…</p></div>
        <div class="reviews__list" data-reviews-list></div>
        <details class="reviews__write"><summary class="button button-outline">Write a review</summary>
          <form class="review-form" action="/api/reviews" method="post" data-ajax-form>
            <input type="hidden" name="handle" value="{text(product['handle'])}">
            <fieldset class="star-input"><legend>Your rating</legend><div>{''.join(f'<label><input type="radio" name="rating" value="{n}" required><span aria-hidden="true">{icon("star")}</span><span class="visually-hidden">{n} star{"s" if n > 1 else ""}</span></label>' for n in range(5, 0, -1))}</div></fieldset>
            <label>Your name<input name="name" autocomplete="given-name" required maxlength="60"></label>
            <label>Your review<textarea name="body" rows="5" required minlength="10" maxlength="2000" placeholder="How did it fit, and how did you wear it?"></textarea></label>
            <input class="form-trap" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
            <button type="submit" class="button button-dark">Send review</button>
            <p class="form-status" role="status" aria-live="polite"></p>
            <p class="review-form__note">Reviews appear after they are checked. Your name is shown with your review.</p>
          </form></details>
      </section>
      <div class="buy-bar" data-buy-bar aria-hidden="true"><div class="buy-bar__info"><strong>{title}</strong><span data-buy-bar-price>{price(product)}</span></div><button type="button" class="button button-dark" data-buy-bar-add tabindex="-1">Add to bag</button></div>
      <section class="section wrap related-section"><div class="section-heading"><div><h2>You might also like</h2></div><a class="text-link" href="/collections/all/">Shop all {icon('arrow')}</a></div><div class="product-grid">{''.join(product_card(p,i) for i,p in enumerate([p for p in PRODUCTS if p['handle'] != product['handle']][:4]))}</div></section>
      <div class="tryon-layer" id="tryon-layer" hidden><div class="tryon-backdrop" data-tryon-close></div><section class="tryon-dialog" role="dialog" aria-modal="true" aria-labelledby="tryon-title" aria-describedby="tryon-description"><button type="button" class="icon-button tryon-close" data-tryon-close aria-label="Close virtual try-on">{icon('close')}</button><div class="tryon-copy"><h2 id="tryon-title">See it on <em>you.</em></h2><p id="tryon-description">Upload a clear, front-facing photo to preview the {title}. Your photo is sent to our try-on provider only when you choose Generate.</p><div class="tryon-source"><img src="{first_image(product)}" alt="{title}" data-tryon-garment><div><span>1. Your piece</span><strong>{title}</strong><small data-tryon-garment-note>Current product photo</small></div><div class="tryon-closeup" data-tryon-closeup role="img" aria-label="Fabric close-up of the {title}" style="--closeup:url({first_image(product)})"></div></div>{(f'<div class="tryon-colour" data-tryon-hue="{hue}">{colour_swatches("tryon", "2. Colour", first_image(product))}<p class="tryon-colour-note">Colour previews are illustrative; the {title} is made in its original colour.</p></div>') if hue is not None else '<p class="tryon-colour-note tryon-colour-note--plain"><span>2. Colour</span>This piece is shown as made. Photo colour previews work on clearly coloured pieces; the live fitting can preview any colour.</p>'}<label class="tryon-upload" for="tryon-person"><span>3. Your photo</span><strong data-tryon-file-label>Choose a photo</strong><small>JPG, PNG or WebP · front-facing · up to 15 MB</small></label><input id="tryon-person" class="tryon-file-input" data-tryon-file type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose your photo for virtual try-on"><p class="tryon-privacy">Your photo is used to create this preview and is not saved in this storefront. The provider may retain the generated image for up to one day. The preview is illustrative and does not determine size or fit. Daily previews are limited.</p><button type="button" class="button button-dark tryon-generate" data-tryon-generate disabled>Generate preview {icon('arrow')}</button><p class="tryon-status" data-tryon-status role="status" aria-live="polite"></p></div><div class="tryon-visual"><div class="tryon-result" data-tryon-result><div class="tryon-placeholder"><span>Virtual try-on</span><p>Your look appears here.</p></div></div><p class="tryon-hint" data-tryon-hint hidden>Drag across to compare with your photo. Hover to look closely at the fabric.</p><a class="button button-light tryon-download" data-tryon-download hidden download="ruchs-virtual-try-on.png">Download your look {icon('arrow')}</a></div></section></div>{live_modal}'''
    return page(product["title"], body, f"Explore the {product['title']} at Ruchs.")


CONTACT_FORM = f'''<form class="contact-form" action="/api/contact" method="post" data-ajax-form>
  <h2>Write to us</h2>
  <div class="contact-form__row"><label>Name<input name="name" autocomplete="name" required maxlength="120"></label><label>Email<input name="email" type="email" autocomplete="email" spellcheck="false" required maxlength="254"></label></div>
  <div class="contact-form__row"><label>Phone <small>(optional)</small><input name="phone" type="tel" autocomplete="tel" maxlength="30"></label><label>Order number <small>(optional)</small><input name="order" maxlength="40"></label></div>
  <label>Message<textarea name="message" rows="6" required minlength="5" maxlength="4000"></textarea></label>
  <input class="form-trap" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button type="submit" class="button button-dark">Send message {icon("arrow")}</button>
  <p class="form-status" role="status" aria-live="polite"></p>
  <p class="contact-form__note">Prefer email? Write to <a href="mailto:ruchsofficial@gmail.com">ruchsofficial@gmail.com</a>.</p>
</form>'''


def content_page(route: str, blocks: list[dict]) -> str:
    if route == "/pages/swym-wishlist":
        body = '<section class="page-intro wrap"><h1>Saved pieces</h1><p>Keep the pieces you love close.</p></section><section class="section wrap"><div class="product-grid" id="wishlist-grid"></div><p class="empty-results" id="wishlist-empty">Your wishlist is empty. <a href="/collections/all/">Explore the collection</a>.</p></section>'
        return page("Wishlist", body)
    if route == "/pages/womens-wear":
        return listing("all", DATA["collections"]["all"])
    title = next((b["text"] for b in blocks if b["tag"] == "h1"), route.split("/")[-1].replace("-", " ").title())
    elements = []
    stats = []
    for block in blocks:
        tag = block["tag"]
        value = block["text"].replace("�", "–")
        if tag != "stat" and stats:
            elements.append(f'<div class="article-stats">{"".join(stats)}</div>')
            stats = []
        if tag == "h1":
            continue
        if tag == "stat":
            stats.append(f'<p class="article-stat"><strong>{text(block["value"])}</strong><span>{text(value)}</span></p>')
        elif tag == "h3":
            elements.append(f'<h3>{text(value)}</h3>')
        elif tag == "h2":
            elements.append(f'<h2>{text(value)}</h2>')
        elif tag == "li":
            elements.append(f'<p class="article-list-item">{text(value)}</p>')
        elif tag == "p" and len(re.findall(r"SECTION \d+ - ", value)) > 1:
            # Long legal text captured as one paragraph: split at its own section titles, wording unchanged.
            titles = ["ACCESS AND ACCOUNT", "OUR PRODUCTS", "ORDERS", "PRICES AND BILLING", "SHIPPING AND DELIVERY", "INTELLECTUAL PROPERTY", "OPTIONAL TOOLS", "THIRD-PARTY LINKS", "RELATIONSHIP WITH SHOPIFY", "PRIVACY POLICY", "FEEDBACK", "ERRORS, INACCURACIES AND OMISSIONS", "PROHIBITED USES", "TERMINATION", "DISCLAIMER OF WARRANTIES", "LIMITATION OF LIABILITY", "INDEMNIFICATION", "SEVERABILITY", "WAIVER; ENTIRE AGREEMENT", "ASSIGNMENT", "GOVERNING LAW", "HEADINGS", "CHANGES TO TERMS OF SERVICE", "CONTACT INFORMATION"]
            parts = re.split(r"(SECTION \d+ - (?:" + "|".join(re.escape(t) for t in titles) + r"))", value)
            if parts[0].strip():
                elements.append(f'<p>{text(parts[0].strip())}</p>')
            for heading, body in zip(parts[1::2], parts[2::2]):
                elements.append(f'<h2>{text(heading.strip().title().replace("Section ", "Section "))}</h2><p>{text(body.strip())}</p>')
        else:
            elements.append(f'<p>{text(value)}</p>')
    if stats:
        elements.append(f'<div class="article-stats">{"".join(stats)}</div>')
    if route == "/pages/contact":
        elements.insert(0, CONTACT_FORM)
    if route == "/blogs/news" and len(elements) == 0:
        elements.append('<p>There are no published stories yet. Discover the collection while we prepare the next chapter.</p>')
    body = f'<section class="page-intro wrap"><h1>{text(title)}</h1></section><section class="article-section wrap"><div class="article-content">{"".join(elements)}</div></section>'
    if route == "/pages/about-us":
        shots = [BY_HANDLE[h] for h in ("ella-petal-set", "luna-burgundy-jumpsuit", "zoya-eclipse-dress")]
        mosaic = "".join(f'<a class="about-shot about-shot--{i}" href="/products/{p["handle"]}/" aria-label="View the {text(p["title"])}"><img {photo(p["images"][0]["src"], "(max-width: 700px) 100vw, 58vw" if i == 0 else "(max-width: 700px) 50vw, 40vw")} alt="{text(p["title"])}" loading="{"eager" if i == 0 else "lazy"}"></a>' for i, p in enumerate(shots))
        film = f'''<section class="about-film" aria-label="The Ruchs studio rail" data-window><video data-film data-window-film autoplay muted loop playsinline preload="metadata" poster="/media/wardrobe-poster.webp" aria-label="A close look along a rail of garments on wooden hangers"><source media="(max-width: 700px)" src="/media/wardrobe-mobile.mp4" type="video/mp4"><source src="/media/wardrobe-film.mp4" type="video/mp4"></video>
          <div class="about-film__copy wrap"><p>Ruchs by Ruchi Sachdeva</p><a class="button button-light" href="/collections/all/">Shop the collection {icon("arrow")}</a></div>
          <button type="button" class="sc-film-toggle about-film__toggle" data-film-toggle aria-label="Pause the film"><span class="sc-film-pause">{icon("pause")}</span><span class="sc-film-play">{icon("play")}</span></button></section>'''
        body = body.replace('</section><section class="article-section', f'</section><section class="about-mosaic wrap" aria-label="Ruchs pieces">{mosaic}</section><section class="article-section', 1) + film
    return page(title, body)


def not_found_page() -> str:
    links = ''.join(f'<a class="collection-chip" href="/collections/{slug}/">{label}</a>' for slug, label in COLLECTIONS[:5])
    body = f'''<section class="page-intro wrap not-found"><h1>We couldn’t find that page</h1><p>The link may be old, or the piece may no longer be listed. Search the collection or start from one of these.</p>
      <form class="search-page-form" action="/search/" role="search"><label for="not-found-search">Search the collection</label><div><input id="not-found-search" type="search" name="q" placeholder="Search dresses, sets, skirts…"><button type="submit" aria-label="Search">{icon("arrow")}</button></div></form>
      <div class="not-found-links"><a class="button button-dark" href="/collections/all/">Shop all pieces {icon("arrow")}</a>{links}</div></section>'''
    return page("Page not found", body, "This page could not be found at Ruchs.")


def search_page() -> str:
    body = f'<section class="page-intro wrap"><h1>Search the collection</h1><form class="search-page-form" action="/search/" role="search"><label for="search-query">What are you looking for?</label><div><input id="search-query" type="search" name="q" placeholder="Search dresses, sets, skirts…"><button type="submit" aria-label="Search">{icon("arrow")}</button></div></form></section><section class="section wrap"><p class="search-count" id="search-count"></p><h2 class="visually-hidden">Matching pieces</h2><div class="product-grid" id="search-grid">{"".join(product_card(p,i) for i,p in enumerate(PRODUCTS))}</div><p class="empty-results" id="search-empty" hidden>No pieces found. Try another search.</p></section>'
    return page("Search", body)


def write(route: str, markup: str) -> None:
    output = DIST / route.strip("/") / "index.html" if route != "/" else DIST / "index.html"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(markup, encoding="utf-8")


def main() -> None:
    prepare_catalog(DIST, PRODUCTS, DATA["category_images"])
    shutil.copyfile(ROOT / "scripts" / "remap.css", DIST / "remap.css")
    shutil.copyfile(ROOT / "scripts" / "tryon.css", DIST / "tryon.css")
    shutil.copyfile(ROOT / "scripts" / "remap.js", DIST / "remap.js")
    shutil.copyfile(ROOT / "scripts" / "motion.js", DIST / "motion.js")
    shutil.copyfile(ROOT / "scripts" / "addons.js", DIST / "addons.js")
    shutil.copyfile(ROOT / "scripts" / "motion.css", DIST / "motion.css")
    films_output = DIST / "static" / "films"
    films_output.mkdir(parents=True, exist_ok=True)
    for film in (ROOT / "assets" / "films").glob("*.*"):
        if film.suffix in {".mp4", ".webm"}:
            shutil.copyfile(film, films_output / film.name)
    grain = base64.b64encode((ROOT / "assets" / "react-bits" / "grain.webp").read_bytes()).decode("ascii")
    react_bits_css = (ROOT / "scripts" / "react-bits.css").read_text(encoding="utf-8")
    (DIST / "react-bits.css").write_text(react_bits_css.replace("__REACT_BITS_GRAIN__", f"data:image/webp;base64,{grain}"), encoding="utf-8")
    shutil.copyfile(ROOT / "scripts" / "react-bits.js", DIST / "react-bits.js")
    shutil.copyfile(ROOT / "third_party" / "REACT_BITS_LICENSE.md", DIST / "react-bits-license.txt")
    media_output = DIST / "static" / "media"
    media_output.mkdir(parents=True, exist_ok=True)
    for name in ("wardrobe-film.mp4", "wardrobe-mobile.mp4", "wardrobe-poster.webp"):
        shutil.copyfile(ROOT / "assets" / "media" / name, media_output / name)
    shutil.copyfile(ROOT / "scripts" / "tryon.js", DIST / "tryon.js")
    shutil.copyfile(ROOT / "scripts" / "recolour.js", DIST / "recolour.js")
    shutil.copyfile(ROOT / "scripts" / "live-tryon.css", DIST / "live-tryon.css")
    shutil.copyfile(ROOT / "scripts" / "live-tryon.js", DIST / "live-tryon.js")
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
    write("/404", not_found_page())
    print("Rendered home, collections, products, content pages, and search")


if __name__ == "__main__":
    from bs4 import BeautifulSoup
    main()
