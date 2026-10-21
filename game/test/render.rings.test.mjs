import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createPainter } from '../src/render/painter.js';
import { createView } from '../src/render/camera.js';
import { createCamera } from '../src/render/camera.js';
import { computeLayout } from '../src/render/layout.js';
import { createParticles } from '../src/render/particles.js';
import { applyEvents, createScreenFx } from '../src/render/events.js';
import { createRng } from '../src/render/util.js';
import { drawObjects, drawObjectsFront, ringCacheFor, warmRings } from '../src/render/objects.js';
import {
  ERA_SPECS, MASTER_HALF_WIDTH_PX, RING_EXTENT, TORUS, lampScreenPosition, masterSize, renderRingMaster,
} from '../src/render/ringart.js';
import {
  createRingCache, createRingFx, lampBrightness, ringAspect, ringSpriteWidth,
} from '../src/render/rings.js';
import { fakeAssets, makeStubCanvas, stubContext } from './render-helpers.mjs';

const masters = new Map();
function master(era) {
  if (!masters.has(era)) masters.set(era, renderRingMaster(era));
  return masters.get(era);
}

const alphaAt = (layer, width, x, y) => layer[(y * width + x) * 4 + 3];
const luminance = (layer, i) => 0.3 * layer[i] + 0.59 * layer[i + 1] + 0.11 * layer[i + 2];

test('мастер-текстура кольца: размеры по нормировке, поля вокруг тора, симметрия сверху и снизу', () => {
  const [width, height] = masterSize();
  assert.equal(width, (MASTER_HALF_WIDTH_PX + 3) * 2);
  assert.ok(height % 2 === 0 && height / width > 0.4 && height / width < 0.56, `пропорции ${height / width}`);
  for (let era = 0; era < 6; era++) {
    const m = master(era);
    assert.equal(m.width, width);
    assert.equal(m.height, height);
    assert.equal(m.back.length, width * height * 4);
    assert.equal(m.front.length, width * height * 4);
    let top = height;
    let bottom = -1;
    let left = width;
    let right = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (alphaAt(m.back, width, x, y) || alphaAt(m.front, width, x, y)) {
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      }
    }
    assert.ok(top >= 1 && left >= 1 && bottom <= height - 2 && right <= width - 2, `era ${era}: тор упирается в край текстуры`);
    assert.ok(Math.abs(top - (height - 1 - bottom)) <= 2, `era ${era}: поля сверху и снизу ${top}/${height - 1 - bottom}`);
    assert.ok(Math.abs(left - (width - 1 - right)) <= 1, `era ${era}: поля слева и справа`);
    // внешняя полуширина тора равна MASTER_HALF_WIDTH_PX (с точностью до пикселя)
    assert.ok(Math.abs((right - left + 1) / 2 - MASTER_HALF_WIDTH_PX) <= 2, `era ${era}: ширина тора ${(right - left + 1) / 2}`);
  }
});

test('кольцо: задняя и передняя половины не перекрываются, обе непусты, отверстие просвечивает', () => {
  const [width, height] = masterSize();
  for (let era = 0; era < 6; era++) {
    const m = master(era);
    let back = 0;
    let front = 0;
    for (let i = 0; i < width * height; i++) {
      const b = m.back[i * 4 + 3];
      const f = m.front[i * 4 + 3];
      assert.ok(b === 0 || f === 0, `era ${era}: пиксель ${i} в обоих слоях`);
      if (b) back++;
      if (f) front++;
    }
    assert.ok(back > 4000 && front > 4000, `era ${era}: слои ${back}/${front}`);
    assert.ok(front / (back + front) > 0.35 && front / (back + front) < 0.75, `era ${era}: доля передней половины`);
    assert.equal(alphaAt(m.back, width, width / 2, height / 2) + alphaAt(m.front, width, width / 2, height / 2), 0, `era ${era}: центр кольца должен быть пустым`);
    // за отверстием видна задняя труба: над центром есть пиксели заднего слоя
    let seenThrough = false;
    for (let y = 2; y < height / 2; y++) if (alphaAt(m.back, width, width / 2, y)) seenThrough = true;
    assert.ok(seenThrough, `era ${era}: задняя труба не видна`);
    // передняя половина перекрывает нижнюю часть отверстия
    let frontLow = false;
    for (let y = height / 2; y < height; y++) if (alphaAt(m.front, width, width / 2, y)) frontLow = true;
    assert.ok(frontLow, `era ${era}: нет передней трубы под центром`);
  }
});

