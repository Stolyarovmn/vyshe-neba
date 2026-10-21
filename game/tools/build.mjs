// Собирает игру в один автономный HTML: код бандлится esbuild, ассеты встраиваются как data:-адреса.
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const gameDir = path.join(root, 'game');
const outFile = path.join(gameDir, 'dist', 'vyshe-neba.html');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json' };

async function collectAssetPaths() {
  const manifest = await import(pathToFileURL(path.join(gameDir, 'src', 'render', 'manifest.js')).href);
  const files = manifest.ASSET_FILES || {};
  return [...new Set(Object.values(files).map((f) => (typeof f === 'string' ? f : f.file)))];
}

async function embedAssets(paths) {
  const table = {};
  for (const rel of paths) {
    const data = await readFile(path.join(root, rel));
    const mime = MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream';
    table[rel] = `data:${mime};base64,${data.toString('base64')}`;
  }
  return table;
}

const bundle = await build({
  entryPoints: [path.join(gameDir, 'src', 'main.js')],
  bundle: true,
  write: false,
  format: 'iife',
  target: ['es2022'],
  minify: process.argv.includes('--minify'),
  legalComments: 'none',
  logLevel: 'warning',
});
const code = bundle.outputFiles[0].text;

let assets = {};
try {
  assets = await embedAssets(await collectAssetPaths());
} catch (err) {
  console.warn(`Ассеты не встроены: ${err.message}`);
}

const template = await readFile(path.join(gameDir, 'index.html'), 'utf8');
const html = template.replace(
  '<script type="module" src="./src/main.js"></script>',
  () => `<script>globalThis.__GAME_ASSETS__=${JSON.stringify(assets)};</script>\n<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`,
);

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, html);
const sha = createHash('sha256').update(html).digest('hex');
await writeFile(`${outFile}.sha256`, `${sha}  vyshe-neba.html\n`);
console.log(`Собрано: ${path.relative(root, outFile)} (${(html.length / 1048576).toFixed(1)} МБ, ${Object.keys(assets).length} ассетов, sha256 ${sha.slice(0, 12)})`);
