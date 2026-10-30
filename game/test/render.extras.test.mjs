// Подключённый арт: облака по видам, материалы астероидов, шары из частей, города и базы на дальнем плане,
// магнит, площадки крайних эпох, фон launch-earth по эпохам, целостность новых файлов.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createPainter } from '../src/render/painter.js';
import { createView } from '../src/render/camera.js';
import { createMapView } from '../src/render/islandmap.js';
import { CLOUD_SPRITE_BY_KIND, cloudSize, cloudSpriteName, cloudTint, drawCloudField } from '../src/render/clouds.js';
import {
  SPACE_ALT_UNITS, balloonRig, balloonSwing, drawObjects, rockMaterial,
} from '../src/render/objects.js';
import {
  OUTPOST_DISTANCE, OUTPOST_PARALLAX, drawTerrain, outpostPlacement,
} from '../src/render/ground.js';
import {
  FIELD_ALPHA, FIELD_LOOPS, FIELD_PERIOD, FIELD_PULSE, FIELD_SEGMENTS, MAGNET_CENTER_OFFSET, MAGNET_RADIUS, drawMagnetField, fieldAlpha,
  fieldColor, fieldPoint, fieldPulse, magnetActive, magnetCenter, magnetRadius,
} from '../src/render/magnet.js';
import { backdropCell, createBackdrop } from '../src/render/backdrop.js';
import {
  ASSET_FILES, BACKDROP_ATLAS, BALLOON_FULL_SIZES, BALLOON_PART_BOXES, BALLOON_PART_SIZES, CONSUMABLE_SPRITES, ERA_SPRITES, ERA_YEARS,
  PAD_EXTREME_ANCHOR_Y, RUNTIME_SPRITE_PATTERN, outpostSpriteName, padLandingAnchor, padSpriteName, spriteAnchor,
  spriteName, spriteSize, worldSpriteFile,
} from '../src/render/manifest.js';
import { SPACE_ALT } from '../src/sim/bodies.js';
import { MAGNET_BONUS, PICKUP_RADIUS } from '../src/sim/pickups.js';
import { ROCKET_AXIS_OFFSET } from '../src/sim/rocket.js';
import {
  fakeAssets, makeStubCanvas, pngProblem, pngSize, repoRoot, stubContext,
} from './render-helpers.mjs';

const fileOf = (spec) => (typeof spec === 'string' ? spec : spec.file);

function setup(options) {
  const painter = createPainter(fakeAssets(options), makeStubCanvas);
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  return { painter, view, ctx: stubContext(400, 600) };
}

/** Painter-обёртка, записывающая имена спрайтов, которые просили нарисовать. */
function recordingPainter(options) {
  const painter = createPainter(fakeAssets(options), makeStubCanvas);
  const names = [];
  const original = painter.sprite.bind(painter);
  painter.sprite = (ctx, view, name, ...rest) => {
    names.push(name);
    return original(ctx, view, name, ...rest);
  };
  return { painter, names };
}

// --- манифест и файлы -------------------------------------------------------------------------------

test('новые спрайты в каталоге: базы, магниты, части шаров, площадки крайних эпох, фон базы', () => {
  for (const base of ['magnet', 'outpost_moon', 'outpost_mars']) {
    assert.ok(ERA_SPRITES.includes(base), base);
    for (const year of ERA_YEARS) assert.ok(ASSET_FILES[`${base}_${year}`], `${base}_${year}`);
  }
  for (const name of ['pad_moon_early', 'pad_moon_future', 'pad_mars_early', 'pad_mars_future', 'backdrop_base']) {
    assert.ok(ASSET_FILES[name], name);
  }
  for (const year of ERA_YEARS) {
    for (const part of ['envelope', 'pod']) assert.ok(ASSET_FILES[`balloon_${year}_${part}`], `balloon_${year}_${part}`);
  }
  assert.deepEqual(CONSUMABLE_SPRITES, { magnet: 'magnet' });
  assert.equal(spriteName(CONSUMABLE_SPRITES.magnet, 3), 'magnet_2015');
});

