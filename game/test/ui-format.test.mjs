// Форматирование чисел, перенос слов, палитра (контраст WCAG AA) и строки интерфейса.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmtInt, fmtCompact, fmtNum, fmtAlt, fmtSpeed, fmtClock, fmtPct, fmtStat, pluralRu, damp } from '../src/ui/format.js';
import { wrapWords, ellipsize } from '../src/ui/text.js';
import { getTheme, contrast, luminance, mix, THEME_SOURCE } from '../src/ui/theme.js';
import ru from '../src/i18n/ru.js';
import { t, plural, hasKey } from '../src/i18n/index.js';
import { ZONES } from '../src/sim/bodies.js';
import { PART_IDS } from '../src/data/index.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

test('числа: разряды узким пробелом, компактная запись, отрицательные', () => {
  assert.equal(fmtInt(1234567), '1 234 567');
  assert.equal(fmtInt(0), '0');
  assert.equal(fmtInt(-1500), '−1 500');
  assert.equal(fmtInt(999.6), '1 000');
  assert.equal(fmtCompact(950), '950');
  assert.equal(fmtCompact(15300), '15,3 тыс.');
  assert.equal(fmtCompact(2400000), '2,4 млн');
  assert.equal(fmtNum(3.5), '3,5');
  assert.equal(fmtNum(Number.NaN), '0');
});

test('большие значения не ломают форматирование', () => {
  assert.ok(fmtInt(9007199254740991).length > 10);
  assert.ok(fmtCompact(1e12).endsWith('млрд'));
  assert.equal(fmtInt(Infinity), '0');
});

test('высота и скорость: игровые единицы (1 ед. = 10 м)', () => {
  assert.deepEqual(fmtAlt(82), { value: '820', unit: 'm' });
  assert.deepEqual(fmtAlt(1240), { value: '12,4', unit: 'km' });
  assert.deepEqual(fmtAlt(-5), { value: '0', unit: 'm' });
  assert.equal(fmtSpeed(-13.4), '−13');
  assert.equal(fmtSpeed(28.2, true), '+28');
});

test('время, проценты, показатели', () => {
  assert.equal(fmtClock(65), '1:05');
  assert.equal(fmtClock(-3), '0:00');
  assert.equal(fmtPct(0.734), '73%');
  assert.equal(fmtPct(4), '100%');
  assert.equal(fmtStat(true), '✓');
  assert.equal(fmtStat(0.5), '0,5');
  assert.equal(fmtStat(1234), '1 234');
});

test('склонения: монета, монеты, монет', () => {
  const forms = ['монета', 'монеты', 'монет'];
  assert.equal(pluralRu(1, forms), 'монета');
  assert.equal(pluralRu(2, forms), 'монеты');
  assert.equal(pluralRu(5, forms), 'монет');
  assert.equal(pluralRu(11, forms), 'монет');
  assert.equal(pluralRu(21, forms), 'монета');
  assert.equal(pluralRu(112, forms), 'монет');
});

test('damp не зависит от частоты кадров', () => {
  let a = 0;
  for (let i = 0; i < 60; i++) a = damp(a, 1, 8, 1 / 60);
  let b = 0;
  for (let i = 0; i < 30; i++) b = damp(b, 1, 8, 1 / 30);
  assert.ok(Math.abs(a - b) < 1e-9);
});

// ---- перенос слов ----

const fakeMeasure = (s) => s.length * 10;

test('перенос слов: по пробелам и дефисам, ширина не превышается', () => {
  const lines = wrapWords('Ракета садится мягко и ровно на площадку', 120, fakeMeasure);
  for (const l of lines) assert.ok(fakeMeasure(l) <= 120, l);
  assert.equal(lines.join(' '), 'Ракета садится мягко и ровно на площадку');
  assert.deepEqual(wrapWords('раз\nдва', 500, fakeMeasure), ['раз', 'два']);
});

test('перенос слов: слишком длинное слово режется по символам, пустая строка сохраняется', () => {
  const lines = wrapWords('Стабилизаторыиреактивнаясистема', 100, fakeMeasure);
  assert.ok(lines.length >= 3);
  for (const l of lines) assert.ok(fakeMeasure(l) <= 100);
  assert.deepEqual(wrapWords('', 100, fakeMeasure), ['']);
});

