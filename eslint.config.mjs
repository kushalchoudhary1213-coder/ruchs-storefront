import js from "@eslint/js";
import globals from "globals";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // Generated output and third-party theme files are not linted.
  globalIgnores(["dist/**", "shopify-theme/**", "node_modules/**", ".wrangler/**", ".claude/**"]),
  js.configs.recommended,
  {
    // Browser scripts served by the storefront.
    files: ["scripts/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "script", globals: { ...globals.browser } },
  },
  {
    files: ["scripts/showcase-motion.js", "scripts/decart-live-source.js"],
    languageOptions: { sourceType: "module" },
  },
  {
    // The Worker runs on Cloudflare; its bundle prepends page and catalog constants.
    files: ["worker/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.serviceworker, pages: "readonly", siteAssets: "readonly", productImages: "readonly", shopifyVariants: "readonly" },
    },
  },
  {
    // Node build scripts and tests.
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node } },
  },
]);