test('кольцо: детерминировано, эпохи различаются, цвета эпох из палитры спрайта ring_ГОД', () => {
  const digest = (m) => crypto.createHash('sha256').update(Buffer.from(m.back.buffer)).update(Buffer.from(m.front.buffer)).digest('hex');
  assert.equal(digest(renderRingMaster(2)), digest(master(2)));
  const hashes = new Set();
  for (let era = 0; era < 6; era++) hashes.add(digest(master(era)));
  assert.equal(hashes.size, 6);
  const count = (era, test) => {
    const m = master(era);
    let n = 0;
    for (const layer of [m.back, m.front]) {
      for (let i = 0; i < layer.length; i += 4) if (layer[i + 3] && test(layer[i], layer[i + 1], layer[i + 2])) n++;
    }
    return n;
  };
  assert.ok(count(0, (r, g, b) => r > 190 && g > 110 && g < 190 && b < 110) > 800, '1978: оранжевые дуги');
  assert.ok(count(1, (r, g, b) => r > 190 && g < 80 && b < 80) > 1500, '1986: красная труба');
  assert.ok(count(2, (r, g, b) => b > 180 && g > 170 && r < 150) > 60, '1998: голубые светодиоды');
  assert.ok(count(3, (r, g, b) => r > 180 && g < 70 && b < 70) > 800, '2015: красные хомуты');
  assert.ok(count(4, (r, g, b) => b > 180 && g > 170 && r < 150) > 150, '2035: голубые огни');
  assert.ok(count(5, (r, g, b) => r > 180 && g > 120 && g < 200 && b < 120) > 500, '2060: золотые хомуты');
});

test('освещение: ключевой свет сверху-слева даёт более светлую левую-верхнюю половину трубы, чем правую-нижнюю', () => {
  const [width, height] = masterSize();
  for (let era = 0; era < 6; era++) {
    const m = master(era);
    let lit = 0;
    let litCount = 0;
    let dark = 0;
    let darkCount = 0;
    for (const layer of [m.back, m.front]) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          if (!layer[i + 3]) continue;
          // диагональ «сверху-слева» против «снизу-справа» относительно центра
          const side = (x - width / 2) / width * -1 + (y - height / 2) / height * -1;
          if (side > 0.12) {
            lit += luminance(layer, i);
            litCount++;
          } else if (side < -0.12) {
            dark += luminance(layer, i);
            darkCount++;
          }
        }
      }
    }
    assert.ok(lit / litCount > dark / darkCount, `era ${era}: свет ${(lit / litCount).toFixed(1)} против тени ${(dark / darkCount).toFixed(1)}`);
  }
});

test('кольцо: цветов немного (ступенчатая пиксельная раскраска, не градиент)', () => {
  for (const era of [0, 3, 5]) {
    const m = master(era);
    const colors = new Set();
    for (const layer of [m.back, m.front]) {
      for (let i = 0; i < layer.length; i += 4) if (layer[i + 3]) colors.add((layer[i] << 16) | (layer[i + 1] << 8) | layer[i + 2]);
    }
    assert.ok(colors.size < 130, `era ${era}: ${colors.size} цветов`);
    assert.ok(colors.size > 14, `era ${era}: слишком плоско (${colors.size})`);
  }
});

test('геометрия: размер соответствует halfWidth, пропорции вида сверху-сбоку, тор виден под небольшим углом', () => {
  assert.ok(TORUS.tilt > 0.25 && TORUS.tilt < 0.5);
  assert.ok(TORUS.tubeRadius * 2 < TORUS.ringRadius * 0.5, 'труба тоньше половины радиуса');
  assert.ok(TORUS.ringRadius * TORUS.tilt > TORUS.tubeRadius, 'отверстие видно сквозь тор');
  assert.ok(RING_EXTENT > TORUS.ringRadius && RING_EXTENT <= 1.04);
  const [w, h] = masterSize();
  for (const half of [55, 72, 85]) {
    assert.ok(Math.abs(ringSpriteWidth(half) - (w * half) / MASTER_HALF_WIDTH_PX) < 1e-9);
    // внешний размер тора на экране = 2 * halfWidth (граница засчитываемого пролёта)
    assert.ok(Math.abs(ringSpriteWidth(half) - 2 * half * (w / 2 / MASTER_HALF_WIDTH_PX)) < 1e-9);
  }
  assert.ok(Math.abs(ringAspect() - h / w) < 1e-12);
});

