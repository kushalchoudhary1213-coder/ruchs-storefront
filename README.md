# Ruchs storefront remap

A redesigned static storefront built from the public [Ruchs](https://www.ruchs.in/) catalog captured on 18 November 2026. The 20 products, collection membership, published information, and original photography are retained. The layout and interactions have been remade with an editorial visual system. The supplied Next.js template was the starting workspace; the deployed output is static HTML from `dist/`.

## Run locally

```powershell
npm run dev
```

Open <http://localhost:4173/>. Run `npm run build` to regenerate all pages from `data/content.json` and `dist/products.json`. This requires Python and `beautifulsoup4`.

The product pages, collections, search, wishlist, and informational routes are local. Cart and wishlist changes are saved in the browser. Shopify account, checkout, payments, and live inventory require the original store backend.