test('ellipsize обрезает по ширине и добавляет многоточие', () => {
  assert.equal(ellipsize('короткий', 200, fakeMeasure), 'короткий');
  const cut = ellipsize('очень длинная подпись кнопки', 100, fakeMeasure);
  assert.ok(cut.endsWith('…') && fakeMeasure(cut) <= 100);
});

// ---- палитра ----

const pairs = (c) => [
  ['text', 'panel'], ['textDim', 'panel'], ['textMute', 'panel'], ['gold', 'panel'], ['cyan', 'panel'], ['green', 'panel'], ['red', 'panel'], ['amber', 'panel'],
  ['text', 'bg'], ['textDim', 'inset'], ['textMute', 'inset'], ['gold', 'inset'], ['cyan', 'inset'], ['red', 'inset'], ['green', 'inset'], ['amber', 'inset'],
  ['textMute', 'screen'], ['red', 'screen'], ['white', 'card'], ['textDim', 'card'],
  ['ink', 'paper1'], ['amberDeep', 'paper1'], ['redDark', 'paper1'], ['greenDark', 'paper1'], ['cyanDark', 'paper1'],
].map(([a, b]) => [a, b, contrast(c[a], c[b])]);

for (const [label, settings] of [['обычная палитра', {}], ['палитра для дальтоников', { colorblind: true }]]) {
  for (let era = 0; era < 6; era++) {
    test(`контраст WCAG AA (≥ 4,5) текста и акцентов на панелях, щитках, табло и бумаге: ${label}, эпоха ${era}`, () => {
      const { c } = getTheme(settings, era);
      for (const [a, b, ratio] of pairs(c)) assert.ok(ratio >= 4.5, `${a} на ${b}: ${ratio.toFixed(2)}`);
    });
  }
}

test('подписи кнопок читаются на своих заливках (≥ 4,5), обе палитры и все эпохи', () => {
  for (const settings of [{}, { colorblind: true }]) {
    for (let era = 0; era < 6; era++) {
      const th = getTheme(settings, era);
      for (const base of ['btn', 'primary', 'danger', 'good']) {
        for (const state of ['', 'Hover', 'Press']) {
          const fill = th.variants[`${base}${state}`]?.mid;
          if (!fill) continue;
          const label = th.labelColor(`${base}${state}`);
          assert.ok(contrast(label, fill) >= 4.5, `эпоха ${era}, ${base}${state}: ${contrast(label, fill).toFixed(2)}`);
        }
      }
    }
  }
});

test('палитра интерфейса: не больше 32 цветов в каждой эпохе, все цвета рамок взяты из неё', () => {
  for (let era = 0; era < 6; era++) {
    const th = getTheme({}, era);
    const colors = new Set(Object.values(th.palette));
    assert.ok(Object.keys(th.palette).length <= 32, `эпоха ${era}: ключей палитры ${Object.keys(th.palette).length}`);
    assert.ok(colors.size <= 32, `эпоха ${era}: цветов в палитре: ${colors.size}`);
    for (const [name, v] of Object.entries(th.variants)) for (const k of ['hi', 'mid', 'lo', 'edge']) assert.ok(colors.has(v[k]), `эпоха ${era}: ${name}.${k} вне палитры`);
  }
});

test('режим дальтоника заменяет зелёно-красную пару и различим по яркости', () => {
  const std = getTheme({}).c;
  const cb = getTheme({ colorblind: true }).c;
  assert.notEqual(std.green, cb.green);
  assert.notEqual(std.red, cb.red);
  assert.ok(Math.abs(luminance(cb.green) - luminance(cb.red)) > 0.08, 'хорошо/плохо различаются яркостью');
  assert.equal(getTheme({ colorblind: true }), getTheme({ colorblind: true }), 'темы кэшируются');
});

test('mix и все варианты 9-slice заданы полностью', () => {
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  const th = getTheme({});
  for (const name of Object.keys(THEME_SOURCE.FRAMES)) {
    const v = th.variants[name];
    assert.ok(v.hi && v.mid && v.lo && v.edge, name);
  }
});

