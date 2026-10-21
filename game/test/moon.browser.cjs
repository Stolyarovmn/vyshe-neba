// Браузерная проверка межпланетного пути: запуск на Луну и на Марс через интерфейс, автопилот (хук autoplay/fastForward),
// перелёт, посадка, экран итогов с отчётом и веха milestones.moonLanding / marsLanding. Снимки: work/moon-*.png.
// Профили как в game/tools/probe-landing.mjs. Перед запуском: npm run game:build (собирается автоматически при отсутствии).
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
  { name: 'landscape', width: 1280, height: 720, mobile: false },
  { name: 'portrait', width: 390, height: 844, mobile: true },
];
const MAX_ATTEMPTS = 10;

function launch() {
  const exe = process.env.CHROMIUM_EXECUTABLE_PATH;
  const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'];
  return chromium.launch(exe ? { executablePath: exe, args } : { channel: 'chrome', args });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ПРОВАЛ: ${msg}`);
}

const screenName = (page) => page.evaluate(() => globalThis.__VN_TEST__.screen());

async function click(page, id, wait = 150) {
  const r = await page.evaluate((i) => globalThis.__VN_TEST__.target(i), id);
  assert(r, `нет цели «${id}» на экране ${await screenName(page)}`);
  await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  await page.waitForTimeout(wait);
}

async function waitScreen(page, name, timeout = 20000) {
  try {
    await page.waitForFunction((n) => globalThis.__VN_TEST__.screen() === n, name, { timeout });
  } catch {
    throw new Error(`ПРОВАЛ: ожидался экран «${name}», сейчас «${await screenName(page)}»`);
  }
}

// Профиль эпохи под цель (как probe-landing.mjs): все модули и постройки на нужном уровне.
function prepareProfile(profile, destination) {
  const moon = destination === 'moon';
  profile.era = moon ? 3 : 4;
  const lvl = moon ? 10 : 13;
  for (const k of Object.keys(profile.parts)) profile.parts[k] = lvl;
  for (const k of Object.keys(profile.buildings)) profile.buildings[k] = moon ? 4 : 5;
  profile.milestones.moonLanding = !moon;
  profile.milestones.marsLanding = false;
  profile.coins = 20000;
  profile.data = 2000;
  profile.stats.flights = 5;
  profile.settings.tutorial = { done: true, step: 99 };
  return profile;
}

async function flyTo(page, vp, destination) {
  const milestone = destination === 'moon' ? 'moonLanding' : 'marsLanding';
  const base = await page.evaluate(() => globalThis.__VN_TEST__.profile());
  const prepared = prepareProfile(base, destination);
  await page.evaluate((p) => globalThis.__VN_TEST__.setProfile(p), prepared);
  await page.waitForTimeout(200);
  let outcomes = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await page.evaluate((n) => globalThis.__VN_TEST__.seed(n), attempt);
    assert((await screenName(page)) === 'hub', `${vp.name}/${destination}: попытка ${attempt} начинается не с хаба`);
    await click(page, 'dock-launch');
    await waitScreen(page, 'launch');
    await click(page, `launch-dest-${destination}`);
    if (attempt === 1) await page.screenshot({ path: path.join(outDir, `moon-${vp.name}-${destination}-launch.png`) });
    await click(page, 'launch-start');
    await waitScreen(page, 'flight');
    await page.waitForTimeout(300);
    assert(await page.evaluate(() => globalThis.__VN_TEST__.autoplay({ mission: 'space', skill: 1 })), `${vp.name}/${destination}: autoplay не включился`);
    const mid = await page.evaluate(() => globalThis.__VN_TEST__.fastForward(25));
    if (attempt === 1) {
      await page.screenshot({ path: path.join(outDir, `moon-${vp.name}-${destination}-flight.png`) });
      assert(mid && mid.alt > 100, `${vp.name}/${destination}: автопилот не набирает высоту (${JSON.stringify(mid)})`);
    }
    const end = await page.evaluate(() => globalThis.__VN_TEST__.fastForward());
    assert(end && end.ended, `${vp.name}/${destination}: полёт не завершился (${JSON.stringify(end)})`);
    await waitScreen(page, 'results');
    await page.waitForTimeout(2300);
    const res = await page.evaluate(() => {
      const r = globalThis.__VN_APP__.results;
      return { outcome: r.result.outcome, reason: r.result.reason, body: r.report.body, destination: r.result.destination, transferred: r.result.transferred };
    });
    outcomes.push(`${res.outcome}:${res.reason}`);
    await page.screenshot({ path: path.join(outDir, `moon-${vp.name}-${destination}-results-${attempt}.png`) });
    if (res.outcome === 'landed') {
      assert(res.body === destination, `${vp.name}/${destination}: отчёт про «${res.body}»`);
      assert(res.transferred, `${vp.name}/${destination}: перелёт не отмечен в результате`);
      const profile = await page.evaluate(() => globalThis.__VN_TEST__.profile());
      assert(profile.milestones[milestone] === true, `${vp.name}/${destination}: веха ${milestone} не выставлена`);
      assert(profile.stats[destination] >= 1, `${vp.name}/${destination}: статистика посадок не выросла`);
      await click(page, 'results-base');
      assert((await screenName(page)) === 'hub', `${vp.name}/${destination}: возврат на базу после итогов`);
      console.log(`  ${destination}: посадка с попытки ${attempt} (${outcomes.join(', ')})`);
      return;
    }
    await click(page, 'results-base');
  }
  throw new Error(`ПРОВАЛ: ${vp.name}/${destination}: посадка не удалась за ${MAX_ATTEMPTS} попыток: ${outcomes.join(', ')}`);
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
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(pathToFileURL(gameFile).href);
  await page.waitForFunction(() => globalThis.__VN_TEST__, null, { timeout: 20000 });
  await page.waitForTimeout(600);

  await flyTo(page, vp, 'moon');
  await flyTo(page, vp, 'mars');

  const hookErrors = await page.evaluate(() => globalThis.__VN_TEST__.errors || []);
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
