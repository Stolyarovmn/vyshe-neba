// Раскладки интерфейса: цели нажатия ≥ 48 px, безопасные зоны, отсутствие перекрытий, доля приборов HUD < 10%.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLayout, mergeLayouts, hudLayout, hudTouchTargets, dockLayout, chromeLayout, screenFrame, rocketLayout, baseLayout,
  launchLayout, resultsLayout, journalLayout, shopLayout, settingsLayout, splitBody, assignLanes, intersect, MIN_TOUCH, DOCK_ITEMS, ROCKET_SPOTS, BUILD_COUNT,
} from '../src/ui/layout.js';

const SIZES = [
  [320, 568], [360, 640], [375, 812], [390, 844], [412, 915], [768, 1024],
  [568, 320], [640, 360], [812, 375], [844, 390], [915, 412], [1024, 768], [1280, 720], [1920, 1080], [2560, 1440],
];
const SAFES = [{ t: 0, r: 0, b: 0, l: 0 }, { t: 44, r: 0, b: 34, l: 0 }, { t: 0, r: 44, b: 21, l: 44 }];

function* layouts() {
  for (const [w, h] of SIZES) {
    for (const safe of SAFES) {
      const portrait = h > w;
      // безопасные зоны чёлки осмысленны только для соответствующей ориентации
      if ((safe.l || safe.r) && portrait) continue;
      if ((safe.t || safe.b) && !portrait && safe.l === 0) continue;
      yield { w, h, safe, L: computeLayout(w, h, 2, safe) };
    }
  }
}

const inside = (r, area) => r.x >= area.x - 0.5 && r.y >= area.y - 0.5 && r.x + r.w <= area.x + area.w + 0.5 && r.y + r.h <= area.y + area.h + 0.5;
const overlaps = (a, b) => !!intersect(a, b);

test('масштаб интерфейса: clamp(min(w,h)/420, 1, 3) и ориентация', () => {
  assert.equal(computeLayout(375, 812, 2).ui, 1);
  assert.equal(computeLayout(375, 812, 2).orientation, 'portrait');
  assert.equal(computeLayout(844, 390, 2).orientation, 'landscape');
  assert.ok(Math.abs(computeLayout(1280, 720, 1).ui - 720 / 420) < 1e-9);
  assert.equal(computeLayout(4000, 3000, 1).ui, 3);
});

test('нижняя панель хаба: ПУСК и четыре кнопки-иконки ≥ 48 px, внутри безопасной области, без перекрытий', () => {
  for (const { w, h, L } of layouts()) {
    const dock = dockLayout(L);
    const items = DOCK_ITEMS.map((k) => dock.items[k]);
    for (const [i, r] of items.entries()) {
      assert.ok(r.w >= MIN_TOUCH && r.h >= MIN_TOUCH, `${w}x${h}: ${DOCK_ITEMS[i]} ${r.w}x${r.h}`);
      assert.ok(inside(r, L.area), `${w}x${h}: ${DOCK_ITEMS[i]} вне безопасной области`);
    }
    assert.ok(dock.button.w >= MIN_TOUCH && dock.button.h >= MIN_TOUCH && inside(dock.button, dock.launch), `${w}x${h}: кнопка ПУСК внутри планки`);
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) assert.ok(!overlaps(items[i], items[j]), `${w}x${h}: перекрытие в нижней панели`);
  }
});

test('угловые таблички: кнопки ≥ 48 px, таблички внутри области и не перекрываются', () => {
  for (const { w, h, L } of layouts()) {
    for (const o of [{ back: true }, { back: true, era: true }, { era: true, gear: true }]) {
      const G = chromeLayout(L, o);
      const list = ['back', 'era', 'gear', 'coins', 'data'].filter((k) => G[k]);
      for (const k of list) {
        assert.ok(inside(G[k], L.area), `${w}x${h}: ${k} вне области`);
        assert.ok(G[k].h >= MIN_TOUCH, `${w}x${h}: ${k} высота ${G[k].h}`);
        if (k === 'back' || k === 'gear') assert.ok(G[k].w >= MIN_TOUCH, `${w}x${h}: ${k} ширина`);
      }
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) assert.ok(!overlaps(G[list[i]], G[list[j]]), `${w}x${h}: ${list[i]} и ${list[j]} перекрываются`);
    }
  }
});

test('HUD: цели нажатия ≥ 48 px, внутри безопасной области, не перекрываются', () => {
  for (const { w, h, L } of layouts()) {
    for (const mirror of [false, true]) {
      const hud = hudLayout(L, { mirror });
      const targets = hudTouchTargets(hud);
      const names = Object.keys(targets);
      for (const name of names) {
        const r = targets[name];
        assert.ok(r.w >= MIN_TOUCH - 0.5 && r.h >= MIN_TOUCH - 0.5, `${w}x${h}${mirror ? ' mirror' : ''}: ${name} ${r.w}x${r.h}`);
        assert.ok(inside(r, L.area), `${w}x${h}${mirror ? ' mirror' : ''}: ${name} вне безопасной области ${JSON.stringify(r)}`);
      }
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          assert.ok(!overlaps(targets[names[i]], targets[names[j]]), `${w}x${h}${mirror ? ' mirror' : ''}: перекрытие ${names[i]} и ${names[j]}`);
        }
      }
    }
  }
});

