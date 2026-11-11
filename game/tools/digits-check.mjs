// Проверка реального шрифта барабанов HUD без браузера и сторонних пакетов.
// Запуск: node game/tools/digits-check.mjs
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createText } from '../src/ui/text.js';
import { glyphRows, textUnits } from '../src/ui/font-pixel.js';
import { altitude } from '../src/ui/skin/instruments.js';
import { computeLayout, hudLayout } from '../src/ui/layout.js';

class PixelCanvas {
  constructor(w = 0, h = 0) { this.width = w; this.height = h; }
  getContext() {
    this.data ??= new Uint8Array(this.width * this.height);
    const canvas = this;
    return {
      globalAlpha: 1, imageSmoothingEnabled: false,
      fillRect(x, y, w, h) {
        for (let yy = Math.max(0, y); yy < Math.min(canvas.height, y + h); yy++) {
          for (let xx = Math.max(0, x); xx < Math.min(canvas.width, x + w); xx++) canvas.data[yy * canvas.width + xx] = 1;
        }
      },
      drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) {
        assert.equal(sw, dw);
        assert.equal(sh, dh);
        for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
          if (src.data[(sy + y) * src.width + sx + x] && dx + x >= 0 && dx + x < canvas.width && dy + y >= 0 && dy + y < canvas.height) {
            canvas.data[(dy + y) * canvas.width + dx + x] = 1;
          }
        }
      },
    };
  }
}

globalThis.document = { createElement: () => new PixelCanvas() };
const text = createText();
const fonts = [];
// Настоящая altitude() выбирает размер и окна барабанов. Проверяем все неподвижные цифры.
const layouts = [[320, 640], [390, 844], [800, 600], [1280, 720]].map(([w, h]) => computeLayout(w, h));
for (const layout of layouts) for (const dpr of [1, 1.25, 2, 3]) for (const meters of [0, 18, 880, 99999, 188888]) {
  text.setDpr(dpr);
  const r = hudLayout(layout).instruments.alt;
  const width = r.w;
  const clips = [];
  const kit = {
    c: { white: '#ffffff', ink: '#111111', navy1: '#202020', amber: '#ffaa00', amberLight: '#ffffaa' },
    S: { skin: { instr: 'analog' } }, text,
    cell: () => layout.cell, fs: (size) => Math.round(size * layout.ui), nine() {}, lamp() {}, rect() {},
    pushClip: (r) => clips.push(r), popClip: () => clips.pop(),
    drawText(str, x, y, options) {
      if (!clips.length) return;
      const { css: scale, dev } = text.stepFor(options.size, options.minScale);
      const w = textUnits(str) * scale;
      const h = 7 * scale;
      const clip = clips.at(-1);
      const left = Math.round((x - w / 2) * dpr) / dpr;
      const top = Math.round((y - h / 2) * dpr) / dpr;
      assert.ok(left >= clip.x - 0.001 && left + w <= clip.x + clip.w + 0.001, `Цифра выходит по ширине: ${width}, ${str}, DPR ${dpr}`);
      // Во время прокрутки соседняя цифра закономерно уходит за окно барабана.
      if (Math.abs(y - (clip.y + clip.h / 2)) < 0.001) {
        assert.ok(top >= clip.y - 0.001 && top + h <= clip.y + clip.h + 0.001, `Цифра выходит по высоте: ${width}, ${str}`);
      }
      if (dpr === 1 && meters === 880 && !fonts.some((f) => f.size === options.size)) fonts.push(options);
    },
  };
  altitude(kit, r, {}, { alt: { value: String(meters) }, meters, unit: 'м' });
}
text.setDpr(1);

// 0, 6, 9 имеют один замкнутый просвет, 8 — два (связность по сторонам пикселей).
for (const [digit, expected] of [['0', 1], ['6', 1], ['8', 2], ['9', 1]]) {
  const rows = glyphRows(digit);
  const seen = new Set();
  let holes = 0;
  for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
    const key = y * 5 + x;
    if (rows[y][x] === '#' || seen.has(key)) continue;
    const queue = [[x, y]];
    seen.add(key);
    let edge = false;
    for (const [cx, cy] of queue) {
      if (cx === 0 || cx === 4 || cy === 0 || cy === 6) edge = true;
      for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
        const id = ny * 5 + nx;
        if (nx < 0 || nx >= 5 || ny < 0 || ny >= 7 || rows[ny][nx] === '#' || seen.has(id)) continue;
        seen.add(id);
        queue.push([nx, ny]);
      }
    }
    if (!edge) holes++;
  }
  assert.equal(holes, expected, `Просветы цифры ${digit}`);
}

const sample = '0123456789 18 880 м';
const width = textUnits(sample) * Math.max(...fonts.map((f) => f.size / 7)) + 16;
const height = fonts.reduce((sum, f) => sum + f.size + 12, 8);
const canvas = new PixelCanvas(width, height);
const ctx = canvas.getContext('2d');
let top = 8;
for (const font of fonts.sort((a, b) => a.size - b.size)) {
  text.draw(ctx, sample, 8, top + font.size / 2, { ...font, align: 'left' });
  top += font.size + 12;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const tag = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([size, tag, data, crc]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 2;
const pixels = Buffer.alloc(height * (width * 3 + 1));
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const lit = canvas.data[y * width + x];
  const offset = y * (width * 3 + 1) + 1 + x * 3;
  pixels.set(lit ? [238, 244, 238] : [17, 24, 30], offset);
}
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
const output = fileURLToPath(new URL('./_out/', import.meta.url));
await mkdir(output, { recursive: true });
await writeFile(`${output}/digits_check.png`, png);
console.log(`Цифры проверены: HUD E0, размеры ${fonts.map((f) => f.size).join(', ')} CSS px, маски 5×7, PNG ${width}×${height}`);
