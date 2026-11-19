import {build} from 'esbuild';
import {cp, mkdir} from 'node:fs/promises';

const output = 'dist/static/showcase';
await mkdir(output, {recursive: true});
await cp('assets/showcase', output, {recursive: true});
await Promise.all([
  cp('assets/react-bits/grain.webp', output + '/grain.webp'),
  build({
    entryPoints: ['scripts/showcase-motion.js', 'scripts/textile.js'],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    external: ['/showcase/textile.js'],
    minify: true,
    outdir: output,
  }),
  ...['shop.css', 'showcase.css', 'textile.css'].map(file => cp('scripts/' + file, output + '/' + file)),
]);