test('HUD: постоянные приборы занимают меньше 10% кадра', () => {
  for (const { w, h, L } of layouts()) {
    const hud = hudLayout(L);
    assert.ok(hud.instrumentShare < 0.1, `${w}x${h}: ${(hud.instrumentShare * 100).toFixed(1)}%`);
  }
});

test('HUD: радар не перекрывает полосу рубежей, подсказку, паузу и приборы', () => {
  for (const { w, h, L } of layouts()) {
    const hud = hudLayout(L);
    const r = hud.radar;
    const box = { x: r.cx - r.r, y: r.cy - r.r, w: r.r * 2, h: r.r * 2 };
    const others = { strip: hud.strip, hint: hud.hint, pause: hud.buttons.pause, ...Object.fromEntries(Object.entries(hud.instruments).map(([k, v]) => [`прибор ${k}`, v])) };
    for (const [name, o] of Object.entries(others)) assert.ok(!overlaps(box, o), `${w}x${h}: радар перекрывает ${name}`);
    assert.ok(inside(box, L.area), `${w}x${h}: радар вне безопасной области`);
  }
});

test('HUD: значок магнита внутри безопасной области и не перекрывает радар, подсказку, полосу, приборы, рычаг и кнопки', () => {
  for (const { w, h, L } of layouts()) {
    for (const mirror of [false, true]) {
      const hud = hudLayout(L, { mirror });
      const m = hud.magnet;
      assert.ok(m && m.w >= 24 && m.h >= 24, `${w}x${h}: значок магнита мал ${JSON.stringify(m)}`);
      assert.ok(inside(m, L.area), `${w}x${h}: значок магнита вне безопасной области`);
      const r = hud.radar;
      const others = {
        радар: { x: r.cx - r.r, y: r.cy - r.r, w: r.r * 2, h: r.r * 2 },
        подсказка: hud.hint,
        полоса: hud.strip,
        рычаг: hud.lever,
        ...Object.fromEntries(Object.entries(hud.instruments).map(([k, v]) => [`прибор ${k}`, v])),
        ...Object.fromEntries(Object.entries(hud.buttons).map(([k, v]) => [`кнопка ${k}`, v])),
      };
      for (const [name, o] of Object.entries(others)) assert.ok(!overlaps(m, o), `${w}x${h}${mirror ? ' mirror' : ''}: магнит перекрывает ${name}`);
    }
  }
});

test('HUD: зеркальная раскладка меняет диск и рычаг местами, пауза остаётся справа', () => {
  const L = computeLayout(844, 390, 2);
  const a = hudLayout(L);
  const b = hudLayout(L, { mirror: true });
  assert.ok(a.disc.cx < L.w / 2 && a.lever.x > L.w / 2);
  assert.ok(b.disc.cx > L.w / 2 && b.lever.x < L.w / 2);
  assert.deepEqual(a.buttons.pause, b.buttons.pause);
});

test('mergeLayouts сохраняет поля рендера и добавляет UI-геометрию', () => {
  const base = computeLayout(390, 844, 2);
  const merged = mergeLayouts(base, { rocketAnchor: { x: 1, y: 2 }, hud: { tilt: { r: 5 } }, extra: 7 });
  assert.deepEqual(merged.rocketAnchor, { x: 1, y: 2 });
  assert.equal(merged.extra, 7);
  assert.equal(merged.hud.tilt.r, 5);
  assert.ok(merged.hud.lever && merged.hud.disc);
});

test('рамка экрана: ряд табличек, тело и нижняя панель не пересекаются и лежат в области', () => {
  for (const { w, h, L } of layouts()) {
    const f = screenFrame(L, { header: true, dock: true, back: false, era: true, gear: true });
    assert.ok(!overlaps(f.header, f.body), `${w}x${h}`);
    assert.ok(!overlaps(f.body, f.dock), `${w}x${h}: тело и док`);
    assert.ok(inside(f.body, L.area) && inside(f.header, L.area) && inside(f.dock, L.area), `${w}x${h}`);
    assert.ok(f.header.h >= MIN_TOUCH);
  }
});

test('экран ракеты: девять горячих точек ≥ 48 px, внутри схемы, не пересекаются', () => {
  for (const { w, h, L } of layouts()) {
    const G = rocketLayout(L);
    const ids = ROCKET_SPOTS.map((s) => s.id);
    assert.equal(ids.length, 8);
    for (const id of ids) {
      const r = G.spots[id];
      assert.ok(r.w >= MIN_TOUCH && r.h >= MIN_TOUCH, `${w}x${h}: ${id}`);
      assert.ok(inside(r, G.schematic), `${w}x${h}: ${id} вне схемы ${JSON.stringify(r)} / ${JSON.stringify(G.schematic)}`);
    }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) assert.ok(!overlaps(G.spots[ids[i]], G.spots[ids[j]]), `${w}x${h}: ${ids[i]} и ${ids[j]}`);
    assert.ok(G.stand.w >= MIN_TOUCH && G.stand.h >= MIN_TOUCH);
    assert.ok(!overlaps(G.stand, G.spots.fins) && !overlaps(G.stand, G.spots.legs), `${w}x${h}: «Стенд» перекрывает опоры`);
  }
});