test('новые файлы целы, размеры в манифесте равны размерам PNG, части шаров совпадают с art/balloon-parts.json', () => {
  const names = Object.keys(ASSET_FILES).filter((name) => /^(magnet|outpost_moon|outpost_mars|balloon)_/.test(name) || /^pad_(moon|mars)_(early|future)$/.test(name));
  assert.ok(names.length >= 6 + 12 + 12 + 4);
  for (const name of names) {
    const file = path.join(repoRoot, fileOf(ASSET_FILES[name]));
    assert.equal(pngProblem(file), null, `${name}: повреждён`);
    assert.deepEqual(pngSize(file), spriteSize(name), `${name}: размер`);
  }
  const parts = JSON.parse(fs.readFileSync(path.join(repoRoot, 'art', 'balloon-parts.json'), 'utf8'));
  ERA_YEARS.forEach((year, era) => {
    for (const part of ['envelope', 'pod']) {
      const box = parts[`balloon_${year}_${part}`].box;
      BALLOON_PART_BOXES[part][era].forEach((value, i) => assert.ok(Math.abs(value - box[i]) < 1e-3, `${part} ${year} box[${i}]`));
      assert.deepEqual(BALLOON_PART_SIZES[part][era], pngSize(path.join(repoRoot, fileOf(ASSET_FILES[`balloon_${year}_${part}`]))));
    }
  });
});

test('фон базы по эпохам: webp цел, сетка 3x2 по размеру, launch-earth берёт кадр по эпохе', () => {
  const file = path.join(repoRoot, fileOf(ASSET_FILES.backdrop_base));
  assert.ok(file.endsWith('.webp') && fs.statSync(file).size > 100000 && fs.statSync(file).size < 800000);
  const data = fs.readFileSync(file);
  assert.equal(data.toString('latin1', 0, 4), 'RIFF');
  assert.equal(data.toString('latin1', 8, 12), 'WEBP');
  assert.deepEqual(BACKDROP_ATLAS.backdrop_base, { size: [1774, 887], grid: [3, 2] });
  const cells = new Set();
  for (let era = 0; era < 6; era++) {
    const cell = backdropCell('launch-earth', era);
    assert.equal(cell.atlas, 'backdrop_base');
    cells.add(`${cell.col},${cell.row}`);
  }
  assert.equal(cells.size, 6, 'шесть разных кадров');
  // без панорамы рисуется прежний общий кадр environments, а с ней — кадр эпохи
  const withBase = setup();
  const withoutBase = setup({ missing: ['backdrop_base'] });
  const rect = { x: 0, y: 0, w: 390, h: 400 };
  const a = [];
  const b = [];
  for (const [env, log] of [[withBase, a], [withoutBase, b]]) {
    const draw = env.ctx.drawImage;
    env.ctx.drawImage = (...args) => {
      log.push(args);
      return draw(...args);
    };
    assert.equal(createBackdrop(env.painter).draw(env.ctx, { kind: 'launch-earth', era: 4, rect, time: 0, dim: 0 }), true);
  }
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.notDeepEqual(a[0].slice(1, 5), b[0].slice(1, 5), 'источник другой: кадр эпохи против общего');
});

