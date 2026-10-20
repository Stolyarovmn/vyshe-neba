// Общие помощники тестов рендера: заглушка 2D-контекста и поддельное хранилище ассетов.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssetStore } from '../src/render/assets.js';
import { ASSET_FILES, spriteAnchor, spriteSize } from '../src/render/manifest.js';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Заглушка CanvasRenderingContext2D: принимает любые вызовы и считает их. */
export function stubContext(width = 800, height = 600) {
  const calls = Object.create(null);
  const gradient = { addColorStop() {} };
  const state = { canvas: { width, height }, calls };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'getContext') return () => ctx;
      return (...args) => {
        calls[prop] = (calls[prop] || 0) + 1;
        return args.length && prop === 'getImageData' ? { data: new Uint8ClampedArray(4) } : undefined;
      };
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
  return ctx;
}

/** Фабрика «холстов» для кэша спрайтов в Node. */
export function makeStubCanvas(w, h) {
  const inner = stubContext(w, h);
  return { width: w, height: h, getContext: () => inner };
}

/**
 * Хранилище ассетов без картинок: у каждого логического имени есть запись нужного размера.
 * options.missing — имена, которых «нет» (чтобы проверить запасную отрисовку).
 */
export function fakeAssets(options = {}) {
  const missing = new Set(options.missing || []);
  const images = new Map();
  const jsons = new Map();
  for (const [name, spec] of Object.entries(ASSET_FILES)) {
    if (missing.has(name)) continue;
    if (typeof spec !== 'string' && spec.kind === 'json') {
      jsons.set(name, JSON.parse(fs.readFileSync(path.join(repoRoot, spec.file), 'utf8')));
      continue;
    }
    const [w, h] = spriteSize(name) || (name.startsWith('bld_') ? [48, 48] : name === 'island_start' ? [384, 166] : [64, 64]);
    images.set(name, { name, img: { width: w, height: h }, w, h, anchor: spriteAnchor(name) });
  }
  return createAssetStore(images, jsons, []);
}

export function pngSize(file) {
  const buffer = fs.readFileSync(file);
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
