// Браузерная проверка интерфейса и ввода (Playwright): обе раскладки, смена ориентации на лету, покупки через интерфейс,
// сенсорное управление настоящими touch-событиями, пауза, итоги, ноль ошибок консоли. Снимки: work/ui-*.png.
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

async function touch(cdp, type, x, y, id = 1) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id }] });
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const cdp = vp.touch ? await context.newCDPSession(page) : null;

  await page.goto(pathToFileURL(gameFile).href);
  await page.waitForFunction(() => globalThis.__VN_TEST__, null, { timeout: 20000 });
  await page.waitForTimeout(700);
  assert((await screenName(page)) === 'hub', `${vp.name}: после загрузки должен быть хаб`);
  await shot(page, vp, '01-hub');

  // раскладка: ориентация, безопасные зоны и доля приборов HUD
  const lay = await hook(page, () => {
    const L = globalThis.__VN_APP__.layout;
    return { orientation: L.orientation, share: L.hud.instrumentShare, w: L.w, h: L.h };
  });
  assert(lay.orientation === (vp.height > vp.width ? 'portrait' : 'landscape'), `${vp.name}: ориентация ${lay.orientation}`);
  assert(lay.share < 0.1, `${vp.name}: приборы HUD занимают ${(lay.share * 100).toFixed(1)}% кадра`);

  // деньги на покупки; новая игра: подсказка «Запуск» видна
  await hook(page, () => {
    const t = globalThis.__VN_TEST__;
    const p = t.profile();
    p.coins = 5000;
    p.data = 50;
    p.inventory.chute = 1;
    t.setProfile(p);
  });

  // ---- база: купить маяки через интерфейс ----
  await click(page, 'dock-base');
  await waitScreen(page, 'base');
  await shot(page, vp, '02-base');
  await click(page, 'bld-beacons');
  await shot(page, vp, '03-base-card');
  await click(page, 'build-beacons', 250);
  let p = await hook(page, () => globalThis.__VN_TEST__.profile());
  assert(p.buildings.beacons === 1, `${vp.name}: маяки не построены через интерфейс`);
  await click(page, 'card-close');
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(250);
  await click(page, 'base-tabs-era');
  await shot(page, vp, '04-base-era');
  await click(page, 'back');
  assert((await screenName(page)) === 'hub', `${vp.name}: возврат в хаб с базы`);

  // ---- хаб: тап по построенной постройке открывает карточку ----
  const pos = await hook(page, () => globalThis.__VN_APP__.renderer.hub.screenPos?.('beacons') || null);
  if (pos) {
    await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(250);
    const selected = await hook(page, () => globalThis.__VN_APP__.hubSelected);
    assert(selected === 'beacons', `${vp.name}: тап по маякам не открыл карточку (${selected})`);
    await shot(page, vp, '05-hub-card');
    await click(page, 'card-close');
  }

  // ---- ракета: модуль, «было → станет», покупка, смена ориентации на лету ----
  await click(page, 'dock-rocket');
  await waitScreen(page, 'rocket');
  await click(page, 'part-legs');
  await shot(page, vp, '06-rocket');
  await click(page, 'buy-legs', 250);
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
  await click(page, 'stand', 300);
  await page.waitForTimeout(400);
  await click(page, 'back');

  // ---- журнал, настройки ----
  await click(page, 'dock-journal');
  await waitScreen(page, 'journal');
  for (const tab of ['achievements', 'shop', 'skins', 'contracts']) {
    await click(page, `journal-tabs-${tab}`);
    if (tab === 'shop') await shot(page, vp, '08-journal-shop');
  }
  await click(page, 'back');
  await click(page, 'dock-more');
  await click(page, 'more-settings');
  await waitScreen(page, 'settings');
  const scrollAt = { x: vp.width / 2, y: vp.height / 2 };
  await clickScrolling(page, 'set-mode-pilot', scrollAt);
  const mode = await hook(page, () => globalThis.__VN_TEST__.profile().settings.controlMode);
  assert(mode === 'pilot', `${vp.name}: режим «Пилот» не включился`);
  await shot(page, vp, '09-settings');
  await clickScrolling(page, 'set-mode-arcade', scrollAt);
  await click(page, 'back');

  // ---- запуск → полёт ----
  await click(page, 'dock-launch');
  await waitScreen(page, 'launch');
  await shot(page, vp, '10-launch');
  await click(page, 'launch-start');
  await page.waitForTimeout(700);
  await shot(page, vp, '11-countdown');
  await waitScreen(page, 'flight');
  await page.waitForTimeout(400);
  await shot(page, vp, '12-flight-pad');

  // тяга: касанием рычага (сенсорный макет) или клавишей W
  const alt0 = await hook(page, () => globalThis.__VN_TEST__.flight().alt);
  if (vp.touch) {
    const lever = await target(page, 'flight-thrust');
    await touch(cdp, 'touchStart', lever.x + lever.w / 2, lever.y + lever.h * 0.2);
    await page.waitForTimeout(1600);
    const thr = await hook(page, () => globalThis.__VN_TEST__.flight().throttle);
    assert(thr > 0.5, `${vp.name}: касание рычага не дало тягу (${thr})`);
    // диск наклона вторым пальцем (мультитач)
    const disc = await target(page, 'flight-tilt');
    await touch(cdp, 'touchStart', disc.x + disc.w * 0.9, disc.y + disc.h / 2, 2);
    await page.waitForTimeout(500);
    const tilted = await hook(page, () => Math.abs(globalThis.__VN_TEST__.flight().angle));
    assert(tilted > 0.01, `${vp.name}: диск наклона не наклонил ракету`);
    await shot(page, vp, '13-flight-touch');
    await touch(cdp, 'touchEnd', 0, 0);
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

  // пауза и возобновление
  await click(page, 'flight-pause', 300);
  assert(await hook(page, () => globalThis.__VN_APP__.session.paused), `${vp.name}: пауза не включилась`);
  await shot(page, vp, '14-pause');
  const tPause = await hook(page, () => globalThis.__VN_TEST__.flight().time);
  await page.waitForTimeout(400);
  assert((await hook(page, () => globalThis.__VN_TEST__.flight().time)) === tPause, `${vp.name}: время идёт на паузе`);
  await click(page, 'flight-resume');
  assert(!(await hook(page, () => globalThis.__VN_APP__.session.paused)), `${vp.name}: пауза не снялась`);

  // ---- итоги: прерванный/аварийный полёт, «Ещё раз», «На базу» ----
  await page.evaluate(() => globalThis.__VN_TEST__.step(120 * 240));
  await waitScreen(page, 'results', 20000);
  await page.waitForTimeout(2200);
  await shot(page, vp, '15-results');
  await click(page, 'results-again', 300);
  await page.waitForTimeout(500);
  await waitScreen(page, 'flight', 20000);
  await click(page, 'flight-pause', 300);
  await click(page, 'flight-abandon', 200);
  await click(page, 'flight-abandon', 300);
  await waitScreen(page, 'results');
  await page.waitForTimeout(800);
  await shot(page, vp, '16-results-abandoned');
  await click(page, 'results-base');
  assert((await screenName(page)) === 'hub', `${vp.name}: возврат на базу после итогов`);

  // сохранение пережило перезагрузку
  const coins = await hook(page, () => globalThis.__VN_TEST__.profile().coins);
  await page.reload();
  await page.waitForFunction(() => globalThis.__VN_TEST__, null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const saved = await hook(page, () => globalThis.__VN_TEST__.profile());
  assert(saved.coins === coins && saved.buildings.beacons === 1 && saved.parts.legs === 1, `${vp.name}: прогресс не сохранился`);

  const hookErrors = await hook(page, () => globalThis.__VN_TEST__.errors || []);
  assert(errors.length === 0 && hookErrors.length === 0, `${vp.name}: ошибки: ${[...errors, ...hookErrors].join(' | ')}`);
  await context.close();
  console.log(`OK ${vp.name} ${vp.width}x${vp.height}`);
}

(async () => {
  if (!fs.existsSync(gameFile)) {
    console.log('Сборки нет, собираю…');
    const res = spawnSync(process.execPath, [path.join(root, 'game', 'tools', 'build.mjs')], { stdio: 'inherit' });
    assert(res.status === 0 && fs.existsSync(gameFile), 'сборка не удалась');
  }
  const browser = await launch();
  try {
    for (const vp of VIEWPORTS) await runViewport(browser, vp);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
