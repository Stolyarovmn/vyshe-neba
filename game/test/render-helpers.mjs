// Общие помощники тестов рендера: заглушка 2D-контекста и поддельное хранилище ассетов.
import fs from 'node:fs';
import zlib from 'node:zlib';
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

/**
 * Проверка целостности PNG: подпись, контрольные суммы всех блоков, распаковка IDAT и размер данных.
 * Возвращает текст проблемы или null, если файл цел. Битые файлы браузер показывает пустыми без ошибки.
 */
export function pngProblem(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 33 || buffer.readUInt32BE(0) !== 0x89504e47) return 'нет подписи PNG';
  const idat = [];
  let colorType = -1;
  let bitDepth = 0;
  let interlace = 0;
  let width = 0;
  let height = 0;
  let offset = 8;
  let ended = false;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    if (offset + 12 + length > buffer.length) return `блок ${type} обрезан`;
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (zlib.crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== buffer.readUInt32BE(offset + 8 + length)) return `контрольная сумма блока ${type}`;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended) return 'нет блока IEND';
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat));
  } catch (error) {
    return `IDAT не распаковывается: ${error.message}`;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (channels && interlace === 0) {
    const expected = height * (1 + Math.ceil((width * channels * bitDepth) / 8));
    if (raw.length !== expected) return `размер данных ${raw.length} вместо ${expected}`;
  }
  return null;
}
