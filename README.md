# Ruchs storefront clone

A static snapshot of the public [Ruchs](https://www.ruchs.in/) storefront, captured on 18 November 2026. It contains the original page markup, theme files, product imagery, and hero videos for 42 accessible routes. The supplied Next.js template was used as the starting workspace; static output is served from `dist/` to preserve the Shopify theme's appearance.

## Run locally

```powershell
npm run dev
```

Open <http://localhost:4173/>. To refresh the snapshot from the public storefront, run `npm run build` (requires Python, `requests`, and `beautifulsoup4`).

The product pages, collections, and informational routes are local. Cart changes are saved in the browser. Shopify account, checkout, payments, newsletter submission, and live inventory require the original store backend.
