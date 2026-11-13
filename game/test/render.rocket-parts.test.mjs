// Детали ракеты E0 (2026-11-13): посадочные опоры по уровню модуля и сопло кабины.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { LEG_SPRITES, drawLegPair, legSprite, stackParts } from '../src/render/rocket.js';
import { ASSET_FILES } from '../src/render/manifest.js';
import { fakeAssets, pngSize, repoRoot } from './render-helpers.mjs';

test('опоры: спрайт по уровню модуля, файлы есть, шарнир внутри спрайта', () => {
  const assets = fakeAssets();
  assert.equal(legSprite(0, assets), null, 'без опор ракета садится на срез сопла');
  for (let level = 1; level < LEG_SPRITES.length; level++) {
    const spec = legSprite(level, assets);
    assert.ok(spec, `ур. ${level}`);
    const file = path.join(repoRoot, ASSET_FILES[spec.name].file);
    assert.ok(fs.existsSync(file), `${spec.name}: файл есть`);
    const [w, h] = pngSize(file);
    assert.ok(w > 0 && h > 0);
    assert.ok(spec.hinge.every((v) => v >= 0 && v <= 1));
    if (level > 1) assert.ok(spec.h >= LEG_SPRITES[level - 1].h, 'опоры старшего уровня не меньше');
  }
});

test('опоры: сложенные не рисуются, раскрытые — пара, правая зеркально, низ на уровне среза сопла', () => {
  const spec = LEG_SPRITES[2];
  const asset = { w: 95, h: 109 };
  const calls = [];
  drawLegPair(spec, asset, 3, 0, (...args) => calls.push(args));
  assert.equal(calls.length, 0, 'сложены — убраны за обшивку');
  drawLegPair(spec, asset, 3, 1, (...args) => calls.push(args));
  assert.equal(calls.length, 2);
  const [left, right] = calls;
  assert.equal(left[7].flipX, false);
  assert.equal(right[7].flipX, true);
  assert.equal(left[7].angle === 0 || Object.is(left[7].angle, -0), true, 'раскрыты — без поворота');
  // шарнир выше опорной точки ровно настолько, что низ спрайта приходится на срез сопла (y = 0)
  const hingeY = left[2] / 3;
  assert.ok(Math.abs(hingeY + spec.h * (1 - spec.hinge[1])) < 0.5);
});

test('кабина после отделения стоит на своём сопле; в стеке сопла нет', () => {
  const assets = fakeAssets();
  const capsule = stackParts('capsule', assets, 0);
  assert.equal(capsule[0].base, 'nozzle');
  assert.equal(capsule[0].bottom, 0);
  assert.equal(capsule[1].base, 'capsule');
  assert.ok(capsule[1].bottom < 0, 'кабина выше сопла');
  assert.ok(!stackParts('core', assets, 0).some((p) => p.base === 'nozzle'));
  assert.ok(!stackParts('capsule', assets, 2).some((p) => p.base === 'nozzle'), 'у других эпох своего сопла пока нет');
});
