// Real-browser audio check: renders scripted scenarios on an OfflineAudioContext
// through the page game/test/audio-demo.html and verifies level, sanity,
// silence, repeatability and the live AudioContext lifecycle.
//
// Browser: CHROMIUM_EXECUTABLE_PATH if set, otherwise the system Chrome
// (playwright channel 'chrome'). Prints SKIP and exits 0 when no browser or
// no playwright is available.

const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');

const PEAK_LIMIT_DB = -1;
const SILENCE_LIMIT_SECONDS = 0.5;

function loadPlaywright() {
  const candidates = [
    'playwright',
    path.join(__dirname, '..', '..', 'node_modules', 'playwright'),
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),
  ];
  for (const name of candidates) {
    try {
      return require(name);
    } catch {
      // try the next location
    }
  }
  return null;
}

async function launch(pw) {
  const exe = process.env.CHROMIUM_EXECUTABLE_PATH;
  const extra = process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : [];
  // file:// pages may only import ES modules with this flag.
  const args = ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files', ...extra];
  return pw.chromium.launch(exe ? { executablePath: exe, args } : { channel: 'chrome', args });
}

const fixed = (n, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : String(n));

async function main() {
  const pw = loadPlaywright();
  if (!pw) {
    console.log('SKIP audio.browser: playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await launch(pw);
  } catch (error) {
    console.log(`SKIP audio.browser: no Chrome available (${String(error.message).split('\n')[0]})`);
    return;
  }

  try {
    const page = await browser.newPage();
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });
    await page.goto(pathToFileURL(path.join(__dirname, 'audio-demo.html')).href);
    await page.waitForFunction(() => globalThis.audioTest, null, { timeout: 15000 });

    const flight = await page.evaluate(() => globalThis.audioTest.flight());
    console.log(
      `flight  peak ${fixed(flight.peakDb)} dBFS  rms ${fixed(flight.rmsDb)} dBFS  longest silence ${fixed(flight.longestSilence, 1)} s` +
        `  voices<=${flight.stats.peakVoices}  repeat diff ${flight.repeatDifference}`,
    );
    assert.equal(flight.invalid, 0, 'no NaN or Infinity samples');
    assert.ok(flight.peakDb <= PEAK_LIMIT_DB, `peak ${flight.peakDb} dBFS above ${PEAK_LIMIT_DB}`);
    assert.ok(flight.longestSilence <= SILENCE_LIMIT_SECONDS, `silence of ${flight.longestSilence} s inside the scenario`);
    assert.ok(flight.rmsDb > -26 && flight.rmsDb < -15, `rms ${flight.rmsDb} dBFS outside -26..-15`);
    assert.ok(Math.abs(flight.dcOffset) < 0.01, `dc offset ${flight.dcOffset}`);
    assert.ok(flight.repeatDifference < 1e-3, `two renders of the same seed differ by ${flight.repeatDifference}`);
    assert.ok(flight.otherSeedDifference > 1e-4, 'another seed sounds different');
    assert.equal(flight.stats.music.errors, 0, `music errors: ${flight.stats.music.lastError}`);
    assert.ok(flight.stats.peakVoices <= 110, `voice count ${flight.stats.peakVoices} is unbounded`);

    const hub = await page.evaluate(() => globalThis.audioTest.hub());
    console.log(`hub     peak ${fixed(hub.peakDb)} dBFS  rms ${fixed(hub.rmsDb)} dBFS  longest silence ${fixed(hub.longestSilence, 1)} s`);
    assert.equal(hub.invalid, 0);
    assert.ok(hub.peakDb <= PEAK_LIMIT_DB, `hub peak ${hub.peakDb}`);
    assert.ok(hub.rmsDb > -30 && hub.rmsDb < -19, `hub rms ${hub.rmsDb}`);
    assert.ok(hub.longestSilence <= SILENCE_LIMIT_SECONDS, `hub silence ${hub.longestSilence} s`);

    const pause = await page.evaluate(() => globalThis.audioTest.pause());
    console.log(`pause   before ${fixed(pause.beforeRmsDb)} dBFS  after ${fixed(pause.afterRmsDb)} dBFS`);
    assert.ok(pause.beforeRmsDb > -40, 'engine is audible before the pause');
    assert.ok(pause.afterRmsDb < -70, `pause is silent (${pause.afterRmsDb} dBFS)`);

    const sweep = await page.evaluate(() => globalThis.audioTest.sfxSweep());
    const names = await page.evaluate(() => globalThis.audioTest.SFX_NAMES);
    assert.equal(sweep.length, names.length);
    let loudest = -Infinity;
    for (const item of sweep) {
      loudest = Math.max(loudest, item.peakDb);
      assert.equal(item.invalid, 0, `${item.name}: invalid samples`);
      assert.ok(item.peakDb <= PEAK_LIMIT_DB, `${item.name}: peak ${item.peakDb} dBFS`);
      assert.ok(item.rmsDb > -60, `${item.name}: inaudible (rms ${item.rmsDb} dBFS)`);
    }
    console.log(`sfx     ${sweep.length} effects, loudest peak ${fixed(loudest)} dBFS`);
    for (const item of sweep) console.log(`   ${item.name.padEnd(16)} peak ${fixed(item.peakDb, 1).padStart(6)}  rms ${fixed(item.rmsDb, 1).padStart(6)}`);

    const live = await page.evaluate(() => globalThis.audioTest.realtime());
    console.log(`live    ${JSON.stringify({ before: live.before, unlocked: live.unlocked, running: live.afterUnlock, suspended: live.suspended, resumed: live.resumed })}`);
    assert.equal(live.before, 'none');
    assert.equal(live.unlocked, true);
    assert.equal(live.afterUnlock, 'running');
    assert.equal(live.suspended, 'suspended');
    assert.equal(live.resumed, 'running');
    assert.ok(live.statsRunning.voices <= 110, `live voices ${live.statsRunning.voices}`);
    assert.equal(live.statsRunning.music.errors, 0, 'no music errors in real time');
    assert.equal(live.muteOk, true);

    assert.deepEqual(problems, [], `page problems:\n${problems.join('\n')}`);
    console.log('audio.browser: OK');
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