test('кэш колец: одна пара слоёв на эпоху, повторный запрос без перестроения, эпоха зажимается в 0..5', () => {
  const cache = createRingCache(makeStubCanvas);
  assert.equal(cache.size, 0);
  const a = cache.get(3);
  assert.equal(cache.size, 1);
  assert.equal(cache.get(3), a, 'тот же объект из кэша');
  assert.equal(cache.get(9), cache.get(5), 'эпоха выше 5 — как 5');
  assert.equal(cache.get(-4), cache.get(0));
  assert.equal(cache.size, 3);
  const [w, h] = masterSize();
  for (const layer of [a.back, a.front]) {
    assert.equal(layer.w, w);
    assert.equal(layer.h, h);
    assert.deepEqual(layer.anchor, [0.5, 0.5]);
    assert.ok(layer.img);
  }
  assert.notEqual(a.back.name, a.front.name);
  assert.equal(a.lamps.length, ERA_SPECS[3].lamps.length);
  cache.clear();
  assert.equal(cache.size, 0);
});

test('огни колец: координаты на трубе, яркость 0..1 и меняется во времени (мерцание, пульсация, бегущий огонь)', () => {
  const out = { x: 0, y: 0, front: false };
  for (let era = 0; era < 6; era++) {
    assert.ok(ERA_SPECS[era].lamps.length >= 2, `era ${era}: огней`);
    for (const lamp of ERA_SPECS[era].lamps) {
      lampScreenPosition(lamp, out);
      assert.ok(Math.abs(out.x) <= RING_EXTENT && Math.abs(out.y) < 0.6, `era ${era}: лампа вне кольца`);
      let min = 2;
      let max = -1;
      for (let t = 0; t < 8; t += 0.05) {
        const b = lampBrightness(lamp, t);
        assert.ok(b >= 0 && b <= 1);
        min = Math.min(min, b);
        max = Math.max(max, b);
      }
      assert.ok(max - min > 0.2, `era ${era}: огонь не меняется (${lamp.kind})`);
    }
  }
  const front = ERA_SPECS[3].lamps.find((l) => Math.abs(l.u - Math.PI / 2) < 1e-6);
  const back = ERA_SPECS[3].lamps.find((l) => Math.abs(l.u - (Math.PI * 3) / 2) < 1e-6);
  assert.equal(lampScreenPosition(front, {}).front, true);
  assert.equal(lampScreenPosition(back, {}).front, false);
  assert.ok(lampScreenPosition(front, {}).y < lampScreenPosition(back, {}).y, 'передний хомут ниже заднего');
});

test('вспышка пролёта: сила падает с offset, у центра золотая и шире, живёт ограниченное время, число ограничено', () => {
  const fx = createRingFx();
  fx.trigger({ x: 10, y: -300, halfWidth: 70, offset: 0.05, quality: 'center' }, 12, 3, false);
  fx.trigger({ x: 50, y: -400, halfWidth: 60, offset: 0.9, quality: 'edge' }, 55, 3, false);
  assert.equal(fx.ghosts.length, 2);
  assert.ok(fx.ghosts[0].power > fx.ghosts[1].power);
  assert.equal(fx.ghosts[0].quality, 'center');
  assert.equal(fx.ghosts[0].passX, 12);
  fx.update(0.2);
  assert.equal(fx.ghosts.length, 2);
  fx.update(1);
  assert.equal(fx.ghosts.length, 0, 'призраки исчезают');
  for (let i = 0; i < 20; i++) fx.trigger({ x: i, y: -i, halfWidth: 60, offset: 0.2, quality: 'edge' }, i, 1, false);
  assert.ok(fx.ghosts.length <= 8);
  const calm = createRingFx();
  calm.trigger({ x: 0, y: 0, halfWidth: 60, offset: 0, quality: 'center' }, 0, 1, true);
  const normal = createRingFx();
  normal.trigger({ x: 0, y: 0, halfWidth: 60, offset: 0, quality: 'center' }, 0, 1, false);
  assert.ok(calm.ghosts[0].life < normal.ghosts[0].life, 'при reduceMotion короче');
  calm.clear();
  assert.equal(calm.ghosts.length, 0);
});