test('площадки крайних эпох: early для E0, future для E5, точка касания измерена по файлам', () => {
  for (const base of ['pad_moon', 'pad_mars']) {
    assert.equal(padSpriteName(base, 0), `${base}_early`);
    assert.equal(padSpriteName(base, 5), `${base}_future`);
    assert.equal(padSpriteName(base, 99), `${base}_future`);
    assert.equal(padSpriteName(base, -4), `${base}_early`);
    for (let era = 1; era <= 4; era++) assert.equal(padSpriteName(base, era), `${base}_${ERA_YEARS[era]}`);
    for (const which of ['early', 'future']) {
      const name = `${base}_${which}`;
      assert.deepEqual(spriteAnchor(name), [0.5, PAD_EXTREME_ANCHOR_Y[base][which]]);
      // измерение как в tools/build-world-manifest.py: медиана первой непрозрачной строки по центральным колонкам
      const png = fs.readFileSync(path.join(repoRoot, fileOf(ASSET_FILES[name])));
      assert.ok(png.length > 1000);
      assert.ok(PAD_EXTREME_ANCHOR_Y[base][which] > 0.2 && PAD_EXTREME_ANCHOR_Y[base][which] < 0.5);
    }
    assert.equal(padLandingAnchor(base, 0), PAD_EXTREME_ANCHOR_Y[base].early);
    assert.equal(padLandingAnchor(base, 5), PAD_EXTREME_ANCHOR_Y[base].future);
  }
  // E0 и E5 в луне и на Марсе действительно рисуются другими спрайтами
  for (const [body, era, expected] of [['moon', 0, 'pad_moon_early'], ['moon', 5, 'pad_moon_future'], ['mars', 0, 'pad_mars_early'], ['mars', 5, 'pad_mars_future'], ['moon', 3, 'pad_moon_2015']]) {
    const { painter, names } = recordingPainter();
    const view = createView().setStatic(0, -50, 200, 300, 2, 600, 400);
    drawTerrain(stubContext(600, 400), painter, view, body, era, { x: 0, w: 170 }, 1);
    assert.ok(names.includes(expected), `${body} E${era}: ${names.join()}`);
  }
});

// --- облака ------------------------------------------------------------------------------------------

test('облака: у каждого вида свой готовый спрайт nature_sheet, грозовое тёмное без тонировки кодом', () => {
  assert.deepEqual(CLOUD_SPRITE_BY_KIND, { cumulus: 'cloud_0', stratus: 'cloud_1', storm: 'cloud_2', cirrus: 'cloud_3' });
  for (const [kind, sprite] of Object.entries(CLOUD_SPRITE_BY_KIND)) assert.equal(cloudSpriteName({ id: 1, kind }), sprite, kind);
  assert.equal(cloudSpriteName({ id: 2, kind: 'cumulus', storm: true }), 'cloud_2', 'флаг storm переключает на грозовое');
  assert.equal(cloudSpriteName({ id: 3, kind: 'nonsense' }), 'cloud_0');
  // имя не зависит от id (раньше выбиралось по хешу)
  for (let id = 0; id < 20; id++) assert.equal(cloudSpriteName({ id, kind: 'stratus' }), 'cloud_1');
});

test('облака: тонировка только по плотности, мягкая и не заливает грозовое поверх готового рисунка', () => {
  assert.equal(cloudTint({ kind: 'cumulus', density: 0.3 }), null);
  assert.equal(cloudTint({ kind: 'storm', density: 0.5 }), null);
  const dense = cloudTint({ kind: 'cumulus', density: 1 }, { r: 0, g: 0, b: 0, a: 0 });
  assert.ok(dense && dense.a > 0.15 && dense.a <= 0.3);
  const storm = cloudTint({ kind: 'storm', density: 1, storm: true }, { r: 0, g: 0, b: 0, a: 0 });
  assert.ok(storm && storm.a <= 0.31 && storm.a > 0.2, `гроза ${storm && storm.a}`);
  assert.ok(cloudTint({ kind: 'cumulus', density: 0.8 }).a < cloudTint({ kind: 'cumulus', density: 1 }).a, 'плотнее — темнее');
  // готовые спрайты не сплющиваются сильнее, чем нужно виду
  const aspect = 0.5;
  for (const kind of ['cumulus', 'stratus', 'cirrus', 'storm']) {
    for (const [w, h] of [[300, 0], [900, 20], [2400, 15], [600, 400]]) {
      const [rw, rh] = cloudSize({ kind, w, h }, aspect);
      assert.equal(rw, w);
      assert.ok(rh / rw >= 0.13 && rh / rw <= 1.16, `${kind} ${w}x${h}: ${rh / rw}`);
    }
  }
});

