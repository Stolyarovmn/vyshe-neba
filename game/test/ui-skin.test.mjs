// Интерфейс по эпохам: таблицы токенов, различимость эпох, кэш тем.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ERA_SKINS, ERA_COUNT, skinFor } from '../src/ui/skin/era-skins.js';
import { getTheme, PALETTE, luminance } from '../src/ui/theme.js';

test('шесть эпох интерфейса: у каждой свои экраны, подсветка и приборы', () => {
  assert.equal(ERA_COUNT, 6);
  assert.deepEqual(ERA_SKINS.map((s) => s.crt.kind), ['green', 'amber', 'color', 'flat', 'projection', 'holo']);
  assert.deepEqual(ERA_SKINS.map((s) => s.instr), ['analog', 'led', 'digital', 'flat', 'projection', 'holo']);
  assert.deepEqual(ERA_SKINS.map((s) => s.lamp), ['bulb', 'led', 'led', 'line', 'bar', 'dot']);
  assert.equal(new Set(ERA_SKINS.map((s) => s.id)).size, 6);
});

test('skinFor ограничивает эпоху диапазоном 0–5', () => {
  assert.equal(skinFor(-3).id, 'e0');
  assert.equal(skinFor(2).id, 'e2');
  assert.equal(skinFor(99).id, 'e5');
  assert.equal(skinFor(undefined).id, 'e0');
});

test('замены палитры и рамок ссылаются только на существующие цвета палитры', () => {
  for (const s of ERA_SKINS) {
    for (const k of Object.keys(s.palette)) assert.ok(k in PALETTE, `${s.id}: нет цвета ${k}`);
    for (const [name, f] of Object.entries(s.frames)) for (const key of ['hi', 'mid', 'lo', 'edge']) if (f[key]) assert.ok(f[key] in { ...PALETTE, ...s.palette }, `${s.id}.${name}.${key} = ${f[key]}`);
    for (const [label, key] of Object.entries(s.labels)) assert.ok(key in PALETTE, `${s.id}: подпись ${label} → ${key}`);
  }
});

test('эпохи различимы: корпус и цвет люминофора меняются, темы кэшируются отдельно', () => {
  const themes = ERA_SKINS.map((_, e) => getTheme({}, e));
  assert.equal(new Set(themes.map((th) => th.variants.raised.mid)).size >= 5, true, 'материал корпуса различим');
  assert.notEqual(themes[0].c.phosphor, themes[1].c.phosphor);
  assert.equal(getTheme({}, 3), getTheme({}, 3));
  assert.notEqual(getTheme({}, 3), getTheme({}, 4));
  assert.notEqual(getTheme({}, 0), getTheme({ colorblind: true }, 0));
});

test('E0 — тёмные экраны с зелёным люминофором, E1 — янтарным', () => {
  const g = getTheme({}, 0).c.phosphor;
  const a = getTheme({}, 1).c.phosphor;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [gr, gg, gb] = rgb(g);
  const [ar, ag, ab] = rgb(a);
  assert.ok(gg > gr && gg > gb, 'зелёный люминофор');
  assert.ok(ar > ab && ag > ab, 'янтарный люминофор');
  assert.ok(luminance(getTheme({}, 0).c.navy0) < 0.01, 'экран E0 тёмный');
});

import { contrast, mix } from '../src/ui/theme.js';

test('цифры и цвета состояний приборов читаются на подложке в каждой эпохе (≥ 4,5 в худшем случае — подложка поверх белого)', () => {
  for (const settings of [{}, { colorblind: true }]) {
    for (let era = 0; era < ERA_COUNT; era++) {
      const th = getTheme(settings, era);
      const tok = th.skin.hud;
      const bg = mix(th.c[tok.bg], '#ffffff', 1 - tok.bgAlpha);
      for (const key of [tok.digit, 'green', 'amber', 'red', 'cyan']) {
        const ratio = contrast(th.c[key], bg);
        assert.ok(ratio >= 4.5, `эпоха ${era}${settings.colorblind ? ' (дальтоники)' : ''}: ${key} на подложке ${tok.bg} (α ${tok.bgAlpha}): ${ratio.toFixed(2)}`);
      }
    }
  }
});

test('у каждой эпохи свои формы приборов, а не только цвет: набор видов приборов не повторяется', () => {
  assert.equal(new Set(ERA_SKINS.map((s) => s.instr)).size, ERA_COUNT);
  for (const s of ERA_SKINS) assert.ok(['analog', 'led', 'digital', 'flat', 'projection', 'holo'].includes(s.instr), s.id);
  // подложка стеклянных эпох не должна быть прозрачнее 0,7: иначе цифры теряются на ярком фоне
  for (const s of ERA_SKINS) assert.ok(s.hud.bgAlpha >= 0.7, `${s.id}: bgAlpha ${s.hud.bgAlpha}`);
});
