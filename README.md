# Ruchs storefront remap

A redesigned storefront built from the public [Ruchs](https://www.ruchs.in/) catalog captured on 18 November 2026. The 20 products, collection membership, published information, and original photography are retained. The layout and interactions have been remade with an editorial visual system. Product pages include photo and live camera virtual try-on adapted from the sibling Drape project. The generated pages and same-origin APIs run on Cloudflare Workers.

The homepage opens with a silent, looping film of garments on a rail and a frosted card for one featured piece, followed by selected pieces, the red edit, the lookbook films, Our favourites in a coverflow, the try-on demo and a strip of categories. GSAP ScrollTrigger and Lenis coordinate scrolling. Visitors with reduced motion enabled see the same sections standing still, with Our favourites as a row to swipe.

The opening film uses the supplied 4K garment-rail footage, with separate desktop and phone encodes. It autoplays silently and loops without an on-page pause control.

## Run locally

The complete handoff includes the generated `dist/` storefront, source files, video assets, Cloudflare Worker, D1 migration, and test scripts. Copy `.env.example` to `.env.local` for local-only provider configuration. Never commit real provider keys.

```powershell
npm run dev
```

Open <http://localhost:4173/>. Run `npm run build` to regenerate all pages, the Decart browser bundle, and `dist/server/index.js` from `data/content.json` and `dist/products.json`. The build requires Node.js, Python, `beautifulsoup4`, and `Pillow`. Set `GENLOOK_API_KEY` and `DECART_API_KEY` in your local environment for photo and live try-on. Configure the same keys as Cloudflare Worker secrets; permanent keys are never placed in browser code or the repository.

Run `npm run check` to lint, type-check, build, and run every Worker test (`npm test`). Tests use a local SQLite database built from the same `drizzle/` migrations as production, so they need Node.js 22.5 or later.

The photo try-on panel uses the currently selected Ruchs product photo as a worn-model garment reference. It resizes the customer's photo in the browser, sends it to the same-origin Worker, and displays a downloadable generated result. Photos are not saved by this storefront; Genlook is asked to retain the generated result for one day. A D1 quota limits photo try-on to two attempts per visitor and five attempts across the site per UTC day by default, because each generation uses a Genlook credit. Raise or lower the limits without code changes by setting the Worker variables `TRYON_DAILY_LIMIT`, `TRYON_VISITOR_LIMIT`, `LIVE_DAILY_LIMIT`, and `LIVE_VISITOR_LIMIT` (in `wrangler.jsonc` under `vars`, or in the Cloudflare dashboard). When Genlook returns HTTP 402, photo try-on pauses for 15 minutes and failed credit checks do not consume the quota.

The live panel uses Decart Lucy VTON 3.6 to transform the shopper's camera stream. The Worker uses `DECART_API_KEY` to mint a short-lived token restricted to this site's origin, one model, and a 30-second maximum session. The browser receives only that client token. Live sessions are limited to two per visitor and five across the site per UTC day; failed token requests are refunded. Camera tracks and the Decart connection stop when the panel closes, the timer expires, the page is hidden, or the camera disconnects. Decart charges per second of active generation. The Ruchs catalog uses model photos rather than isolated garment shots, so live garment fidelity may vary.

The product pages, collections, search, wishlist, and informational routes are local. Cart and wishlist changes are saved in the browser.

## Try-on options

Photo try-on (Genlook) sends up to four photos of the piece and its description, and generates at 2K so weave, print and stitching show. 2K uses one extra Genlook credit per preview (2 instead of 1); set the Worker variable `TRYON_RESOLUTION` to `default` to go back to 1 credit. Genlook reproduces the photos it receives and has no colour option, so colour previews are made in the visitor's browser: `scripts/tryon.js` recolours the garment's own hue in the photos before upload, keeping its texture and folds. `scripts/garment_colour.py` decides at build time which pieces can be recoloured cleanly. Only clearly blue, purple or pink pieces qualify, so skin, hair and backgrounds never change colour. Other pieces are shown as made.

Live try-on (Decart) adds colour and fabric finish (satin, crepe, linen, velvet) to its prompt and can change them mid-session. Both try-ons say plainly that colours and finishes are a styling preview: each piece is made as shown in its photos. The preview colours are `TRYON_COLOURS` in `scripts/remap.py`, and the Worker accepts the same keys.

## Motion, films and credits

Motion runs from `scripts/site-motion.js` and `scripts/site-fx.js` (bundled to `/showcase/site-motion.js`), with styles in `scripts/agency.css` and `scripts/frontier.css`. It is built on open-source libraries: GSAP with its bundled ScrollTrigger, SplitText and Flip plugins, and Lenis (MIT). Everything stands still for visitors who ask for reduced motion.

Browser-native features: cross-document View Transitions move between pages and morph a product photo into its product page (the curtain and photo zoom remain for browsers without them), and speculation rules prefetch likely next pages. `scripts/addons.js` adds instant search (`/` or Ctrl+K), quick view on product cards, a full-screen photo viewer, recently viewed pieces (kept in the visitor's browser) and a back-to-top button whose ring fills through a CSS scroll-driven animation.

The motion follows a reference film of a luxury storefront, in Ruchs colours and type. Films sit in still windows (`[data-window]`): each film is fixed to the screen and clipped to its own section with `clip-path`, so the section before uncovers it and the panel after slides over it while the film stays put. These are the hero film, the red satin behind the red edit, the two lookbook films side by side, the about page film and the blush fabric behind page and collection titles. Films play only while their window is on screen, and the hero film stays paused if the visitor paused it. Around them the content rises in: selected pieces arrive in four columns at different speeds, the red edit pieces and the category tiles open upward one after another, and headings rise word by word. On product cards the second photo fades in, a quick-view bar slides up from the bottom of the photo and the heart appears in its corner. Our favourites is a coverflow: the section holds while scrolling turns it, the centre piece is large and named, its neighbours shrink and fade with their distance, and a side piece or the arrows turn it to that piece. Product-card photos settle as they scroll in (CSS view timelines) and accordions open smoothly (CSS size interpolation).

Product films in `assets/films/` are made from the catalog photos by `scripts/make_films.py`. Stock media is mood and texture only; it never stands in for a Ruchs piece. `scripts/make_stock.py` turns the downloaded originals into the files in `assets/showcase/`:

- Fabric textures (`assets/showcase/textures/`): Poly Haven, CC0. Crepe Satin, Crepe Georgette, Rough Linen, Faux Fur Geometric (polyhaven.com), as 640px tiles.
- Films (`assets/showcase/stock/`): Mixkit, Stock Video Free License. "Pink fabric moving in the wind" (40233, behind page and collection titles) and "Red wavy fabric texture" (40213, the red edit's satin window, encoded at 1280px) (mixkit.co). Colour-graded to the Ruchs palette.

Photos: the build saves every catalog photo twice, at up to 1120px and as a 560px copy (`scripts/catalog_media.py`). Cards, tiles, thumbnails and film posters use `srcset`, so phones and small slots load the small copy; the product page photo and the try-on demo use the full one.

## Catalog updates

Pages are generated from a snapshot of the Shopify catalog in `dist/products.json` and the collection lists in `data/content.json`; only stock and prices are live. After adding or editing products, photos, descriptions, or collections in Shopify, run `npm run sync:deploy`. It fetches the public catalog from the store (`npm run sync`), downloads new photos into `dist/cdn/shop/files`, rebuilds every page, and deploys.

## SEO, analytics and caching

The build (`scripts/build_worker.py`) adds a canonical URL, Open Graph and Twitter tags, and `Product` structured data (prices in INR, availability per variant) to every page, and serves `/sitemap.xml` and `/robots.txt`. Search and wishlist pages are `noindex`. Google Analytics 4 (`G-M0EHDZSDPJ`) and the Meta Pixel (`1412294113670313`), carried over from the ruchs.in theme, load on every page; the bag sends `add_to_cart`/`AddToCart` and `begin_checkout`/`InitiateCheckout` events, and the newsletter sends `sign_up`/`Lead`. Purchases are tracked on Shopify checkout by the store's Google and Meta apps.

Pages are served with `cache-control: no-cache`. Scripts and styles are referenced with a content hash (`/remap.js?v=…`) and cached for a year, so each deploy is visible immediately.

## Reviews and size guide

Product pages have a Reviews section. Shoppers submit a star rating, name and review (`POST /api/reviews`, with the same origin check, hidden trap field and daily limit as the other forms). Every review is stored in the D1 table `reviews` as `pending` and appears only after you approve it; the average rating then shows under the product title. Moderate with:

```bash
npx wrangler d1 execute ruchs-tryon-quota --remote --command "SELECT id, handle, rating, name, body FROM reviews WHERE status = 'pending'"
npx wrangler d1 execute ruchs-tryon-quota --remote --command "UPDATE reviews SET status = 'approved' WHERE id = 1"
npx wrangler d1 execute ruchs-tryon-quota --remote --command "UPDATE reviews SET status = 'rejected' WHERE id = 2"
```

The size guide under the size picker (`SIZE_CHART` in `scripts/remap.py`) is a standard Indian women's body-measurement chart, labelled as a general guide. Replace the values with Ruchs's own measurements when available and rebuild.

## Newsletter and contact messages

The footer newsletter (`POST /api/subscribe`) and the contact page form (`POST /api/contact`) store submissions in the D1 tables `subscribers` and `contact_messages`. Forms only accept requests from the site's own origin, silently drop submissions that fill a hidden trap field, and allow ten submissions per visitor per day. Read them with:

```bash
npx wrangler d1 execute ruchs-tryon-quota --remote --command "SELECT * FROM contact_messages ORDER BY id DESC LIMIT 20"
npx wrangler d1 execute ruchs-tryon-quota --remote --command "SELECT email, created_at FROM subscribers ORDER BY created_at DESC"
```

## Shopify checkout

The Ruchs Shopify store (`frkcn3-hp.myshopify.com`, www.ruchs.in) is the commerce backend. Its Headless sales channel provides a Storefront API private token, stored as the Worker secret `SHOPIFY_STOREFRONT_TOKEN`. With it, `GET /api/inventory` serves live stock and prices for the catalog variants (cached for 60 seconds), and product pages and the bag use them in place of the build-time snapshot.

The bag's Checkout button calls `POST /api/checkout`, which accepts only known catalog variants, at most 10 of each and 20 lines, from the storefront's own origin. It creates a cart through the Storefront API and opens Shopify checkout. If the Storefront API is unavailable, a Shopify cart permalink opens the same checkout. Shopify reports sold-out items back to the bag.

## Domains

ruchs.in and myruchs.com both run, side by side. www.ruchs.in is the Shopify store's primary domain with its own theme ("FV3<>Copy of Updated copy of Dwell[27-aug]", ID 192731316596) and Shiprocket checkout, exactly as before myruchs.com existed. myruchs.com is this Cloudflare storefront; its checkout opens Shopify checkout on www.ruchs.in. Customer accounts are at `shopify.com/93998121332/account`. The Worker redirects paths that have no myruchs.com page (`/cart`, `/products`, `/blogs`, `/account`).

On 20 November 2026 the store was briefly moved to myruchs.com (primary domain `checkout.myruchs.com`, ruchs.in redirected by the theme in `shopify-theme/`) and then restored. Left over from that move: `checkout.myruchs.com` stays connected in Shopify as an alias domain (Cloudflare DNS: CNAME `checkout` to `shops.myshopify.com`, DNS only), so browsers that cached the temporary redirects still reach the store; its pages carry www.ruchs.in canonical tags. The unpublished "myruchs redirect" theme (ID 196606296436) can be republished from `shopify-theme/` with `npx @shopify/cli@3 theme push --store frkcn3-hp.myshopify.com --path shopify-theme --theme 196606296436` if the move is ever repeated.

Payment methods come from Shopify's payment settings: Razorpay for UPI, cards, NetBanking and wallets, and Shopify's manual Cash on Delivery method. Orders, payments, refunds, and fulfilment are handled in Shopify admin. The Worker never receives payment details.

## Cloudflare hosting

The public site is [myruchs.com](https://myruchs.com/). Cloudflare serves the generated storefront, locally optimized catalog images, fonts, and film. The Worker handles both try-on modes through a D1 quota database. Build and deploy with `npm run deploy:cloudflare`. The remote database `ruchs-tryon-quota` is bound as `DB`. Schema changes go in `db/schema.ts`; run `npm run db:generate` and apply each new file with `npm run db:migrate:remote -- drizzle/<file>.sql` before deploying code that uses it (`0000` and `0001` are applied). Set `GENLOOK_API_KEY` and `DECART_API_KEY` with `wrangler secret put` after deployment. Neither secret is stored in source control. Provider credits are separate from Cloudflare hosting.