test('облака рисуются спрайтами своего вида и не требуют тонировки для грозовых', () => {
  const { painter, names } = recordingPainter();
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  const clouds = [
    { id: 1, kind: 'cumulus', x: 0, alt: 500, w: 200, h: 0, density: 0.5, storm: false, vx: 0 },
    { id: 4, kind: 'stratus', x: 0, alt: 480, w: 500, h: 0, density: 0.4, storm: false, vx: 0 },
    { id: 7, kind: 'storm', x: 0, alt: 540, w: 300, h: 0, density: 0.5, storm: true, vx: 0 },
    { id: 9, kind: 'cirrus', x: 0, alt: 520, w: 400, h: 0, density: 0.2, storm: false, vx: 0 },
  ];
  const ctx = stubContext(400, 600);
  drawCloudField(ctx, painter, view, clouds, 0, 1, 0, 0);
  drawCloudField(ctx, painter, view, clouds, 1, 1, 0, 0);
  for (const sprite of Object.values(CLOUD_SPRITE_BY_KIND)) assert.ok(names.includes(sprite), sprite);
  assert.equal(new Set(names).size, 4);
});

// --- астероиды ---------------------------------------------------------------------------------------

test('астероиды: Луна серая, Марс красный, космос железный или ледяной, атмосфера по seed', () => {
  assert.equal(SPACE_ALT_UNITS, SPACE_ALT, 'граница космоса совпадает с sim');
  const atmosphere = new Set();
  const space = new Set();
  for (let id = 1; id <= 200; id++) {
    assert.equal(rockMaterial({ id, y: -6000 }, 'moon'), 0);
    assert.equal(rockMaterial({ id, y: -300 }, 'mars'), 2);
    assert.equal(rockMaterial({ id, y: -20000 }, 'moon'), 0, 'на Луне материал не зависит от высоты');
    atmosphere.add(rockMaterial({ id, y: -6000 }, 'earth'));
    space.add(rockMaterial({ id, y: -12000 }, 'earth'));
    assert.equal(rockMaterial({ id, y: -6000 }, 'earth'), rockMaterial({ id, y: -6000 }, 'earth'), 'детерминированно');
  }
  assert.deepEqual([...space].sort(), [1, 3], 'космос — железный и ледяной');
  assert.deepEqual([...atmosphere].sort(), [0, 1, 2, 3], 'атмосфера — все четыре по seed');
  assert.equal(rockMaterial({ id: 3, y: -SPACE_ALT_UNITS }, 'earth') % 2, 1, 'ровно на границе космоса уже космос');
});

test('астероид рисуется спрайтом материала своего тела', () => {
  for (const [body, y, expected] of [['moon', -300, 'rock_0'], ['mars', -300, 'rock_2']]) {
    const { painter, names } = recordingPainter();
    const view = createView().setStatic(0, -300, 200, 300, 2, 400, 600);
    drawObjects(stubContext(400, 600), painter, view, [{ id: 11, kind: 'asteroid', active: true, x: 0, y, r: 28, size: 'medium', phase: 0.1 }], 2, 1, null, { body });
    assert.deepEqual(names.filter((n) => n.startsWith('rock_')), [expected], body);
  }
});

// --- шары --------------------------------------------------------------------------------------------

