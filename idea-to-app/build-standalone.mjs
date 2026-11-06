// Builds dist/from-idea-to-app.html: one self-contained file (code, three.js and fonts inlined)
// that opens straight from disk — no server, no network.
//   npm run build:standalone
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist', 'from-idea-to-app.html');

// 1. bundle src/main.js + three.js into a single ES module string
const result = await build({
  entryPoints: [path.join(ROOT, 'src', 'main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  write: false,
  legalComments: 'none',
  logLevel: 'warning',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// 2. start from index.html, swap font URLs for data URIs, drop the import map and module src
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/url\((node_modules\/[^)]+\.woff2)\)/g, (_, rel) => {
  const b64 = fs.readFileSync(path.join(ROOT, rel)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
const moduleTag = '<script type="module" src="./src/main.js"></script>';
if (!html.includes(moduleTag)) throw new Error('index.html: module script tag not found');
html = html.replace(moduleTag, () => `<script type="module">\n${js}\n</script>`);
if (/node_modules\/|src\/main\.js/.test(html)) throw new Error('standalone output still references external files');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`wrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024 / 1024).toFixed(2)} MB)`);
