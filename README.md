# Ruchs storefront remap

A redesigned storefront built from the public [Ruchs](https://www.ruchs.in/) catalog captured on 18 November 2026. The 20 products, collection membership, published information, and original photography are retained. The layout and interactions have been remade with an editorial visual system. Product pages now include photo virtual try-on adapted from the sibling Drape project. The generated pages and a same-origin Genlook API run in a Sites Worker.

## Run locally

```powershell
npm run dev
```

Open <http://localhost:4173/>. Run `npm run build` to regenerate all pages and `dist/server/index.js` from `data/content.json` and `dist/products.json`. This requires Python and `beautifulsoup4`. Set `GENLOOK_API_KEY` in your local environment to enable photo try-on. Configure the same key as a secret in the hosted Site environment; it is never placed in browser code or the repository.

The try-on panel uses the currently selected Ruchs product photo as a worn-model garment reference. It resizes the customer's photo in the browser, sends it to the same-origin Worker, and displays a downloadable generated result. Photos are not saved by this storefront; Genlook is asked to retain the generated result for one day. A D1 quota limits this public demo to two attempts per visitor and five attempts across the Site per UTC day, because each generation uses a Genlook credit. The live camera mode from Drape is not included because it is designed for isolated garment images, while this catalog uses styled model photography.

The product pages, collections, search, wishlist, and informational routes are local. Cart and wishlist changes are saved in the browser. Shopify account, checkout, payments, and live inventory require the original store backend.
