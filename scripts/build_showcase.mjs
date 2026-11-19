import {build} from 'esbuild';
import {cp, mkdir} from 'node:fs/promises';

const output = 'dist/static/showcase';
await mkdir(output, {recursive: true});
await cp('assets/showcase', output, {recursive: true});
await Promise.all([
  build({
    entryPoints: ['scripts/showcase-motion.js'],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: true,
    outdir: output,
  }),
  ...['shop.css', 'showcase.css'].map(file => cp('scripts/' + file, output + '/' + file)),
]);
