// Браузерная проверка собранной игры: обе раскладки, реальные клики мышью, сценарий «первый полёт».
// Использует хук globalThis.__VN_TEST__ (см. game/docs/ARCHITECTURE.md). Перед запуском: npm run game:build.
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const gameFile = process.env.GAME_FILE || path.join(root, 'game', 'dist', 'vyshe-neba.html');
const outDir = path.join(root, 'work');
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844, mobile: true },
  { name: 'landscape', width: 1280, height: 720, mobile: false },
  { name: 'phone-landscape', width: 844, height: 390, mobile: true },
];

function launch() {
  const exe = process.env.CHROMIUM_EXECUTABLE_PATH;
  const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'];
  return chromium.launch(exe ? { executablePath: exe, args } : { channel: 'chrome', args });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ПРОВАЛ: ${msg}`);
}

async function click(page, id) {
  const r = await page.evaluate((i) => globalThis.__VN_TEST__.target(i), id);
  assert(r, `нет цели интерфейса «${id}» на экране ${await page.evaluate(() => globalThis.__VN_TEST__.screen())}`);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(120);
}

async function screen(page) {
  return page.evaluate(() => globalThis.__VN_TEST__.screen());
}

async function runViewport(browser, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    hasTouch: vp.mobile,
    isMobile: vp.mobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  await page.goto(pathToFileURL(gameFile).href);
  await page.waitForFunction(() => globalThis.__VN_TEST__, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  assert((await screen(page)) === 'hub', `${vp.name}: после загрузки должен быть хаб`);
  await page.screenshot({ path: path.join(outDir, `next-${vp.name}-hub.png`) });

  // хаб → ракета: покупка первого модуля
  await page.evaluate(() => { const t = globalThis.__VN_TEST__; const p = t.profile(); p.coins = 5000; t.setProfile(p); });
  await click(page, 'dock-rocket');
  assert((await screen(page)) === 'rocket', `${vp.name}: экран ракеты`);
  await page.screenshot({ path: path.join(outDir, `next-${vp.name}-rocket.png`) });
  await click(page, 'part-engine');
  await page.screenshot({ path: path.join(outDir, `next-${vp.name}-rocket-part.png`) });
  await click(page, 'back');
  assert((await screen(page)) === 'hub', `${vp.name}: возврат в хаб`);

  // база и журнал открываются
  for (const [dock, name] of [['dock-base', 'base'], ['dock-journal', 'journal']]) {
    await click(page, dock);
    assert((await screen(page)) === name, `${vp.name}: экран ${name}`);
    await page.screenshot({ path: path.join(outDir, `next-${vp.name}-${name}.png`) });
    await click(page, 'back');
  }

  // запуск → полёт
  await click(page, 'dock-launch');
  assert((await screen(page)) === 'launch', `${vp.name}: экран запуска`);
  await page.screenshot({ path: path.join(outDir, `next-${vp.name}-launch.png`) });
  await click(page, 'launch-start');
  await page.waitForFunction(() => globalThis.__VN_TEST__.screen() === 'flight', null, { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, `next-${vp.name}-flight-pad.png`) });

  // удерживаем тягу кнопкой/клавишей несколько секунд симуляции
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(outDir, `next-${vp.name}-flight-climb.png`) });
  const alt = await page.evaluate(() => globalThis.__VN_TEST__.flight().alt);
  assert(alt > 20, `${vp.name}: ракета должна набирать высоту (alt=${alt})`);
  await page.keyboard.up('KeyW');

  // быстро доигрываем полёт до итогов через хук (без рендера)
  await page.evaluate(() => globalThis.__VN_TEST__.step(120 * 240));
  await page.waitForFunction(() => globalThis.__VN_TEST__.screen() === 'results', null, { timeout: 15000 });
  await page.screenshot({ path: path.join(outDir, `next-${vp.name}-results.png`) });
  await click(page, 'results-base');
  assert((await screen(page)) === 'hub', `${vp.name}: возврат на базу после итогов`);

  const hookErrors = await page.evaluate(() => globalThis.__VN_TEST__.errors || []);
  assert(errors.length === 0 && hookErrors.length === 0, `${vp.name}: ошибки в консоли: ${[...errors, ...hookErrors].join(' | ')}`);
  await context.close();
  console.log(`OK ${vp.name} ${vp.width}x${vp.height}`);
}

(async () => {
  assert(fs.existsSync(gameFile), `нет сборки ${gameFile}; выполните npm run game:build`);
  const browser = await launch();
  try {
    for (const vp of VIEWPORTS) await runViewport(browser, vp);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message || e); process.exit(1); });
