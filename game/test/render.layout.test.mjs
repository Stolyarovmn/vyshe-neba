import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, ensureWorld, uiScale, worldPixelScale } from '../src/render/layout.js';

test('ориентация и масштаб интерфейса', () => {
  assert.equal(computeLayout(1280, 720, 1).orientation, 'landscape');
  assert.equal(computeLayout(390, 844, 3).orientation, 'portrait');
  assert.equal(uiScale(390, 844), 1);
  assert.equal(uiScale(1280, 720), 720 / 420);
  assert.equal(uiScale(3000, 2000), 3);
  assert.equal(uiScale(200, 300), 1);
});

test('безопасные зоны уменьшают внутреннюю область и сдвигают якорь', () => {
  const plain = computeLayout(844, 390, 2);
  const notch = computeLayout(844, 390, 2, { t: 0, r: 40, b: 20, l: 50 });
  assert.deepEqual(notch.safe, { t: 0, r: 40, b: 20, l: 50 });
  assert.equal(notch.inner.w, 844 - 90);
  assert.equal(notch.inner.h, 390 - 20);
  assert.ok(notch.rocketAnchor.x > plain.rocketAnchor.x);
});

test('якорь ракеты: портрет — нижняя треть по центру, ландшафт — левая треть', () => {
  const portrait = computeLayout(390, 844, 3);
  assert.equal(portrait.rocketAnchor.x, 195);
  assert.ok(portrait.rocketAnchor.y > 844 * 0.6 && portrait.rocketAnchor.y < 844 * 0.7);
  const landscape = computeLayout(1280, 720, 1);
  assert.ok(landscape.rocketAnchor.x > 1280 * 0.3 && landscape.rocketAnchor.x < 1280 * 0.36);
  assert.equal(landscape.rocketAnchorH.x, 640);
  assert.equal(portrait.rocketAnchorH.x, portrait.rocketAnchor.x);
});

test('масштаб мира всегда целый и не меньше 1', () => {
  for (const [w, h, dpr] of [[320, 568, 1], [390, 844, 3], [844, 390, 3], [1280, 720, 1], [1920, 1080, 1], [2560, 1440, 2], [800, 600, 1.25]]) {
    const layout = computeLayout(w, h, dpr);
    for (const px of [layout.world.px, layout.world.hubPx]) {
      assert.ok(Number.isInteger(px) && px >= 1, `${w}x${h}@${dpr}: ${px}`);
    }
  }
});

test('масштаб мира даёт сопоставимый обзор на телефоне и ПК', () => {
  const phone = computeLayout(390, 844, 3);
  assert.equal(phone.world.px, 3); // 390 единиц по ширине
  const desktop = computeLayout(1280, 720, 1);
  assert.equal(desktop.world.px, 2); // 360 единиц по высоте
  const landscapePhone = computeLayout(844, 390, 3);
  assert.equal(landscapePhone.world.px, 3);
});

test('ensureWorld достраивает масштаб для чужой раскладки', () => {
  const world = ensureWorld({ w: 1280, h: 720, dpr: 1 });
  assert.equal(world.px, worldPixelScale(1280, 720, 1, 'landscape', 'flight'));
  const own = { px: 5, hubPx: 6 };
  assert.equal(ensureWorld({ world: own }), own);
});