test('шар: гондола висит на стропах как маятник — амплитуда больше и фаза позже, чем у оболочки', () => {
  const out = { envelope: 0, pod: 0 };
  let envelopeMax = 0;
  let podMax = 0;
  let lag = 0;
  for (let t = 0; t < 20; t += 0.02) {
    balloonSwing({ phase: 0.3 }, t, out);
    envelopeMax = Math.max(envelopeMax, Math.abs(out.envelope));
    podMax = Math.max(podMax, Math.abs(out.pod));
    if (Math.abs(out.envelope) > 0.015 && Math.sign(out.envelope) !== Math.sign(out.pod)) lag++;
  }
  assert.ok(envelopeMax < 0.05 && podMax > envelopeMax * 2 && podMax < 0.2, `оболочка ${envelopeMax}, гондола ${podMax}`);
  assert.ok(lag > 50, 'гондола запаздывает относительно оболочки');
  const calm = balloonSwing({ phase: 0 }, 0);
  assert.ok(Math.abs(calm.envelope) < 0.02 && Math.abs(calm.pod) < 0.12);
});

test('шар: геометрия частей из размеров и рамок art/balloon-parts.json, стропы между оболочкой и гондолой', () => {
  for (let era = 0; era < 6; era++) {
    const rig = balloonRig(era, 100);
    assert.ok(rig.gap > 0 && rig.gap < 60, `era ${era}: стропы ${rig.gap}`);
    assert.ok(rig.envW > rig.podW && rig.envH > 40, `era ${era}`);
    assert.ok(Math.abs(rig.podShift) < rig.envW * 0.2, `era ${era}: гондола под центром`);
    assert.ok(Math.abs(rig.height - 100) < 1e-9);
    // оболочка + стропы + гондола укладываются в высоту целого спрайта
    assert.ok(rig.envH + rig.gap + rig.podH <= 100.5, `era ${era}: ${rig.envH + rig.gap + rig.podH}`);
  }
});

test('шар рисуется двумя частями и стропами; без частей — запасной целый спрайт', () => {
  const balloon = [{ id: 5, kind: 'balloon', active: true, x: 0, y: -500, r: 28, lineage: 'mid', gen: 3, phase: 0.2 }];
  const parts = recordingPainter();
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  const ctx = stubContext(400, 600);
  drawObjects(ctx, parts.painter, view, balloon, 3, 1);
  assert.deepEqual(parts.names, ['balloon_2015_envelope', 'balloon_2015_pod']);
  assert.ok(ctx.calls.stroke >= 1 && ctx.calls.lineTo >= 3, 'три стропы');
  const fallback = recordingPainter({ missing: ['balloon_2015_pod'] });
  const fallbackCtx = stubContext(400, 600);
  drawObjects(fallbackCtx, fallback.painter, view, balloon, 3, 1);
  assert.deepEqual(fallback.names, [], 'без арта спрайты не просим');
  assert.ok(fallbackCtx.calls.ellipse >= 1 && fallbackCtx.calls.fillRect >= 1, 'запасной вид: оболочка и гондола кодом');
});

test('база на дальнем плане Луны и Марса: смещается медленнее камеры и исчезает с высотой', () => {
  assert.equal(outpostSpriteName('moon', 2), 'outpost_moon_1998');
  assert.equal(outpostSpriteName('mars', 5), 'outpost_mars_2060');
  const a = outpostPlacement(100, 1, 0, 0);
  const b = outpostPlacement(100, 1, 300, 0);
  // при сдвиге камеры на 300 ед. база на экране смещается лишь на 300 * OUTPOST_PARALLAX (земля — на все 300)
  assert.ok(Math.abs((b.x - 300) - a.x + 300 * OUTPOST_PARALLAX) < 1e-9);
  assert.ok(OUTPOST_PARALLAX > 0.3 && OUTPOST_PARALLAX < 0.9);
  const left = outpostPlacement(100, -1, 0, 0);
  assert.ok(left.x < 100 && a.x > 100, 'стороны по знаку');
  assert.ok(Math.abs(a.x - (100 + OUTPOST_DISTANCE) * OUTPOST_PARALLAX) < 1e-9);
  assert.equal(outpostPlacement(0, 1, 0, 0).alpha, 1);
  assert.equal(outpostPlacement(0, 1, 0, 400).alpha, 0);
  assert.ok(outpostPlacement(0, 1, 0, 150).alpha > 0 && outpostPlacement(0, 1, 0, 150).alpha < 1);
  for (const body of ['moon', 'mars']) {
    const low = recordingPainter();
    const view = createView().setStatic(0, -40, 600, 300, 2, 1200, 400);
    drawTerrain(stubContext(1200, 400), low.painter, view, body, 3, { x: 0, w: 170 }, 0);
    assert.ok(low.names.some((n) => n.startsWith(`outpost_${body}_`)), `${body}: база у земли рисуется`);
    const high = recordingPainter();
    const up = createView().setStatic(0, -900, 600, 300, 2, 1200, 400);
    drawTerrain(stubContext(1200, 400), high.painter, up, body, 3, { x: 0, w: 170 }, 0);
    assert.ok(!high.names.some((n) => n.startsWith('outpost_')), `${body}: на высоте база не рисуется`);
  }
});

