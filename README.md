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

The photo try-on panel uses the currently selected Ruchs product photo as a worn-model garment reference. It resizes the customer's photo in the browser, sends it to the same-origin Worker, and displays a downloadable generated result. Photos are not saved by this storefront; Genlook is asked to retain the generated result for one day. A D1 quota limits this public demo to two attempts per visitor and five attempts across the site per UTC day, because each generation uses a Genlook credit. When Genlook returns HTTP 402, photo try-on pauses for 15 minutes and failed credit checks do not consume the quota.

The live panel uses Decart Lucy VTON 3.6 to transform the shopper's camera stream. The Worker uses `DECART_API_KEY` to mint a short-lived token restricted to this site's origin, one model, and a 30-second maximum session. The browser receives only that client token. Live sessions are limited to two per visitor and five across the site per UTC day; failed token requests are refunded. Camera tracks and the Decart connection stop when the panel closes, the timer expires, the page is hidden, or the camera disconnects. Decart charges per second of active generation. The Ruchs catalog uses model photos rather than isolated garment shots, so live garment fidelity may vary.

The product pages, collections, search, wishlist, and informational routes are local. Cart and wishlist changes are saved in the browser.

## Shopify and Shiprocket checkout

The Ruchs Shopify store (`frkcn3-hp.myshopify.com`, www.ruchs.in) is the commerce backend. Its Headless sales channel provides a Storefront API private token, stored as the Worker secret `SHOPIFY_STOREFRONT_TOKEN`. With it, `GET /api/inventory` serves live stock and prices for the catalog variants (cached for 60 seconds), and product pages and the bag use them in place of the build-time snapshot.

The bag offers two checkouts through `POST /api/checkout`. Both accept only known catalog variants, at most 10 of each and 20 lines, from the storefront's own origin.

- **Buy now** (`provider: "shiprocket"`) uses the store's Shiprocket (Fastrr) checkout. Without Shiprocket keys it fills the www.ruchs.in cart with the bag and opens that cart page, where the Shiprocket BUY NOW button completes the order. With `SHIPROCKET_CHECKOUT_API_KEY` and `SHIPROCKET_CHECKOUT_SECRET` set as Worker secrets, the Worker signs a Shiprocket headless checkout token and the Shiprocket popup opens on this site, falling back to the cart page if Shiprocket refuses it.
- **Shopify checkout** (`provider: "shopify"`) creates a cart through the Storefront API and opens Shopify checkout, where Razorpay takes payment. If the Storefront API is unavailable, a Shopify cart permalink opens the same checkout.

Orders, payments, refunds, and fulfilment are handled in Shopify admin and Shiprocket. The Worker never receives payment details.

## Cloudflare hosting

The public site is [myruchs.com](https://myruchs.com/). Cloudflare serves the generated storefront, locally optimized catalog images, fonts, and film. The Worker handles both try-on modes through a D1 quota database. Build and deploy with `npm run deploy:cloudflare`. The remote database `ruchs-tryon-quota` is bound as `DB`; apply `drizzle/0000_youthful_warbird.sql` to it before the first deployment. Set `GENLOOK_API_KEY` and `DECART_API_KEY` with `wrangler secret put` after deployment. Neither secret is stored in source control. Provider credits are separate from Cloudflare hosting.
