# Ruchs storefront remap

A redesigned storefront built from the public [Ruchs](https://www.ruchs.in/) catalog captured on 18 November 2026. The 20 products, collection membership, published information, and original photography are retained. The layout and interactions have been remade with an editorial visual system. Product pages include photo and live camera virtual try-on adapted from the sibling Drape project. The generated pages and same-origin APIs run on Cloudflare Workers.

The motion layer adapts React Bits `AnimatedContent`, `GlareHover`, and `SpotlightCard` patterns for the static storefront, and uses the supplied grain texture on the dark editorial panels. Animations respect reduced-motion preferences and have no runtime dependency on React. See [the React Bits license](third_party/REACT_BITS_LICENSE.md) for the attached package's terms and attribution.

The homepage also has an interactive 3D lookbook made from original Ruchs product photographs. It presents image panels in depth; it is not a 3D garment model or fit simulation. The campaign film is cropped and compressed from the Ruchs catalog's own woodland fashion video so its older embedded discount claim is excluded. The 8-second, muted clip loads near its section, pauses offscreen, has a manual play/pause control, and does not autoplay for visitors who prefer reduced motion. Cloudflare serves the video and poster as static assets from `dist/static`.

## Run locally

```powershell
npm run dev
```

Open <http://localhost:4173/>. Run `npm run build` to regenerate all pages, the Decart browser bundle, and `dist/server/index.js` from `data/content.json` and `dist/products.json`. This requires Python and `beautifulsoup4`. Set `GENLOOK_API_KEY` and `DECART_API_KEY` in your local environment for photo and live try-on. Configure the same keys as Cloudflare Worker secrets; permanent keys are never placed in browser code or the repository.

The photo try-on panel uses the currently selected Ruchs product photo as a worn-model garment reference. It resizes the customer's photo in the browser, sends it to the same-origin Worker, and displays a downloadable generated result. Photos are not saved by this storefront; Genlook is asked to retain the generated result for one day. A D1 quota limits this public demo to two attempts per visitor and five attempts across the site per UTC day, because each generation uses a Genlook credit. When Genlook returns HTTP 402, photo try-on pauses for 15 minutes and failed credit checks do not consume the quota.

The live panel uses Decart Lucy VTON 3.6 to transform the shopper's camera stream. The Worker uses `DECART_API_KEY` to mint a short-lived token restricted to this site's origin, one model, and a 30-second maximum session. The browser receives only that client token. Live sessions are limited to two per visitor and five across the site per UTC day; failed token requests are refunded. Camera tracks and the Decart connection stop when the panel closes, the timer expires, the page is hidden, or the camera disconnects. Decart charges per second of active generation. The Ruchs catalog uses model photos rather than isolated garment shots, so live garment fidelity may vary.

The product pages, collections, search, wishlist, and informational routes are local. Cart and wishlist changes are saved in the browser. Shopify account, checkout, payments, and live inventory require the original store backend.

## Cloudflare hosting

The public site is [ruchs-storefront-tryon-2026.kushal-ruchs-2026.workers.dev](https://ruchs-storefront-tryon-2026.kushal-ruchs-2026.workers.dev/). The Worker serves the generated storefront, redirects product imagery to the original public Ruchs CDN, and handles both try-on modes through a D1 quota database. Build and deploy with `npm run deploy:cloudflare`. The remote database `ruchs-tryon-quota` is bound as `DB`; apply `drizzle/0000_youthful_warbird.sql` to it before the first deployment. Set `GENLOOK_API_KEY` and `DECART_API_KEY` with `wrangler secret put` after deployment. Neither secret is stored in source control. Provider credits are separate from Cloudflare hosting.