// --- магнит ------------------------------------------------------------------------------------------

test('магнит: радиус и центр совпадают с sim, активен по cfg.consumables.magnet', () => {
  assert.equal(MAGNET_RADIUS, PICKUP_RADIUS.coin + MAGNET_BONUS);
  assert.equal(MAGNET_CENTER_OFFSET, ROCKET_AXIS_OFFSET);
  assert.equal(magnetActive({ cfg: { consumables: { magnet: 1 } } }), true);
  assert.equal(magnetActive({ cfg: { consumables: { magnet: 0 } } }), false);
  assert.equal(magnetActive({ cfg: {} }), false);
  assert.equal(magnetActive(null), false);
  const c = magnetCenter({ x: 10, y: -100, angle: 0 });
  assert.deepEqual([c.x, c.y], [10, -100 - ROCKET_AXIS_OFFSET]);
  const tilted = magnetCenter({ x: 0, y: 0, angle: Math.PI / 2 });
  assert.ok(Math.abs(tilted.x - ROCKET_AXIS_OFFSET) < 1e-9 && Math.abs(tilted.y) < 1e-9);
});

test('радиус магнита: из state.magnetRadius или cfg.magnetRadius, иначе по sim', () => {
  assert.equal(magnetRadius({}), MAGNET_RADIUS);
  assert.equal(magnetRadius({ magnetRadius: 150 }), 150);
  assert.equal(magnetRadius({ cfg: { magnetRadius: 140 } }), 140);
  assert.equal(magnetRadius({ magnetRadius: 150, cfg: { magnetRadius: 140 } }), 150);
  assert.equal(magnetRadius({ magnetRadius: -5 }), MAGNET_RADIUS);
  assert.equal(magnetRadius(null), MAGNET_RADIUS);
});

test('поле магнита: линии диполя идут от полюса к полюсу, симметричны, вложены и не выходят за радиус', () => {
  const pole = 20;
  for (const loop of FIELD_LOOPS) {
    const equator = 118 * loop;
    const start = fieldPoint(equator, 1, 0, pole, {});
    const end = fieldPoint(equator, 1, 1, pole, {});
    assert.ok(Math.abs(start.x) < 1e-9 && Math.abs(start.y - pole) < 1e-9, 'начало в северном полюсе');
    assert.ok(Math.abs(end.x) < 1e-9 && Math.abs(end.y + pole) < 1e-9, 'конец в южном полюсе');
    let maxX = 0;
    for (let i = 0; i <= FIELD_SEGMENTS; i++) {
      const u = i / FIELD_SEGMENTS;
      const right = fieldPoint(equator, 1, u, pole, {});
      const left = fieldPoint(equator, -1, u, pole, {});
      assert.ok(Math.abs(right.x + left.x) < 1e-9 && Math.abs(right.y - left.y) < 1e-9, 'зеркальны');
      assert.ok(right.x >= 0 && Math.abs(right.y) <= pole + equator, 'дуга в пределах радиуса');
      maxX = Math.max(maxX, right.x);
    }
    assert.ok(Math.abs(maxX - equator) < equator * 0.04, `экватор ${maxX} при ${equator}`);
  }
  const mid = (loop) => fieldPoint(118 * loop, 1, 0.5, pole, {}).x;
  for (let i = 1; i < FIELD_LOOPS.length; i++) assert.ok(mid(FIELD_LOOPS[i]) > mid(FIELD_LOOPS[i - 1]), 'внешние дуги шире');
});

