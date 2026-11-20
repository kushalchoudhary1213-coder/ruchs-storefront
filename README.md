# Ruchs storefront remap

A redesigned storefront built from the public [Ruchs](https://www.ruchs.in/) catalog captured on 18 November 2026. The 20 products, collection membership, published information, and original photography are retained. The layout and interactions have been remade with an editorial visual system. Product pages include photo and live camera virtual try-on adapted from the sibling Drape project. The generated pages and same-origin APIs run on Cloudflare Workers.

The homepage opens with a silent, looping film of garments on a rail, followed by selected Ruchs products and a shoppable lookbook. GSAP ScrollTrigger and Lenis coordinate desktop scrolling. On phones and tablets, vertical scrolling moves the lookbook horizontally. Visitors with reduced motion enabled can swipe through a native horizontal gallery.

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

## Catalog updates

Pages are generated from a snapshot of the Shopify catalog in `dist/products.json` and the collection lists in `data/content.json`; only stock and prices are live. After adding or editing products, photos, descriptions, or collections in Shopify, run `npm run sync:deploy`. It fetches the public catalog from the store (`npm run sync`), downloads new photos into `dist/cdn/shop/files`, rebuilds every page, and deploys.

## SEO, analytics and caching

The build (`scripts/build_worker.py`) adds a canonical URL, Open Graph and Twitter tags, and `Product` structured data (prices in INR, availability per variant) to every page, and serves `/sitemap.xml` and `/robots.txt`. Search and wishlist pages are `noindex`. Google Analytics 4 (`G-M0EHDZSDPJ`) and the Meta Pixel (`1412294113670313`), carried over from the ruchs.in theme, load on every page; the bag sends `add_to_cart`/`AddToCart` and `begin_checkout`/`InitiateCheckout` events, and the newsletter sends `sign_up`/`Lead`. Purchases are tracked on Shopify checkout by the store's Google and Meta apps.

Pages are served with `cache-control: no-cache`. Scripts and styles are referenced with a content hash (`/remap.js?v=…`) and cached for a year, so each deploy is visible immediately.

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
