// Браузерная проверка интерфейса и ввода (Playwright): обе раскладки, смена ориентации на лету, покупки через интерфейс,
// сенсорное управление настоящими touch-событиями, пауза, итоги, ноль ошибок консоли. Снимки: work/ui-*.png.
// ТЕСТ-СТРАЖ языка интерфейса (game/docs/UI_LANGUAGE.md): в слое интерфейса не должно быть fillText (весь текст идёт через
// пиксельный шрифт), скруглённых прямоугольников и градиентных заливок; счётчики вызовов в обёртке контекста.
// Использует тестовый хук globalThis.__VN_TEST__ и сборку game/dist/vyshe-neba.html (собирается при отсутствии).
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const gameFile = process.env.GAME_FILE || path.join(root, 'game', 'dist', 'vyshe-neba.html');
const outDir = path.join(root, 'work');
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 1280, height: 720, touch: false },
  { name: 'phone-landscape', width: 844, height: 390, touch: true },
];

// минимальные размеры окна: только страж текста и отступов
const AUDIT_VIEWPORTS = [
  { name: 'min-portrait', width: 320, height: 568 },
  { name: 'min-landscape', width: 568, height: 320 },
];

function launch() {
  const exe = process.env.CHROMIUM_EXECUTABLE_PATH;
  const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'];
  return chromium.launch(exe ? { executablePath: exe, args } : { channel: 'chrome', args });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ПРОВАЛ: ${msg}`);
}

const hook = (page, fn, arg) => page.evaluate(fn, arg);
const screenName = (page) => page.evaluate(() => globalThis.__VN_TEST__.screen());

async function target(page, id) {
  const r = await page.evaluate((i) => globalThis.__VN_TEST__.target(i), id);
  assert(r, `нет цели «${id}» на экране ${await screenName(page)}`);
  return r;
}

async function click(page, id, wait = 140) {
  const r = await target(page, id);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(wait);
}

/** Закрыть щиток клавишей Esc (в хабе тап по миру может открыть другой объект). */
async function closeCallout(page, wait = 200) {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(wait);
}

/** Тап по пустому месту мастерской (закрывает щиток): точка выбирается на сборке вверху кадра. */
async function clickWorld(page, vp, wait = 200) {
  await page.mouse.click(vp.width * 0.5, vp.height * 0.16);
  await page.waitForTimeout(wait);
}

/** Прокручивает список колесом мыши, пока цель не появится на экране, затем кликает. */
async function clickScrolling(page, id, anchor) {
  for (let i = 0; i < 25; i++) {
    const r = await page.evaluate((x) => globalThis.__VN_TEST__.target(x), id);
    if (r && r.w > 8 && r.h > 8) {
      await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
      await page.waitForTimeout(160);
      return;
    }
    await page.mouse.move(anchor.x, anchor.y);
    await page.mouse.wheel(0, 140);
    await page.waitForTimeout(120);
  }
  throw new Error(`ПРОВАЛ: цель «${id}» не нашлась при прокрутке`);
}

async function waitScreen(page, name, timeout = 15000) {
  try {
    await page.waitForFunction((n) => globalThis.__VN_TEST__.screen() === n, name, { timeout });
  } catch {
    throw new Error(`ПРОВАЛ: ожидался экран «${name}», сейчас «${await screenName(page)}»`);
  }
}

async function touch(cdp, type, points) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
}

/** Все интерактивные цели экрана (кнопки, плитки, ползунки, органы управления полётом) ≥ 44×44 CSS px и внутри окна. */
async function checkTargets(page, vp, label) {
  const res = await page.evaluate(() => {
    const app = globalThis.__VN_APP__;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const MIN = 44;
    const problems = [];
    let count = 0;
    const test = (id, x, y, w, h, fw, fh) => {
      count++;
      const issues = [];
      if ((fw ?? w) < MIN - 0.5 || (fh ?? h) < MIN - 0.5) issues.push(`размер ${Math.round(fw ?? w)}×${Math.round(fh ?? h)}`);
      if (x < -0.5 || y < -0.5 || x + w > W + 0.5 || y + h > H + 0.5) issues.push(`за окном (${Math.round(x)},${Math.round(y)} ${Math.round(w)}×${Math.round(h)})`);
      if (issues.length) problems.push(`${id}: ${issues.join(', ')}`);
    };
    for (const h of app.kit.hitsSnapshot) if (h.focusable) test(h.id, h.x, h.y, h.w, h.h, h.fw, h.fh);
    if (app.screen === 'flight') for (const [id, r] of Object.entries(app.hudTargets || {})) test(id, r.x, r.y, r.w, r.h);
    return { problems, count };
  });
  assert(res.count >= 2, `${vp.name}/${label}: найдено слишком мало целей (${res.count})`);
  assert(res.problems.length === 0, `${vp.name}/${label}: мелкие цели или вне окна: ${res.problems.join('; ')}`);
}

/** Иконки и фоны загрузились: нет ошибок загрузчика ассетов, у каждой иконки есть непустые пиксели, фон экранов нарисован артом. */
async function checkAssets(page, vp) {
  const res = await page.evaluate(() => {
    const app = globalThis.__VN_APP__;
    const out = { loadErrors: [...(app.renderer.assets?.errors || [])], empty: [], sprites: [], noSprite: [] };
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const g = cv.getContext('2d');
    const names = [...app.iconNames, ...['beacons', 'gantry', 'deluge', 'service', 'rescue', 'fuel', 'logistics', 'factory', 'weather', 'control', 'radar', 'energy', 'observation', 'recovery'].map((k) => `bld:${k}:1`)];
    for (const name of names) {
      g.clearRect(0, 0, 96, 96);
      app.kit.icons.draw(g, name, 48, 48, 64, '#ffffff');
      const d = g.getImageData(0, 0, 96, 96).data;
      let opaque = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) opaque++;
      if (opaque < 60) out.empty.push(`${name}:${opaque}`);
      (app.kit.icons.hasSprite(name) ? out.sprites : out.noSprite).push(name);
    }
    return out;
  });
  assert(res.loadErrors.length === 0, `${vp.name}: ассеты не загрузились: ${res.loadErrors.slice(0, 5).join(', ')}`);
  assert(res.empty.length === 0, `${vp.name}: пустые иконки: ${res.empty.join(', ')}`);
  for (const must of ['coin', 'fuel', 'repair', 'chute', 'capsule', 'booster', 'earth', 'moon', 'bld:gantry:1', 'bld:beacons:1']) {
    assert(res.sprites.includes(must), `${vp.name}: у иконки «${must}» нет спрайта (рисуется запасной вектор)`);
  }
  return res;
}

async function checkBackdrop(page, vp, screen, expectKind) {
  const on = await page.evaluate(() => globalThis.__VN_APP__.backdropOn);
  assert(on === true, `${vp.name}/${screen}: фон экрана не нарисован артом (${expectKind})`);
}

/**
 * Тест-страж: считает вызовы «запрещённых» примитивов только пока рисуется слой интерфейса (app.uiDrawing).
 * Ставится до загрузки страницы. drawImage считается как контроль того, что страж вообще включён.
 */
const GUARD_SCRIPT = () => {
  const guard = { fillText: 0, strokeText: 0, roundRect: 0, arcTo: 0, createLinearGradient: 0, createRadialGradient: 0, createConicGradient: 0, drawImage: 0, fillRect: 0 };
  globalThis.__UI_GUARD__ = guard;
  const proto = CanvasRenderingContext2D.prototype;
  for (const name of Object.keys(guard)) {
    const orig = proto[name];
    if (typeof orig !== 'function') continue;
    proto[name] = function patched(...args) {
      const app = globalThis.__VN_APP__;
      if (app && app.uiDrawing) guard[name]++;
      return orig.apply(this, args);
    };
  }
};

async function checkGuard(page, vp, label) {
  const g = await page.evaluate(() => ({ ...globalThis.__UI_GUARD__ }));
  const bad = ['fillText', 'strokeText', 'roundRect', 'arcTo', 'createLinearGradient', 'createRadialGradient', 'createConicGradient'].filter((k) => g[k] > 0);
  assert(bad.length === 0, `${vp.name}/${label}: в слое интерфейса запрещённые вызовы: ${bad.map((k) => `${k}=${g[k]}`).join(', ')}`);
  assert(g.drawImage > 50 && g.fillRect > 500, `${vp.name}/${label}: страж не видит рисования интерфейса (drawImage=${g.drawImage}, fillRect=${g.fillRect})`);
}


// ---------------------------------------------------------------------------------------------------------------------
// Страж текста и отступов: обход всех экранов и их состояний; каждая выведенная строка измеряется шрифтом (font-pixel) до вывода.
// Падает, если строка обрезана многоточием, вышла за кадр, налезает на другую или вплотную к краю своей рамки.
// ---------------------------------------------------------------------------------------------------------------------

async function auditState(page, vp, label, wait = 280) {
  await page.evaluate((l) => globalThis.__VN_APP__.kit.audit.enable(true, l), label);
  await page.waitForTimeout(wait);
  const issues = await page.evaluate(() => {
    const a = globalThis.__VN_APP__.kit.audit;
    const r = a.take();
    a.enable(false);
    return r;
  });
  return issues.map((i) => ({ ...i, label: `${vp.name}/${label}` }));
}

const go = (page, name, params = {}) => page.evaluate(([n, p]) => globalThis.__VN_APP__.go(n, p), [name, params]);
const setUi = (page, fn, arg) => page.evaluate(fn, arg);

/** Обходит экраны и состояния, возвращает все замечания стража. era — принудительная эпоха профиля (или null). */
async function tourScreens(page, vp, era = null) {
  const found = [];
  const audit = async (label, wait) => {
    found.push(...(await auditState(page, vp, era === null ? label : `E${era}/${label}`, wait)));
  };
  // профиль с постройками и модулями, чтобы показать как можно больше состояний
  await page.evaluate((e) => {
    const t = globalThis.__VN_TEST__;
    const p = t.profile();
    p.coins = 123456;
    p.data = 654;
    for (const k of Object.keys(p.buildings)) p.buildings[k] = Math.max(p.buildings[k], 1);
    for (const k of Object.keys(p.parts)) p.parts[k] = Math.max(p.parts[k], 1);
    p.inventory = { chute: 2, repair: 3, canister: 1, magnet: 9 };
    if (e !== null && e !== undefined) p.era = e;
    t.setProfile(p);
    globalThis.__VN_APP__.history.length = 0;
  }, era);

  // хаб
  await go(page, 'hub');
  await page.waitForTimeout(350);
  await audit('хаб');
  await setUi(page, () => { globalThis.__VN_APP__.ui.hub.era = true; });
  await audit('хаб/эпоха');
  await setUi(page, () => { const h = globalThis.__VN_APP__.ui.hub; h.era = false; h.sel = 'beacons'; });
  await audit('хаб/маяки');
  await setUi(page, () => { const h = globalThis.__VN_APP__.ui.hub; h.sel = null; });

  // стройка: все четырнадцать зданий и эпоха
  await go(page, 'base');
  await page.waitForTimeout(350);
  await audit('стройка');
  const keys = ['beacons', 'gantry', 'deluge', 'service', 'rescue', 'fuel', 'logistics', 'factory', 'weather', 'control', 'radar', 'energy', 'observation', 'recovery'];
  for (const k of keys) {
    await setUi(page, (key) => { const b = globalThis.__VN_APP__.ui.base; b.era = false; b.sel = key; }, k);
    await audit(`стройка/${k}`, 160);
  }
  await setUi(page, () => { const b = globalThis.__VN_APP__.ui.base; b.sel = null; b.era = true; });
  await audit('стройка/эпоха');

  // мастерская: каждый модуль
  await go(page, 'rocket');
  await page.waitForTimeout(350);
  await audit('мастерская');
  for (const id of ['engine', 'tank', 'hull', 'booster', 'capsule', 'legs', 'fins', 'avionics']) {
    await setUi(page, (k) => { globalThis.__VN_APP__.ui.rocket.selected = k; }, id);
    await audit(`мастерская/${id}`, 160);
  }

  // доска
  await go(page, 'journal');
  await page.waitForTimeout(350);
  await audit('доска');
  await setUi(page, () => { globalThis.__VN_APP__.ui.journal.sel = 'sheet:0'; });
  await audit('доска/лист');
  await setUi(page, () => { const a = globalThis.__VN_APP__.data.ACHIEVEMENTS[0]; globalThis.__VN_APP__.ui.journal.sel = `medal:${a.id}`; });
  await audit('доска/медаль');

  // лавка
  await go(page, 'shop');
  await page.waitForTimeout(350);
  await audit('лавка');
  for (const sel of ['item:chute', 'item:repair', 'item:canister', 'item:magnet', 'skin:wasp', 'skin:arctic', 'skin:classic']) {
    await setUi(page, (k) => { globalThis.__VN_APP__.ui.shop.sel = k; }, sel);
    await audit(`лавка/${sel}`, 160);
  }

  // пульт запуска
  await go(page, 'launch');
  await page.waitForTimeout(350);
  await audit('пульт');
  await setUi(page, () => { globalThis.__VN_APP__.ui.launch.cons = { chute: true, repair: true }; });
  await audit('пульт/расходники');

  // обратный отсчёт и полёт: сенсорный и клавиатурный макеты, пауза, справка, итоги
  for (const mode of ['on', 'off']) {
    await setUi(page, (m) => { globalThis.__VN_APP__.prefs.touchControls = m; }, mode);
    await page.evaluate(() => globalThis.__VN_APP__.startLaunch({ destination: 'earth', consumables: { chute: true, repair: true } }));
    await page.waitForTimeout(500);
    await audit(`отсчёт/${mode}`, 200);
    await page.waitForFunction(() => globalThis.__VN_TEST__.screen() === 'flight', null, { timeout: 15000 });
    await page.waitForTimeout(500);
    await audit(`полёт/${mode}`, 400);
    await page.evaluate(() => globalThis.__VN_APP__.pause());
    await audit(`пауза/${mode}`, 250);
    await page.evaluate(() => { globalThis.__VN_APP__.resume(); globalThis.__VN_APP__.queueCard('help', true); });
    await audit(`справка/${mode}`, 250);
    await page.evaluate(() => { const a = globalThis.__VN_APP__; a.cards.length = 0; a.abandon(); });
    await page.waitForFunction(() => globalThis.__VN_TEST__.screen() === 'results', null, { timeout: 15000 });
    await page.waitForTimeout(3300);
    await audit(`итоги/${mode}`, 300);
    await page.evaluate(() => { globalThis.__VN_APP__.results = null; globalThis.__VN_APP__.go('hub'); });
  }
  await setUi(page, () => { globalThis.__VN_APP__.prefs.touchControls = 'auto'; });

  // итоги после аварии и после посадки (подсказки, допуски, награды)
  for (const mission of ['crash', 'land']) {
    await go(page, 'launch');
    await page.evaluate(() => globalThis.__VN_APP__.startLaunch({ destination: 'earth', consumables: {} }));
    await page.waitForFunction(() => globalThis.__VN_TEST__.screen() === 'flight', null, { timeout: 15000 });
    if (mission === 'land') {
      await page.evaluate(() => globalThis.__VN_APP__.autoplay({ mission: 'hop', skill: 1, targetAlt: 300 }));
      await page.evaluate(() => globalThis.__VN_TEST__.step(120 * 240));
    } else {
      // авария: три секунды полной тяги, затем падение без тяги до конца полёта
      await page.evaluate(() => {
        const a = globalThis.__VN_APP__;
        const s = a.session;
        const cmd = (throttle) => ({ throttle, tilt: 0, stabilize: false, boost: false, parachute: false, canister: false, repair: false, transfer: false, pause: false });
        for (let i = 0; i < 360; i++) a.sim.step(s.flight, cmd(1), 1 / 120);
        for (let n = 0; !s.flight.ended && n < 60000; n++) a.sim.step(s.flight, cmd(0), 1 / 120);
        a.finishFlight();
      });
    }
    await page.waitForFunction(() => globalThis.__VN_TEST__.screen() === 'results', null, { timeout: 20000 });
    await page.waitForTimeout(3300);
    await audit(`итоги/${mission}`, 300);
    await page.evaluate(() => { globalThis.__VN_APP__.results = null; globalThis.__VN_APP__.go('hub'); });
  }

  // настройки: прокрутка сверху донизу
  await go(page, 'settings');
  await page.waitForTimeout(350);
  const at = { x: vp.width / 2, y: vp.height / 2 };
  for (let i = 0; i < 12; i++) {
    await audit(`настройки/${i}`, 140);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, Math.round(vp.height * 0.7));
    await page.waitForTimeout(220);
  }
  await go(page, 'hub');
  return found;
}

function formatIssues(issues) {
  return issues.map((i) => `  [${i.label}] ${i.kind}: «${i.str}»${i.other ? ` × «${i.other}»` : ''}${i.shown ? ` → «${i.shown}»` : ''} (${i.at})`).join('\n');
}

const shot = (page, vp, name) => page.screenshot({ path: path.join(outDir, `ui-${vp.name}-${name}.png`) });

async function runViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.touch ? 2 : 1,
    hasTouch: vp.touch,
    isMobile: vp.touch,
  });
  const page = await context.newPage();
  await page.addInitScript(GUARD_SCRIPT);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const cdp = vp.touch ? await context.newCDPSession(page) : null;

  await page.goto(pathToFileURL(gameFile).href);
  await page.waitForFunction(() => globalThis.__VN_TEST__, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  assert((await screenName(page)) === 'hub', `${vp.name}: после загрузки должен быть хаб`);
  await shot(page, vp, '01-hub');
  await checkTargets(page, vp, 'хаб');

  // раскладка: ориентация, безопасные зоны и доля приборов HUD
  const lay = await hook(page, () => {
    const L = globalThis.__VN_APP__.layout;
    return { orientation: L.orientation, share: L.hud.instrumentShare, w: L.w, h: L.h };
  });
  assert(lay.orientation === (vp.height > vp.width ? 'portrait' : 'landscape'), `${vp.name}: ориентация ${lay.orientation}`);
  assert(lay.share < 0.1, `${vp.name}: приборы HUD занимают ${(lay.share * 100).toFixed(1)}% кадра`);

  await checkAssets(page, vp);

  // деньги на покупки; новая игра: подсказка «ПУСК» видна
  await hook(page, () => {
    const t = globalThis.__VN_TEST__;
    const p = t.profile();
    p.coins = 5000;
    p.data = 50;
    p.inventory.chute = 1;
    t.setProfile(p);
  });

  // ---- хаб: камера. Двойной тап (и колесо на десктопе) приближает остров, ещё раз — возвращает ----
  {
    const zoom0 = await hook(page, () => globalThis.__VN_APP__.renderer.hub.view.zoom);
    await page.mouse.dblclick(vp.width * 0.55, vp.height * 0.4);
    await page.waitForTimeout(900);
    const zoom1 = await hook(page, () => globalThis.__VN_APP__.renderer.hub.view.zoom);
    assert(zoom1 > zoom0 * 1.15, `${vp.name}: двойной тап не приблизил остров (${zoom0.toFixed(2)} → ${zoom1.toFixed(2)})`);
    await shot(page, vp, '01a-hub-zoom');
    await page.mouse.dblclick(vp.width * 0.55, vp.height * 0.4);
    await page.waitForTimeout(900);
    const zoom2 = await hook(page, () => globalThis.__VN_APP__.renderer.hub.view.zoom);
    assert(zoom2 < zoom1 * 0.9, `${vp.name}: второй двойной тап не вернул вид (${zoom1.toFixed(2)} → ${zoom2.toFixed(2)})`);
    if (vp.touch) {
      // щипок двумя пальцами приближает остров
      const cx = vp.width / 2;
      const cy = vp.height * 0.4;
      const z0 = await hook(page, () => globalThis.__VN_APP__.renderer.hub.view.zoom);
      await touch(cdp, 'touchStart', [{ x: cx - 20, y: cy, id: 11 }]);
      await touch(cdp, 'touchStart', [{ x: cx - 20, y: cy, id: 11 }, { x: cx + 20, y: cy, id: 12 }]);
      for (let i = 1; i <= 8; i++) {
        await touch(cdp, 'touchMove', [{ x: cx - 20 - i * 14, y: cy, id: 11 }, { x: cx + 20 + i * 14, y: cy, id: 12 }]);
        await page.waitForTimeout(30);
      }
      await touch(cdp, 'touchEnd', []);
      await page.waitForTimeout(500);
      const z1 = await hook(page, () => globalThis.__VN_APP__.renderer.hub.view.zoom);
      assert(z1 > z0 * 1.2, `${vp.name}: щипок не приблизил остров (${z0.toFixed(2)} → ${z1.toFixed(2)})`);
      await page.mouse.dblclick(vp.width * 0.55, vp.height * 0.4);
      await page.waitForTimeout(700);
      await hook(page, () => globalThis.__VN_APP__.renderer.hub.reset?.(true));
    } else {
      await page.mouse.move(vp.width / 2, vp.height * 0.4);
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(500);
      const z1 = await hook(page, () => globalThis.__VN_APP__.renderer.hub.view.zoom);
      assert(z1 > zoom2 * 1.2, `${vp.name}: колесо не приблизило остров`);
      await hook(page, () => globalThis.__VN_APP__.renderer.hub.reset?.(true));
    }
    await page.waitForTimeout(300);
  }

  // ---- хаб: щиток Памятника эпох по тапу на табличку эпохи ----
  await click(page, 'plate-era', 300);
  await target(page, 'era-advance');
  await shot(page, vp, '01c-hub-era');
  await closeCallout(page);
  assert(!(await hook(page, () => !!globalThis.__VN_TEST__.target('era-advance'))), `${vp.name}: щиток эпохи не закрылся по Esc`);

  // ---- полная работа с клавиатуры: фокус стрелками, Enter, Esc ----
  const navSet = ['dock-rocket', 'dock-base', 'dock-journal', 'dock-shop'];
  await hook(page, () => globalThis.__VN_APP__.kit.setFocus('dock-launch'));
  await page.keyboard.press(vp.height > vp.width ? 'ArrowUp' : 'ArrowLeft');
  await page.waitForTimeout(110);
  let focus = await hook(page, () => globalThis.__VN_APP__.kit.S.focusId);
  for (let i = 0; i < 8 && focus !== 'dock-rocket'; i++) {
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(110);
    focus = await hook(page, () => globalThis.__VN_APP__.kit.S.focusId);
  }
  assert(navSet.includes(focus) && focus === 'dock-rocket', `${vp.name}: фокус не дошёл до кнопки «Ракета» стрелками (${focus})`);
  await shot(page, vp, '01b-hub-focus');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  assert((await screenName(page)) === 'rocket', `${vp.name}: Enter не открыл мастерскую`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  assert((await screenName(page)) === 'hub', `${vp.name}: Esc не вернул в хаб`);

  // ---- строительство: купить маяки через щиток у плитки ----
  await click(page, 'dock-base');
  await waitScreen(page, 'base');
  await shot(page, vp, '02-base');
  await checkTargets(page, vp, 'строительство');
  await click(page, 'bld-beacons');
  await shot(page, vp, '03-base-card');
  await click(page, 'build-beacons', 300);
  let p = await hook(page, () => globalThis.__VN_TEST__.profile());
  assert(p.buildings.beacons === 1, `${vp.name}: маяки не построены через интерфейс`);
  await page.waitForTimeout(1400);
  await closeCallout(page);
  await click(page, 'plate-era');
  await target(page, 'era-advance');
  await shot(page, vp, '04-base-era');
  await closeCallout(page);
  await click(page, 'back');
  assert((await screenName(page)) === 'hub', `${vp.name}: возврат в хаб со стройки`);

  // ---- хаб: тап по построенной постройке открывает щиток у здания ----
  const pos = await hook(page, () => globalThis.__VN_APP__.renderer.hub.screenPos?.('beacons') || null);
  if (pos && pos.x > 0 && pos.y > 0 && pos.x < vp.width && pos.y < vp.height) {
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(500);
    const selected = await hook(page, () => globalThis.__VN_APP__.hubSelected);
    assert(selected === 'beacons', `${vp.name}: тап по маякам не открыл щиток (${selected})`);
    await target(page, 'build-beacons');
    await shot(page, vp, '05-hub-card');
    await closeCallout(page);
  }

  // ---- мастерская: узел модуля, «было → станет», покупка, смена ориентации на лету ----
  await click(page, 'dock-rocket');
  await waitScreen(page, 'rocket');
  await click(page, 'part-legs');
  await shot(page, vp, '06-rocket');
  await checkBackdrop(page, vp, 'мастерская', 'workshop');
  await checkTargets(page, vp, 'мастерская');
  await click(page, 'buy-legs', 300);
  p = await hook(page, () => globalThis.__VN_TEST__.profile());
  assert(p.parts.legs === 1, `${vp.name}: опоры не куплены через интерфейс`);
  const flipped = vp.height > vp.width ? { width: vp.height, height: vp.width } : { width: 390, height: 844 };
  await page.setViewportSize(flipped);
  await page.waitForTimeout(500);
  const after = await hook(page, () => ({ o: globalThis.__VN_APP__.layout.orientation, sel: globalThis.__VN_APP__.ui.rocket.selected, screen: globalThis.__VN_TEST__.screen() }));
  assert(after.o === (flipped.height > flipped.width ? 'portrait' : 'landscape'), `${vp.name}: ориентация не сменилась на лету`);
  assert(after.sel === 'legs' && after.screen === 'rocket', `${vp.name}: состояние потеряно при смене ориентации`);
  await shot(page, vp, '07-rocket-flipped');
  await click(page, 'part-engine');
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(500);
  await clickWorld(page, vp);
  await click(page, 'stand', 300);
  await page.waitForTimeout(400);
  await click(page, 'back');

  // ---- доска: листы контрактов и полка наград ----
  await click(page, 'dock-journal');
  await waitScreen(page, 'journal');
  await shot(page, vp, '08-journal');
  await checkBackdrop(page, vp, 'доска', 'workshop');
  await checkTargets(page, vp, 'доска');
  const firstSheet = await hook(page, () => !!globalThis.__VN_TEST__.target('sheet-0'));
  if (firstSheet) {
    await click(page, 'sheet-0', 250);
    await shot(page, vp, '08b-journal-sheet');
    await closeCallout(page);
  }
  const medal = await hook(page, () => `medal-${globalThis.__VN_APP__.data.ACHIEVEMENTS[0]?.id}`);
  await click(page, medal, 250);
  await shot(page, vp, '08c-journal-medal');
  await click(page, 'back');
  await waitScreen(page, 'hub');

  // ---- лавка: расходники и краски на полках, щиток «купить» ----
  await click(page, 'dock-shop');
  await waitScreen(page, 'shop');
  await shot(page, vp, '08d-shop');
  await checkBackdrop(page, vp, 'лавка', 'shop');
  await checkTargets(page, vp, 'лавка');
  await click(page, 'shelf-repair', 250);
  await shot(page, vp, '08e-shop-item');
  await click(page, 'shop-buy-repair', 250);
  p = await hook(page, () => globalThis.__VN_TEST__.profile());
  assert(p.inventory.repair === 1, `${vp.name}: ремкомплект не куплен в лавке`);
  await closeCallout(page);
  await click(page, 'shelf-skin-wasp', 250);
  await click(page, 'skin-wasp', 250);
  p = await hook(page, () => globalThis.__VN_TEST__.profile());
  assert(p.skins.includes('wasp') && p.skin === 'wasp', `${vp.name}: краска не куплена в лавке`);
  await click(page, 'back');

  // ---- настройки ----
  await click(page, 'hub-gear');
  await waitScreen(page, 'settings');
  const scrollAt = { x: vp.width / 2, y: vp.height / 2 };
  await clickScrolling(page, 'set-mode-pilot', scrollAt);
  const mode = await hook(page, () => globalThis.__VN_TEST__.profile().settings.controlMode);
  assert(mode === 'pilot', `${vp.name}: режим «Пилот» не включился`);
  await shot(page, vp, '09-settings');
  await checkTargets(page, vp, 'настройки');
  await clickScrolling(page, 'set-mode-arcade', scrollAt);
  await click(page, 'back');

  // ---- пульт запуска → полёт ----
  await click(page, 'dock-launch');
  await waitScreen(page, 'launch');
  await shot(page, vp, '10-launch');
  await checkBackdrop(page, vp, 'запуск', 'launch-earth');
  await page.evaluate(() => { globalThis.__VN_APP__.ui.launch.dest = 'moon'; });
  await page.waitForTimeout(250);
  await checkBackdrop(page, vp, 'запуск-луна', 'launch-moon');
  await shot(page, vp, '10b-launch-moon-backdrop');
  await page.evaluate(() => { globalThis.__VN_APP__.ui.launch.dest = 'earth'; });
  await checkTargets(page, vp, 'запуск');
  // закрытая цель: отказ (дрожание) и подсказка
  await click(page, 'launch-dest-moon', 100);
  await shot(page, vp, '10c-launch-denied');
  await click(page, 'launch-start');
  await page.waitForTimeout(700);
  await shot(page, vp, '11-countdown');
  await waitScreen(page, 'flight');
  await page.waitForTimeout(400);
  await shot(page, vp, '12-flight-pad');
  await checkTargets(page, vp, 'полёт');

  // тяга: касанием рычага (сенсорный макет) или клавишей W
  const alt0 = await hook(page, () => globalThis.__VN_TEST__.flight().alt);
  if (vp.touch) {
    const lever = await target(page, 'flight-thrust');
    await touch(cdp, 'touchStart', [{ x: lever.x + lever.w / 2, y: lever.y + lever.h * 0.2, id: 1 }]);
    await page.waitForFunction(() => globalThis.__VN_TEST__.flight().throttle > 0.5, null, { timeout: 8000 }).catch(() => {});
    const thr = await hook(page, () => globalThis.__VN_TEST__.flight().throttle);
    assert(thr > 0.5, `${vp.name}: касание рычага не дало тягу (${thr})`);
    // диск наклона вторым пальцем (мультитач)
    const disc = await target(page, 'flight-tilt');
    await touch(cdp, 'touchStart', [{ x: lever.x + lever.w / 2, y: lever.y + lever.h * 0.2, id: 1 }, { x: disc.x + disc.w * 0.9, y: disc.y + disc.h / 2, id: 2 }]);
    await page.waitForTimeout(500);
    const tilted = await hook(page, () => Math.abs(globalThis.__VN_TEST__.flight().angle));
    assert(tilted > 0.01, `${vp.name}: диск наклона не наклонил ракету`);
    await shot(page, vp, '13-flight-touch');
    await touch(cdp, 'touchEnd', []);
    await page.waitForTimeout(200);
    const released = await hook(page, () => globalThis.__VN_APP__.input.touch.active());
    assert(released === false, `${vp.name}: захват пальцев не освобождён после touchEnd`);
  } else {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1800);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    await shot(page, vp, '13-flight-keys');
    await page.keyboard.up('KeyD');
    await page.keyboard.up('KeyW');
  }
  const alt1 = await hook(page, () => globalThis.__VN_TEST__.flight().alt);
  assert(alt1 > alt0 + 3, `${vp.name}: ракета не набирает высоту (${alt0} → ${alt1})`);

  // потеря фокуса окна отпускает управление
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(150);
  const heldAfterBlur = await hook(page, () => globalThis.__VN_APP__.session?.lastInput?.throttle ?? 0);
  assert(heldAfterBlur === 0, `${vp.name}: клавиши не отпущены на blur (${heldAfterBlur})`);
  await page.keyboard.up('KeyW');

  // пауза и возобновление (пауза до падения ракеты, чтобы проверка не зависела от скорости машины)
  await click(page, 'flight-pause', 300);
  assert(await hook(page, () => globalThis.__VN_APP__.session.paused), `${vp.name}: пауза не включилась`);
  await shot(page, vp, '14-pause');
  const tPause = await hook(page, () => globalThis.__VN_TEST__.flight().time);
  await page.waitForTimeout(400);
  assert((await hook(page, () => globalThis.__VN_TEST__.flight().time)) === tPause, `${vp.name}: время идёт на паузе`);

  // смена ориентации во время полёта (на паузе): полёт и время сохраняются, органы управления перестраиваются
  {
    const flip = vp.height > vp.width ? { width: vp.height, height: vp.width } : { width: 390, height: 844 };
    await page.setViewportSize(flip);
    await page.waitForTimeout(500);
    const mid = await hook(page, () => ({ t: globalThis.__VN_TEST__.flight().time, o: globalThis.__VN_APP__.layout.orientation, screen: globalThis.__VN_TEST__.screen(), paused: globalThis.__VN_APP__.session.paused }));
    assert(mid.screen === 'flight' && mid.t === tPause && mid.paused, `${vp.name}: полёт потерян при смене ориентации`);
    assert(mid.o === (flip.height > flip.width ? 'portrait' : 'landscape'), `${vp.name}: ориентация в полёте не сменилась`);
    await target(page, 'flight-resume');
    await shot(page, vp, '13b-flight-flipped');
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(400);
  }
  await click(page, 'flight-resume');
  assert(!(await hook(page, () => globalThis.__VN_APP__.session.paused)), `${vp.name}: пауза не снялась`);
  await target(page, 'flight-pause');

  // ---- итоги: бланк со штампом, «Ещё раз», «На базу» ----
  await page.evaluate(() => globalThis.__VN_TEST__.step(120 * 240));
  await waitScreen(page, 'results', 20000);
  await page.waitForTimeout(3200);
  await shot(page, vp, '15-results');
  await checkTargets(page, vp, 'итоги');
  await click(page, 'results-again', 300);
  await page.waitForTimeout(500);
  await waitScreen(page, 'flight', 20000);
  await click(page, 'flight-pause', 300);
  await click(page, 'flight-abandon', 200);
  await click(page, 'flight-abandon', 300);
  await waitScreen(page, 'results');
  await page.waitForTimeout(900);
  await shot(page, vp, '16-results-abandoned');
  await click(page, 'results-base');
  assert((await screenName(page)) === 'hub', `${vp.name}: возврат на базу после итогов`);

  // сохранение пережило перезагрузку
  const coins = await hook(page, () => globalThis.__VN_TEST__.profile().coins);
  await checkGuard(page, vp, 'весь обход');
  await page.reload();
  await page.waitForFunction(() => globalThis.__VN_TEST__, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const saved = await hook(page, () => globalThis.__VN_TEST__.profile());
  assert(saved.coins === coins && saved.buildings.beacons === 1 && saved.parts.legs === 1, `${vp.name}: прогресс не сохранился`);

  // страж текста и отступов на всех экранах
  const issues = await tourScreens(page, vp);
  assert(issues.length === 0, `${vp.name}: текст не помещается (${issues.length}):
${formatIssues(issues)}`);
  await checkGuard(page, vp, 'обход экранов');

  const hookErrors = await hook(page, () => globalThis.__VN_TEST__.errors || []);
  assert(errors.length === 0 && hookErrors.length === 0, `${vp.name}: ошибки: ${[...errors, ...hookErrors].join(' | ')}`);
  await context.close();
  console.log(`OK ${vp.name} ${vp.width}x${vp.height}`);
}

/** Только страж текста на минимальных размерах окна (320×568 и 568×320). */
async function runAuditViewport(browser, vp, collect = null) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.addInitScript(GUARD_SCRIPT);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(pathToFileURL(gameFile).href);
  await page.waitForFunction(() => globalThis.__VN_TEST__, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const issues = await tourScreens(page, vp);
  await shot(page, vp, '01-hub');
  if (collect) collect.push(...issues);
  else assert(issues.length === 0, `${vp.name}: текст не помещается (${issues.length}):
${formatIssues(issues)}`);
  await checkGuard(page, vp, 'обход экранов');
  const hookErrors = await hook(page, () => globalThis.__VN_TEST__.errors || []);
  assert(errors.length === 0 && hookErrors.length === 0, `${vp.name}: ошибки: ${[...errors, ...hookErrors].join(' | ')}`);
  await context.close();
  console.log(`OK ${vp.name} ${vp.width}x${vp.height} (страж текста)`);
}

(async () => {
  if (!fs.existsSync(gameFile)) {
    console.log('Сборки нет, собираю…');
    const res = spawnSync(process.execPath, [path.join(root, 'game', 'tools', 'build.mjs')], { stdio: 'inherit' });
    assert(res.status === 0 && fs.existsSync(gameFile), 'сборка не удалась');
  }
  const browser = await launch();
  try {
    if (process.env.UI_AUDIT_ONLY) {
      // отладка стража текста: все размеры окна, замечания собираются и печатаются целиком
      const all = [];
      for (const vp of [...VIEWPORTS, ...AUDIT_VIEWPORTS]) await runAuditViewport(browser, { touch: true, ...vp }, all);
      console.log(all.length ? `Замечаний: ${all.length}
${formatIssues(all)}` : 'Замечаний нет');
      process.exit(all.length ? 1 : 0);
    }
    for (const vp of VIEWPORTS) await runViewport(browser, vp);
    for (const vp of AUDIT_VIEWPORTS) await runAuditViewport(browser, vp);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
