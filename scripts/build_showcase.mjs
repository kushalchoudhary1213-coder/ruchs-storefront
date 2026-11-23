import {build} from 'esbuild';
import {cp, mkdir, rm} from 'node:fs/promises';

const output = 'dist/static/showcase';
// Start clean, so files removed from assets (and old hashed chunks) never ship.
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
await cp('assets/showcase', output, {recursive: true});
await Promise.all([
  build({
    entryPoints: ['scripts/site-motion.js'],
    bundle: true,
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    target: 'es2020',
    minify: true,
    outdir: output,
  }),
  ...['shop.css', 'showcase.css', 'agency.css', 'frontier.css'].map(file => cp('scripts/' + file, output + '/' + file)),
]);