test('строительство: четырнадцать плиток ≥ 48 px внутри стойки, стойка не перекрывает табличку энергии', () => {
  for (const { w, h, L } of layouts()) {
    const G = baseLayout(L);
    assert.equal(G.tiles.length, BUILD_COUNT);
    assert.ok(inside(G.rack, L.area) && inside(G.energy, L.area), `${w}x${h}: стойка или энергия вне области`);
    for (const r of G.tiles) assert.ok(r.w >= MIN_TOUCH && r.h >= MIN_TOUCH && inside(r, G.rack), `${w}x${h}: плитка ${JSON.stringify(r)}`);
    for (let i = 0; i < G.tiles.length; i++) for (let j = i + 1; j < G.tiles.length; j++) assert.ok(!overlaps(G.tiles[i], G.tiles[j]), `${w}x${h}: плитки пересекаются`);
    assert.ok(!overlaps(G.energy, G.rack), `${w}x${h}: энергия перекрывает стойку`);
  }
});

test('пульт запуска, итоги, доска, лавка, настройки: области внутри безопасной зоны, кнопки ≥ 48 px', () => {
  for (const { w, h, L } of layouts()) {
    const l = launchLayout(L);
    assert.ok(l.start.h >= MIN_TOUCH && inside(l.start, L.area) && inside(l.cons, L.area) && inside(l.panel, L.area), `${w}x${h}: запуск`);
    for (const c of l.dest) assert.ok(inside(c, L.area) && c.h >= MIN_TOUCH && c.w >= MIN_TOUCH, `${w}x${h}: кнопка-планета`);
    for (const c of l.consSlots) assert.ok(inside(c, L.area) && c.h >= MIN_TOUCH && c.w >= MIN_TOUCH, `${w}x${h}: гнездо расходника`);
    assert.ok(!overlaps(l.start, l.cons) && !overlaps(l.start, l.destArea), `${w}x${h}: ПУСК перекрывает пульт`);
    const r = resultsLayout(L);
    const rs = resultsLayout(L, { height: Math.round(r.card.h * 0.7), inset: { x: 10, y: 8 } });
    assert.ok(rs.card.h <= r.card.h * 0.7 + 1 && inside(rs.card, L.area) && rs.buttons.h >= MIN_TOUCH && inside(rs.buttons, rs.card), `${w}x${h}: лист по высоте содержимого`);
    const chrome = chromeLayout(L, {});
    assert.ok(r.buttons.h >= MIN_TOUCH && inside(r.card, L.area), `${w}x${h}: итоги`);
    assert.ok(r.card.y >= chrome.y + chrome.h, `${w}x${h}: бланк итогов не закрывает таблички`);
    const j = journalLayout(L);
    assert.ok(inside(j.board, L.area) && inside(j.shelf, L.area) && !overlaps(j.board, j.shelf), `${w}x${h}: доска`);
    const sh = shopLayout(L);
    assert.ok(inside(sh.shelf1, L.area) && inside(sh.shelf2, L.area) && inside(sh.counter, L.area), `${w}x${h}: лавка`);
    assert.ok(!overlaps(sh.shelf1, sh.shelf2) && !overlaps(sh.shelf2, sh.counter), `${w}x${h}: полки пересекаются`);
    assert.ok(inside(settingsLayout(L).card, L.area), `${w}x${h}: настройки`);
  }
});

test('splitBody: в портрете сверху/снизу, в ландшафте слева/справа', () => {
  const body = { x: 10, y: 20, w: 300, h: 400 };
  const p = splitBody(computeLayout(375, 812, 1), body, 0.5);
  assert.ok(p.a.y < p.b.y && p.a.x === p.b.x);
  const l = splitBody(computeLayout(812, 375, 1), body, 0.5);
  assert.ok(l.a.x < l.b.x && l.a.y === l.b.y);
});

test('assignLanes: маркеры одной полосы не перекрываются', () => {
  const xs = [-92, 150, 235, 335, 445, 560, 685, 815, 760, 905, 1035, 1085, 1180, 1210];
  for (const scale of [0.25, 0.35, 0.5, 1]) {
    const size = 48;
    const items = xs.map((x, i) => ({ key: String(i), x: x * scale }));
    const lanes = assignLanes(items, size, 3);
    const byLane = {};
    for (const it of items) (byLane[lanes[it.key]] ||= []).push(it.x);
    for (const list of Object.values(byLane)) {
      list.sort((a, b) => a - b);
      for (let i = 1; i < list.length; i++) assert.ok(list[i] - list[i - 1] >= size * 0.99 || scale < 0.3, `масштаб ${scale}: ${list[i] - list[i - 1]}`);
    }
  }
});
