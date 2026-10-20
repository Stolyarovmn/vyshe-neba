// Браузерная проверка рендера (Playwright): превью хаба и полёта в портрете и ландшафте,
// ноль ошибок консоли, ассеты загружены, картинка не пустая, скриншоты в work/render-*.png.
// Запуск: node game/test/render.browser.cjs   (сервер статики поднимается сам)
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { startStaticServer } = require('./render-static-server.cjs');

const root = path.resolve(__dirname, '..', '..');
const outDir = path.join(root, 'work');
fs.mkdirSync(outDir, { recursive: true });

const VIEWPORTS = [
  { name: 'portrait', width: 390, height: 844, dpr: 2, mobile: true },
  { name: 'landscape', width: 1280, height: 720, dpr: 1, mobile: false },
  { name: 'phone-landscape', width: 844, height: 390, dpr: 2, mobile: true },
];

function launch() {
  const exe = process.env.CHROMIUM_EXECUTABLE_PATH;
  const args = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'];
  return chromium.launch(exe ? { executablePath: exe, args } : { channel: 'chrome', args });
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ПРОВАЛ: ${msg}`);
}

/** Сколько различных цветов на сетке точек холста (пустая или залитая одним цветом картинка даст 1). */
async function distinctColors(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('canvas');
    const g = canvas.getContext('2d');
    const seen = new Set();
    for (let i = 1; i < 24; i++) {
      for (let j = 1; j < 24; j++) {
        const d = g.getImageData(Math.floor((canvas.width * i) / 24), Math.floor((canvas.height * j) / 24), 1, 1).data;
        seen.add(`${d[0] >> 4},${d[1] >> 4},${d[2] >> 4}`);
      }
    }
    return seen.size;
  });
}

async function openPreview(browser, base, vp, query) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    hasTouch: vp.mobile,
    isMobile: vp.mobile,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(`${base}/game/src/render/dev/preview.html?embed=1&hud=0&frame=fit&manual=1&${query}`);
  await page.waitForFunction(() => document.title === 'Render preview ready', null, { timeout: 30000 });
  return { page, context, errors };
}

async function checkHub(browser, base, vp) {
  const { page, context, errors } = await openPreview(browser, base, vp, 'mode=hub&buildings=all&era=2&booster=1&capsule=1&weather=cloudy&t=4');
  const info = await page.evaluate(() => {
    const p = window.__preview;
    p.advance(30);
    return { assetErrors: p.assets.errors, assets: p.assets.size, layout: p.renderer.layout(innerWidth, innerHeight, devicePixelRatio, {}) };
  });
  assert(info.assetErrors.length === 0, `${vp.name}: ошибки ассетов ${info.assetErrors.join('; ')}`);
  assert(info.assets > 180, `${vp.name}: загружено ассетов ${info.assets}`);
  const colors = await distinctColors(page);
  assert(colors > 25, `${vp.name}: хаб выглядит пустым (${colors} цветов)`);

  // тап по постройке находит постройку через hitTest
  const hit = await page.evaluate(() => {
    const hub = window.__preview.renderer.hub;
    const result = {};
    for (const key of ['beacons', 'gantry', 'deluge', 'rocket']) {
      const pos = hub.screenPos(key);
      result[key] = pos ? hub.hitTest(pos.x, pos.y) : 'не нарисована';
    }
    result.empty = hub.hitTest(2, 2);
    return result;
  });
  assert(hit.rocket === 'rocket', `${vp.name}: тап по ракете → ${hit.rocket}`);
  assert(hit.empty === null, `${vp.name}: тап по небу → ${hit.empty}`);
  for (const key of ['beacons', 'gantry']) {
    if (hit[key] !== 'не нарисована') assert(hit[key] === key, `${vp.name}: тап по ${key} → ${hit[key]}`);
  }
  await page.screenshot({ path: path.join(outDir, `render-hub-${vp.name}.png`) });
  assert(errors.length === 0, `${vp.name}/хаб: ошибки страницы:\n${errors.join('\n')}`);
  await context.close();
}

async function checkFlight(browser, base, vp) {
  const { page, context, errors } = await openPreview(browser, base, vp, 'mode=flight&scenario=sim&era=3&simSpeed=4&objs=1&weather=cloudy');
  // Настоящая sim: взлёт и подъём.
  await page.evaluate(() => window.__preview.advance(240));
  const ascent = await page.evaluate(() => {
    const f = window.__preview.state().flight;
    return { phase: f.phase, alt: f.alt, objects: f.objects.length };
  });
  assert(ascent.alt > 100, `${vp.name}: ракета не взлетела (alt ${ascent.alt})`);
  const colors = await distinctColors(page);
  assert(colors > 10, `${vp.name}: полёт выглядит пустым (${colors} цветов)`);
  await page.screenshot({ path: path.join(outDir, `render-flight-${vp.name}.png`) });

  // Цикл до посадки/аварии без ошибок.
  const finished = await page.evaluate(() => {
    const p = window.__preview;
    for (let i = 0; i < 6000; i++) {
      p.advance(1);
      if (p.state().flight.ended) return { ended: true, phase: p.state().flight.phase };
    }
    return { ended: false };
  });
  assert(finished.ended, `${vp.name}: sim не завершила полёт за отведённое время`);
  await page.screenshot({ path: path.join(outDir, `render-flight-end-${vp.name}.png`) });

  // reduceMotion: камера не трясётся, вспышки выключены.
  const calm = await page.evaluate(() => {
    const p = window.__preview;
    p.ui.reduce.checked = true;
    p.advance(1); // настройка доходит до рендера с очередным кадром
    p.events([{ type: 'crashed', x: 0, y: 0 }, { type: 'hit', damage: 30 }]);
    p.advance(3);
    const camera = p.renderer.flight.camera;
    return { trauma: camera.trauma, shake: Math.hypot(camera.shakeX, camera.shakeY), flash: p.renderer.flight.fx.flash };
  });
  assert(calm.trauma === 0 && calm.shake === 0 && calm.flash === 0, `${vp.name}: reduceMotion не выключил тряску (${JSON.stringify(calm)})`);
  assert(errors.length === 0, `${vp.name}/полёт: ошибки страницы:\n${errors.join('\n')}`);
  await context.close();
}

async function checkBodies(browser, base) {
  const vp = VIEWPORTS[1];
  for (const body of ['moon', 'mars']) {
    const { page, context, errors } = await openPreview(browser, base, vp, `mode=flight&scenario=sim&era=4&body=${body}&simSpeed=4`);
    await page.evaluate(() => window.__preview.advance(300));
    const colors = await distinctColors(page);
    assert(colors > 8, `${body}: пустая картинка`);
    await page.screenshot({ path: path.join(outDir, `render-flight-${body}.png`) });
    assert(errors.length === 0, `${body}: ошибки страницы:\n${errors.join('\n')}`);
    await context.close();
  }
}

async function frameBudget(browser, base) {
  const vp = VIEWPORTS[1];
  const { page, context } = await openPreview(browser, base, vp, 'mode=flight&scenario=sim&era=3&simSpeed=1&objs=1');
  const ms = await page.evaluate(() => {
    const p = window.__preview;
    p.advance(120);
    const t0 = performance.now();
    p.advance(120);
    return (performance.now() - t0) / 120;
  });
  console.log(`  среднее время кадра полёта (sim + рендер, ${vp.name}, программный рендер): ${ms.toFixed(2)} мс`);
  assert(ms < 40, `кадр слишком долгий: ${ms.toFixed(1)} мс`);
  await context.close();
}

(async () => {
  const { server, url } = await startStaticServer(root);
  const browser = await launch();
  try {
    for (const vp of VIEWPORTS) {
      await checkHub(browser, url, vp);
      console.log(`ok: хаб ${vp.name}`);
      await checkFlight(browser, url, vp);
      console.log(`ok: полёт ${vp.name}`);
    }
    await checkBodies(browser, url);
    console.log('ok: Луна и Марс');
    await frameBudget(browser, url);
    console.log('render.browser: всё прошло');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
