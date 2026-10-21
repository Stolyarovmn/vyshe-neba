// Загрузчик ассетов и кэш предварительно уменьшенных спрайтов.
//
// Адрес файла: globalThis.__GAME_ASSETS__?.[путь] ?? '/' + путь. В dev файлы раздаёт статический
// сервер из корня репозитория, при сборке tools/build.mjs подставляет data:-адреса.

import { spriteAnchor } from './manifest.js';

export function defaultResolveUrl(path) {
  return globalThis.__GAME_ASSETS__?.[path] ?? `/${path}`;
}

function browserLoadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

async function browserLoadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Хранилище загруженных ассетов. Отсутствующий ассет — не ошибка: get() вернёт undefined. */
export function createAssetStore(images, jsons, errors) {
  return {
    errors,
    get(name) {
      return images.get(name);
    },
    has(name) {
      return images.has(name);
    },
    json(name) {
      return jsons.get(name);
    },
    names() {
      return [...images.keys()];
    },
    get size() {
      return images.size;
    },
  };
}

/**
 * Загружает все ассеты каталога. `manifest` — модуль manifest.js (или объект с ASSET_FILES).
 * options: { resolveUrl, loadImage, loadJson, onProgress(done,total), concurrency (по умолчанию 16) }.
 * Ошибки отдельных файлов собираются в store.errors, загрузка не прерывается.
 */
export async function loadAssets(manifest, options = {}) {
  const files = manifest.ASSET_FILES || manifest;
  const resolveUrl = options.resolveUrl || defaultResolveUrl;
  const loadImage = options.loadImage || browserLoadImage;
  const loadJson = options.loadJson || browserLoadJson;
  const images = new Map();
  const jsons = new Map();
  const errors = [];
  const entries = Object.entries(files);
  let done = 0;

  const loadOne = async ([name, spec]) => {
    const file = typeof spec === 'string' ? spec : spec.file;
    const kind = typeof spec === 'string' ? 'image' : spec.kind || 'image';
    try {
      const url = resolveUrl(file);
      if (kind === 'json') {
        jsons.set(name, await loadJson(url));
      } else {
        const img = await loadImage(url);
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        images.set(name, { name, img, w, h, anchor: spriteAnchor(name) });
      }
    } catch (error) {
      errors.push(`${name}: ${error.message}`);
    }
    done++;
    if (options.onProgress) options.onProgress(done, entries.length);
  };

  // Ограниченный параллелизм: сотни одновременных запросов переполняют очередь простых dev-серверов.
  const queue = entries.slice();
  const workers = Array.from({ length: Math.min(options.concurrency || 16, queue.length) }, async () => {
    while (queue.length) await loadOne(queue.shift());
  });
  await Promise.all(workers);
  return createAssetStore(images, jsons, errors);
}

/**
 * Кэш спрайтов, заранее уменьшенных до нужного размера в пикселях устройства.
 * Исходные PNG в несколько раз больше экранного размера: прямое уменьшение без сглаживания даёт
 * шумную картинку, а сглаженное — мыло. Один раз уменьшаем с хорошим фильтром и затем рисуем
 * без сглаживания, получая чёткий «пиксельный» спрайт нужного размера.
 */
export function defaultMakeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

export function createSpriteCache(makeCanvas) {
  const cache = new Map();
  const create = makeCanvas || defaultMakeCanvas;
  return {
    get size() {
      return cache.size;
    },
    clear() {
      cache.clear();
    },
    /** Спрайт `asset` ({img,w,h,name}), уменьшенный до w x h пикселей устройства. */
    scaled(asset, w, h) {
      const width = Math.max(1, Math.round(w));
      const height = Math.max(1, Math.round(h));
      // Увеличение и почти исходный размер — без предобработки.
      if (width >= asset.w && height >= asset.h) return asset.img;
      const key = `${asset.name}|${width}x${height}`;
      let entry = cache.get(key);
      if (!entry) {
        if (cache.size > 800) cache.clear();
        entry = create(width, height);
        const g = entry.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        drawProgressive(g, asset, width, height, create);
        cache.set(key, entry);
      }
      return entry;
    },
  };
}

/** Уменьшение ступенями не более чем вдвое: так фильтр браузера не пропускает пиксели. */
function drawProgressive(g, asset, width, height, create) {
  let srcW = asset.w;
  let srcH = asset.h;
  let source = asset.img;
  while (srcW > width * 2 || srcH > height * 2) {
    const nextW = Math.max(width, Math.ceil(srcW / 2));
    const nextH = Math.max(height, Math.ceil(srcH / 2));
    const step = create(nextW, nextH);
    const sg = step.getContext('2d');
    sg.imageSmoothingEnabled = true;
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(source, 0, 0, srcW, srcH, 0, 0, nextW, nextH);
    source = step;
    srcW = nextW;
    srcH = nextH;
  }
  g.drawImage(source, 0, 0, srcW, srcH, 0, 0, width, height);
}
