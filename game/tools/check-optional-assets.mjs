import assert from 'node:assert/strict';
import { loadAssets } from '../src/render/assets.js';

const manifest = { ASSET_FILES: {
  required: 'required.png',
  present: { file: 'present.png', optional: true },
  missing: { file: 'missing.png', optional: true },
  missingJson: { file: 'missing.json', kind: 'json', optional: true },
} };
const previous = Object.getOwnPropertyDescriptor(globalThis, '__GAME_ASSETS__');
async function check(embedded, custom = false) {
  if (embedded) globalThis.__GAME_ASSETS__ = embedded;
  else delete globalThis.__GAME_ASSETS__;
  const requested = [];
  const progress = [];
  const load = async (url) => {
    requested.push(url);
    if (url.includes('missing')) throw new Error('Нет файла');
    return { width: 2, height: 3 };
  };
  const store = await loadAssets(manifest, {
    loadImage: load, loadJson: load,
    ...(custom ? { resolveUrl: (path) => `custom:${path}` } : {}),
    onProgress: (done, total) => progress.push([done, total]),
  });
  assert.equal(store.size, embedded && !custom && !('present.png' in embedded) ? 1 : 2);
  assert.deepEqual(store.errors, []);
  assert.deepEqual(progress.at(-1), [4, 4]);
  assert.equal(progress.length, 4);
  return requested.sort();
}
try {
  const embedded = { 'required.png': 'data:required', 'present.png': 'data:present' };
  assert.deepEqual(await check(embedded), ['data:present', 'data:required']);
  assert.deepEqual(await check(null), ['/missing.json', '/missing.png', '/present.png', '/required.png']);
  assert.deepEqual(await check(embedded, true), ['custom:missing.json', 'custom:missing.png', 'custom:present.png', 'custom:required.png']);
  assert.deepEqual(await check({}), ['/required.png']);
  console.log('Проверено: встроенный optional пропускается, dev и свой resolveUrl запрашивают его; обязательный файл запрашивается всегда.');
} finally {
  if (previous) Object.defineProperty(globalThis, '__GAME_ASSETS__', previous);
  else delete globalThis.__GAME_ASSETS__;
}
