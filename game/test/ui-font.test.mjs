// Пиксельный шрифт: таблица глифов 5×7, прописные буквы вместо строчных, покрытие всех строк интерфейса и названий из data/,
// целый масштаб без дробных шагов, сегментные цифры.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GLYPH_CHARS, GLYPH_W, GLYPH_H, ADVANCE, glyphRows, hasGlyph, normalize, textUnits, segmentMetrics, segmentWidth } from '../src/ui/font-pixel.js';
import { createText, wrapWords } from '../src/ui/text.js';
import ru from '../src/i18n/ru.js';
import * as data from '../src/data/index.js';

test('таблица глифов: у каждого знака ровно 7 строк по 5 клеток, есть кириллица, латиница, цифры и знаки', () => {
  assert.equal(GLYPH_W, 5);
  assert.equal(GLYPH_H, 7);
  assert.ok(ADVANCE >= 6);
  for (const ch of GLYPH_CHARS) {
    const rows = glyphRows(ch);
    assert.equal(rows.length, 7, `${ch}: строк ${rows.length}`);
    for (const r of rows) assert.equal(r.length, 5, `${ch}: ширина строки «${r}»`);
  }
  for (const group of ['АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789', '.,:;!?-+×/%()«»°']) {
    for (const ch of group) assert.ok(hasGlyph(ch), `нет глифа «${ch}»`);
  }
});

test('строчные буквы показываются заглавными, типографские знаки приводятся к знакам таблицы', () => {
  assert.equal(normalize('Привет, мир'), 'ПРИВЕТ, МИР');
  assert.equal(normalize('ёжик'), 'ЁЖИК');
  assert.equal(normalize('a−b'), 'A-B');
  assert.equal(normalize('а…'), 'А...');
  assert.equal(textUnits(normalize('ААА')), textUnits(normalize('ааа')));
});

test('все строки ru.js и названия из data/ рисуются пиксельным шрифтом без пропусков', () => {
  const missing = new Map();
  const check = (src, str) => {
    for (const ch of normalize(String(str))) if (ch !== ' ' && !hasGlyph(ch) && ch !== '{' && ch !== '}') missing.set(ch, src);
  };
  for (const [k, v] of Object.entries(ru)) check(k, v);
  const walk = (obj, path) => {
    if (typeof obj === 'string') check(path, obj);
    else if (obj && typeof obj === 'object') for (const [k, v] of Object.entries(obj)) if (['name', 'desc', 'need', 'text', 'label'].includes(k) || typeof v === 'object') walk(v, `${path}.${k}`);
  };
  for (const key of Object.keys(data)) if (/^[A-Z_]+$/.test(key)) walk(data[key], key);
  assert.deepEqual([...missing.entries()], []);
});

test('масштаб шрифта целый: ширина — целое число шагов, шаг кратен пикселю устройства', () => {
  const text = createText();
  for (const dpr of [1, 1.5, 2, 3]) {
    text.setDpr(dpr);
    for (const size of [9, 11, 14, 18, 24, 40]) {
      const { dev, css } = text.stepFor(size);
      assert.ok(Number.isInteger(dev) && dev >= 1, `dpr ${dpr}, размер ${size}: ${dev}`);
      assert.ok(Math.abs(css * dpr - dev) < 1e-9);
      const w = text.measure('ПРИВЕТ', size);
      assert.ok(Math.abs(w / css - Math.round(w / css)) < 1e-9, 'ширина не кратна шагу');
    }
  }
  assert.equal(text.scaleFor(9), 1);
  assert.equal(text.scaleFor(14), 2);
  assert.equal(text.scaleFor(24), 3);
});

test('fit уменьшает масштаб не ниже ×2 и обрезает с многоточием, перенос укладывается по ширине', () => {
  const text = createText();
  text.setDpr(2);
  const r = text.fit('Очень длинная подпись кнопки', 120, 21);
  assert.ok(text.measure(r.str, r.size) <= 120 + 0.001, `${r.str} ${r.size}`);
  assert.ok(text.scaleFor(r.size) >= 2);
  const lines = text.wrap('Мягкая посадка и высота три километра', 150, 14);
  for (const ln of lines) assert.ok(text.measure(ln, 14) <= 150 + 0.001, ln);
  const long = wrapWords('Стабилизаторыиреактивнаясистема', 100, (s) => text.measure(s, 14));
  for (const ln of long) assert.ok(text.measure(ln, 14) <= 100 + 0.001);
});

test('сегментные цифры: ширина растёт с высотой и числом знаков', () => {
  const m = segmentMetrics(28);
  assert.ok(m.w > 0 && m.advance > m.w);
  assert.ok(segmentWidth('8888', 28) > segmentWidth('88', 28));
  assert.ok(segmentWidth('88', 40) > segmentWidth('88', 20));
  assert.ok(segmentWidth('1:05', 28) > segmentWidth('105', 28) * 0.7);
});