// ---- строки ----

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'dev') continue;
      out.push(...sourceFiles(p));
    } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('все литеральные ключи t(...) в ui/ input/ main.js есть в ru.js', () => {
  const files = [...sourceFiles(path.join(SRC, 'ui')), ...sourceFiles(path.join(SRC, 'input')), path.join(SRC, 'main.js')];
  const missing = [];
  const re = /\bt\(\s*(['`])([^'`]+)\1/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(re)) {
      if (m[2].includes('${')) continue;
      if (!(m[2] in ru)) missing.push(`${path.relative(SRC, file)}: ${m[2]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('динамические семейства ключей покрыты в ru.js', () => {
  const families = [
    ['dock', ['launch', 'rocket', 'base', 'journal', 'shop', 'more']],
    ['dest', ['earth', 'moon', 'mars']],
    ['cons', ['chute', 'repair', 'canister', 'magnet']],
    ['mode', ['arcade', 'pilot']],
    ['layout', ['right', 'left']],
    ['touch', ['auto', 'on', 'off']],
    ['era.cond', ['coins', 'data', 'buildings']],
    ['part.short', PART_IDS],
  ];
  const missing = [];
  for (const [prefix, ids] of families) for (const id of ids) if (!hasKey(`${prefix}.${id}`)) missing.push(`${prefix}.${id}`);
  for (const id of ['arcade', 'pilot']) if (!hasKey(`mode.${id}.desc`)) missing.push(`mode.${id}.desc`);
  for (const id of ['launch', 'rocket', 'base', 'journal', 'shop', 'more']) if (!hasKey(`dock.${id}.tip`)) missing.push(`dock.${id}.tip`);
  for (const list of Object.values(ZONES)) for (const z of list) if (!hasKey(`zone.${z.id}`)) missing.push(`zone.${z.id}`);
  for (const id of ['thrust', 'tilt']) for (const sfx of ['key', 'touch']) if (!hasKey(`tut.${id}.${sfx}`)) missing.push(`tut.${id}.${sfx}`);
  for (const id of ['fuel', 'descent', 'land']) if (!hasKey(`tut.${id}`)) missing.push(`tut.${id}`);
  for (const k of ['brake', 'tilt', 'drift', 'hazard', 'chuteAir', 'overheat', 'hull']) if (!hasKey(`hint.${k}`)) missing.push(`hint.${k}`);
  for (const k of ['thrust', 'tilt', 'boost', 'chute', 'pause']) if (!hasKey(`legend.${k}`)) missing.push(`legend.${k}`);
  for (const k of ['perfect', 'landed', 'crashed', 'abandoned']) if (!hasKey(`results.${k}`)) missing.push(`results.${k}`);
  assert.deepEqual(missing, []);
});

test('t(): подстановка параметров, неизвестный ключ виден как есть, плюрали', () => {
  assert.equal(t('card.level', { n: 2, max: 6 }), 'Уровень 2 из 6');
  assert.equal(t('нет.такого.ключа'), 'нет.такого.ключа');
  assert.equal(t('hud.pause', { x: 1 }), ru['hud.pause']);
  assert.equal(typeof plural, 'function');
  for (const [k, v] of Object.entries(ru)) assert.ok(typeof v === 'string' && v.length > 0, k);
});

// ---- модули и показатели «Ракеты» ----

import { fmtInfo, deltaRows, PART_KEYS, statShort } from '../src/ui/screens/common.js';
import { PARTS } from '../src/data/index.js';
import { getPartState } from '../src/rules/index.js';
import { fresh } from '../src/state/index.js';

test('в мастерской восемь модулей без парашюта, все они есть в данных', () => {
  assert.equal(PART_KEYS.length, 8);
  assert.ok(!PART_KEYS.includes('parachute'));
  for (const id of PART_KEYS) assert.ok(PARTS[id], id);
});

test('угол наклона стабилизаторов показывается в градусах: «11° → 17°»', () => {
  const info = PARTS.fins.statInfo.find((i) => i.key === 'maxTilt');
  assert.ok(info, 'нет показателя maxTilt у стабилизаторов');
  assert.equal(fmtInfo(info, 0.2), '11°');
  assert.equal(fmtInfo(info, 0.3), '17°');
  const ps = getPartState(fresh(), 'fins');
  const rows = deltaRows(PARTS.fins.statInfo, ps.current, ps.next.stats);
  const row = rows.find((r) => r.key === 'maxTilt');
  assert.ok(row && row.changed, 'угол должен расти с уровнем');
  assert.equal(statShort(info), 'Угол наклона');
  assert.match(`${row.fmt(row.before)} → ${row.fmt(row.after)}`, /^\d+° → \d+°$/);
});
