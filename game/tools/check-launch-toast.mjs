import assert from 'node:assert/strict';
import { createApp, SCREENS } from '../src/ui/app.js';
import { fresh } from '../src/state/profile.js';
import * as rules from '../src/rules/index.js';
import { chromeLayout } from '../src/ui/layout.js';

// Настоящие app/kit и жизненный цикл кадра; рисование сцены заменено пустой функцией.
// Проверяется и первый кадр без раскладки kit, и обновление геометрии после resize.
const noop = () => {};
const ctx = new Proxy({}, { get: (o, key) => key in o ? o[key] : noop });
const canvas = { getContext: () => ctx, style: {} };
const app = createApp({
  canvas, profile: fresh(), mods: { rules, sim: {}, data: {} },
  store: { save: noop }, prefs: { seen: {}, touchControls: 'off' }, savePrefs: noop,
  input: { releaseAll: noop, setMode: noop, drain: () => [] },
  renderer: { hub: { draw: noop }, painter: null }, audio: {},
});
const draw = SCREENS.launch.draw;
// Внешний вид не проверяется: оставляем настоящий begin/fs/setToastAnchor,
// пиксельные примитивы здесь не нужны, end заменён заглушкой.
const end = app.kit.end;
const anchors = [];
const setAnchor = app.kit.setToastAnchor;
app.kit.setToastAnchor = (...args) => { anchors.push(args); setAnchor(...args); };
app.kit.end = () => { app.kit.S.ctx = null; };
app.kit.button = () => false;
SCREENS.launch.draw = noop;
try {
  app.resize(960, 720, 1);
  app.profile.settings.reduceMotion = true;
  assert.equal(app.kit.L, null);
  app.commit(fresh());
  app.profile.settings.reduceMotion = true;
  app.toast('Проверка запуска');
  assert.equal(app.startLaunch(), true);
  assert.doesNotThrow(() => app.frame(1 / 60, 0));
  assert.deepEqual(app.errors, []);
  for (const [w, h, scale] of [[960, 720, 1], [390, 844, 1.5], [1280, 720, 1]]) {
    app.profile.settings.textScale = scale;
    app.resize(w, h, 1);
    app.frame(0, 0);
    const L = app.layout;
    const G = chromeLayout(L, { back: true, era: false });
    const expected = G.row.y + G.row.h + L.gap + Math.round(Math.round(13 * L.ui * scale) * 2.6) / 2;
    assert.equal(anchors.at(-1)[0], 'top');
    assert.equal(anchors.at(-1)[1], expected);
    assert.equal(app.kit.L, L);
  }
  console.log('Проверено: первый кадр launch с уведомлением и null в kit, resize, текущий textScale и прежняя формула якоря. Отрисовка canvas не проверялась.');
} finally {
  SCREENS.launch.draw = draw;
  app.kit.end = end;
}