test('поле магнита: прозрачность 0,08..0,18, линии текут, цвет тёплый у полюсов и холодный у экватора, радиус дышит +-6 % за 2,4 с', () => {
  let min = 1;
  let max = 0;
  for (let loop = 0; loop < FIELD_LOOPS.length; loop++) {
    for (let t = 0; t < 12; t += 0.25) {
      for (let u = 0; u <= 1; u += 0.05) {
        const a = fieldAlpha(u, loop, t, false);
        min = Math.min(min, a);
        max = Math.max(max, a);
      }
    }
  }
  assert.ok(min >= FIELD_ALPHA.min - 1e-9 && max <= FIELD_ALPHA.max + 1e-9, `${min}..${max}`);
  assert.ok(max > 0.13 && min < 0.1, 'есть и яркие, и тусклые участки');
  // поток: в одной точке прозрачность меняется со временем, при reduceMotion — нет
  const flowing = new Set();
  const still = new Set();
  for (let t = 0; t < 6; t += 0.5) {
    flowing.add(fieldAlpha(0.5, 1, t, false).toFixed(4));
    still.add(fieldAlpha(0.5, 1, t, true).toFixed(4));
  }
  assert.ok(flowing.size > 4 && still.size === 1);
  assert.ok(Math.abs(FIELD_PERIOD - 2.4) < 1e-9 && Math.abs(FIELD_PULSE - 0.06) < 1e-9);
  assert.ok(Math.abs(fieldPulse(0, false) - 1) < 1e-9);
  assert.ok(Math.abs(fieldPulse(FIELD_PERIOD / 4, false) - 1.06) < 1e-9);
  assert.ok(Math.abs(fieldPulse((3 * FIELD_PERIOD) / 4, false) - 0.94) < 1e-9);
  assert.ok(Math.abs(fieldPulse(FIELD_PERIOD, false) - 1) < 1e-9);
  assert.equal(fieldPulse(0.6, true), 1);
  const pole = fieldColor(0.02, []);
  const equator = fieldColor(0.5, []);
  assert.ok(pole[0] > 230 && pole[2] < 110, 'у полюса оранжевый');
  assert.ok(equator[2] > 230 && equator[0] < 140, 'у экватора голубой');
});

test('поле магнита: рисуется линиями при включённом магните (без спрайта и без контура), не рисуется без него и после аварии', () => {
  const flight = { x: 0, y: -500, angle: 0, phase: 'ascent', cfg: { consumables: { magnet: 1 } } };
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  const ctx = stubContext(400, 600);
  drawMagnetField(ctx, view, flight, 1, false);
  assert.equal(ctx.calls.stroke, FIELD_LOOPS.length * 2 * FIELD_SEGMENTS, 'тонкие отрезки линий поля');
  assert.ok(ctx.calls.fill >= 1, 'лёгкая аура');
  assert.equal(ctx.calls.drawImage || 0, 0, 'значка магнита над ракетой нет — он в HUD');
  assert.equal(ctx.calls.setLineDash || 0, 0, 'жёсткого пунктирного контура нет');
  for (const variant of [{ cfg: { consumables: { magnet: 0 } } }, { phase: 'crashed' }, { phase: 'landed' }, { phase: 'transfer' }]) {
    const quiet = stubContext(400, 600);
    drawMagnetField(quiet, view, { ...flight, ...variant }, 1, false);
    assert.equal(quiet.calls.stroke || 0, 0);
  }
});