test('событие ring: sim удаляет кольцо, поэтому вспышку запускает событие; при reduceMotion она короче', () => {
  const layout = computeLayout(1280, 720, 1);
  for (const reduceMotion of [false, true]) {
    const camera = createCamera();
    camera.snap({ x: 0, y: -10, vx: 0, vy: 0, alt: 10 }, layout);
    const ringFx = createRingFx();
    const env = {
      particles: createParticles(900), camera, fx: createScreenFx(), ringFx, era: 4, rng: createRng(3),
      flight: { x: 7, y: -300, vx: 0, vy: -60 }, body: 'earth', reduceMotion, spawnStage() {}, startChute() {}, markCrash() {},
    };
    applyEvents([{ type: 'ring', x: 10, y: -300, halfWidth: 70, offset: 0.1, dir: 'up', quality: 'center' }], env);
    assert.equal(ringFx.ghosts.length, 1);
    assert.equal(ringFx.ghosts[0].era, 4);
    assert.equal(ringFx.ghosts[0].passX, 7, 'вспышка идёт от места, где пролетела ракета');
    assert.equal(ringFx.ghosts[0].reduce, reduceMotion);
  }
});

test('отрисовка колец: задняя половина под ракетой, передняя поверх; ghost добавляет слои и рябь; без клипа', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  const ring = [{ id: 9, kind: 'ring', active: true, x: 0, y: -500, r: 35, orient: 'horizontal', halfWidth: 72 }];
  const back = stubContext(400, 600);
  drawObjects(back, painter, view, ring, 3, 1);
  const front = stubContext(400, 600);
  drawObjectsFront(front, painter, view, ring, 3, null, 1);
  assert.ok(back.calls.drawImage >= 1, 'задний слой + огни');
  assert.ok(front.calls.drawImage >= 1, 'передний слой + огни');
  assert.ok(!back.calls.clip && !front.calls.clip);
  assert.equal(ringCacheFor(painter).size, 1, 'мастер эпохи построен один раз для обеих половин');

  const fx = createRingFx();
  fx.trigger({ x: 0, y: -500, halfWidth: 72, offset: 0.1, quality: 'center' }, 3, 3, false);
  fx.update(0.1);
  const plain = stubContext(400, 600);
  drawObjects(plain, painter, view, [], 3, 1, null);
  const ghost = stubContext(400, 600);
  drawObjects(ghost, painter, view, [], 3, 1, fx);
  assert.ok((ghost.calls.drawImage || 0) >= 2 && !(plain.calls.drawImage || 0), 'призрак рисуется, даже когда кольца в sim уже нет');
  assert.ok(ghost.calls.ellipse >= 1 && ghost.calls.stroke >= 1, 'рябь по кромке');
  const ghostFront = stubContext(400, 600);
  drawObjectsFront(ghostFront, painter, view, [], 3, fx, 1);
  assert.ok(ghostFront.calls.drawImage >= 2);

  const calmFx = createRingFx();
  calmFx.trigger({ x: 0, y: -500, halfWidth: 72, offset: 0.1, quality: 'center' }, 3, 3, true);
  const calm = stubContext(400, 600);
  drawObjects(calm, painter, view, [], 3, 1, calmFx);
  assert.ok(!calm.calls.ellipse, 'при reduceMotion ряби нет');
  warmRings(painter, 5);
  assert.equal(ringCacheFor(painter).size, 2);
});

test('кольца не рисуются за кадром и неактивные; вертикальное кольцо без передней половины', () => {
  const painter = createPainter(fakeAssets(), makeStubCanvas);
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  const far = [{ id: 1, kind: 'ring', active: true, x: 5000, y: -500, r: 35, orient: 'horizontal', halfWidth: 60 }];
  const off = [{ id: 2, kind: 'ring', active: false, x: 0, y: -500, r: 35, orient: 'horizontal', halfWidth: 60 }];
  for (const list of [far, off]) {
    const ctx = stubContext(400, 600);
    drawObjects(ctx, painter, view, list, 2, 1);
    drawObjectsFront(ctx, painter, view, list, 2, null, 1);
    assert.equal(ctx.calls.drawImage || 0, 0);
  }
  const vertical = [{ id: 10, kind: 'ring', active: true, x: 0, y: -500, r: 35 }];
  const ctx = stubContext(400, 600);
  drawObjectsFront(ctx, painter, view, vertical, 2, null, 1);
  assert.equal(ctx.calls.drawImage || 0, 0);
});