test('поле магнита анимировано: стили линий меняются со временем, при reduceMotion поле неподвижно; радиус из state', () => {
  const flight = { x: 0, y: -500, angle: 0.3, phase: 'ascent', cfg: { consumables: { magnet: 1 } } };
  const view = createView().setStatic(0, -500, 200, 300, 2, 400, 600);
  const record = (time, reduce, extra = {}) => {
    const styles = [];
    const ctx = new Proxy(stubContext(400, 600), {
      set(target, prop, value) {
        if (prop === 'strokeStyle') styles.push(value);
        target[prop] = value;
        return true;
      },
    });
    drawMagnetField(ctx, view, { ...flight, ...extra }, time, reduce);
    return styles.join('|');
  };
  assert.notEqual(record(0.4, false), record(1.9, false), 'линии текут и пульсируют');
  assert.equal(record(0.4, true), record(1.9, true), 'при reduceMotion поле неподвижно');
  assert.equal(record(0.4, false), record(0.4, false), 'детерминировано');
  // радиус из state: линии шире
  const spread = (extra) => {
    const xs = [];
    const ctx = stubContext(400, 600);
    const move = ctx.moveTo;
    ctx.moveTo = (x) => {
      xs.push(x);
      return move(x);
    };
    drawMagnetField(ctx, view, { ...flight, angle: 0, ...extra }, 0, true);
    return Math.max(...xs) - Math.min(...xs);
  };
  assert.ok(spread({ magnetRadius: 200 }) > spread({}) * 1.4);
});

test('лёгкие runtime-копии: файлы цел, в каталоге вместо тяжёлых оригиналов, размеры и вид близки к подготовленным спрайтам', () => {
  const meta = JSON.parse(fs.readFileSync(path.join(repoRoot, 'art', 'gen', 'runtime', 'runtime-sprites.meta.json'), 'utf8'));
  const names = Object.keys(ASSET_FILES).filter((name) => RUNTIME_SPRITE_PATTERN.test(name));
  assert.equal(names.length, 45, 'базы 12 + магниты 6 + части шаров 12 + площадки 4 + HD-постройки E0 11');
  assert.deepEqual([...names].sort(), Object.keys(meta.sprites).sort(), 'каталог и метаданные совпадают');
  let saved = 0;
  for (const name of names) {
    const file = fileOf(ASSET_FILES[name]);
    assert.equal(file, `art/gen/runtime/${name}.png`, name);
    assert.equal(worldSpriteFile(name), file);
    const entry = meta.sprites[name];
    const bytes = fs.statSync(path.join(repoRoot, file)).size;
    assert.equal(bytes, entry.bytes_out, `${name}: файл перекодирован после метаданных (запустите game/tools/optimize-sprites.py)`);
    assert.deepEqual(pngSize(path.join(repoRoot, file)), entry.size);
    assert.ok(entry.mean_rgb_error < 7, `${name}: ошибка цвета ${entry.mean_rgb_error}`);
    assert.ok(entry.bytes_out < entry.bytes_in * 0.5, `${name}: выигрыш по весу`);
    saved += entry.bytes_in - entry.bytes_out;
  }
  assert.ok(saved > 1.5 * 1024 * 1024, `сэкономлено ${(saved / 1048576).toFixed(1)} МБ`);
  // оригиналы подготовленного арта остаются нетронутыми рядом
  assert.ok(fs.existsSync(path.join(repoRoot, 'art', 'gen', 'outpost_moon_2060.png')));
  // целый спрайт шара в сборку не входит, но его размеры нужны для сборки из частей
  for (const year of ERA_YEARS) assert.equal(ASSET_FILES[`balloon_${year}`], undefined);
  BALLOON_FULL_SIZES.forEach((size, era) => {
    assert.deepEqual(pngSize(path.join(repoRoot, 'outputs', 'rocket', 'dist', 'assets', 'world', `balloon_${ERA_YEARS[era]}.png`)), size);
  });
});
