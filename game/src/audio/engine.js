// Engine, wind and RCS. The first half is a pure mapping from a game frame to
// synth parameters (testable in Node); the second half builds the always-on
// node graph those parameters drive.

import { normalizeFrame } from './frame.js';
import { clamp01, lerp } from './util.js';
import { percussive } from './synth.js';

export const ACTIVE_PHASES = new Set(['pad', 'ascent', 'space', 'transfer', 'descent', 'landed']);

// Timbre per stage: big booster, mid core, small capsule thrusters.
export const STAGE_VOICES = Object.freeze([
  { pitch: 0.84, bright: 0.85, body: 1.15, roar: 1.1 },
  { pitch: 1, bright: 1, body: 1, roar: 1 },
  { pitch: 1.3, bright: 1.2, body: 0.6, roar: 0.75 },
]);

export const stageVoice = (stage) => STAGE_VOICES[Math.min(Math.max(0, stage | 0), STAGE_VOICES.length - 1)];

export function mapEngine(input) {
  const f = normalizeFrame(input);
  const running = ACTIVE_PHASES.has(f.phase) && !f.paused;
  const burning = running && f.fuel01 > 0.001;
  const level = burning && f.throttle >= 0.015 ? f.throttle : 0;
  const loud = Math.pow(level, 0.85);
  const voice = stageVoice(f.stage);
  const air = Math.pow(f.atmo, 0.6); // share of the sound that travels through air
  const hull = 0.35 + 0.65 * (1 - f.atmo); // share carried by the structure
  const speed = f.speed01;
  const breeze = running ? 0.035 * f.atmo : 0;
  const stormy = running ? f.storm * f.atmo : 0;
  const windBase = running ? Math.pow(speed, 1.2) * Math.pow(f.atmo, 0.7) * 0.55 : 0;
  const rcsAir = 0.35 + 0.65 * Math.sqrt(f.atmo);

  return {
    level,
    roar: {
      gain: 1.5 * loud * air * voice.roar,
      cutoff: lerp(450, 4200, Math.pow(level, 0.9)) * voice.bright * (0.55 + 0.45 * air),
    },
    formants: [
      { freq: lerp(210, 520, level) * voice.pitch, q: 2.2, gain: 0.8 },
      { freq: lerp(620, 1500, level) * voice.pitch, q: 3, gain: 0.55 },
      { freq: lerp(1500, 3300, level) * voice.bright, q: 4, gain: 0.3 * level },
    ],
    formantGain: 1.2 * loud * air,
    rush: 0.2 * Math.pow(level, 1.3) * air,
    crackle: { rate: lerp(14, 31, level), depth: level > 0 ? 0.22 + 0.2 * level : 0 },
    rumble: { freq: lerp(36, 66, level) * voice.pitch, gain: 0.14 * loud * voice.body * (0.55 + 0.45 * hull) },
    body: { gain: 0.25 * Math.pow(level, 0.7) * hull * voice.body },
    buzz: { freq: lerp(70, 118, level) * voice.pitch, gain: 0.2 * Math.pow(level, 0.8) * hull * voice.body },
    whine: { freq: lerp(700, 2400, level) * voice.pitch, gain: 0.02 * level * level },
    sputter: burning ? clamp01((0.07 - f.fuel01) / 0.07) : 0,
    wind: {
      gain: windBase + breeze + stormy * 0.3,
      freq: lerp(280, 2800, Math.pow(speed, 0.8)) * (1 + 0.3 * stormy),
      whistleGain: running ? 0.09 * Math.pow(speed, 2.2) * Math.pow(f.atmo, 0.6) : 0,
      whistleFreq: lerp(900, 2300, speed),
      gust: 0.18 + 0.55 * f.storm,
    },
    rcs: {
      left: running ? f.rcs.left : 0,
      right: running ? f.rcs.right : 0,
      hissCutoff: lerp(1600, 5200, rcsAir),
      hiss: rcsAir,
      body: 0.45 + 0.55 * (1 - rcsAir),
    },
    duckMusic: level,
  };
}

// ---------------------------------------------------------------------------
// Node graph

const RCS_ON = 0.05;
const ENGINE_LEVEL = 0.62;
const SLEEP_AFTER = 5; // seconds of silence before the engine graph is parked

export function createEngine({ ctx, graph, noise, toolkit, rng, now }) {
  const nodes = [];
  const sources = [];
  const keep = (node) => {
    nodes.push(node);
    return node;
  };
  const gain = (value = 0) => {
    const node = keep(ctx.createGain());
    node.gain.value = value;
    return node;
  };
  const filter = (type, frequency, q = 0.7) => {
    const node = keep(ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  };
  const peaking = (frequency, q, gainDb) => {
    const node = filter('peaking', frequency, q);
    node.gain.value = gainDb;
    return node;
  };
  const panner = (pan) => {
    const node = keep(ctx.createStereoPanner());
    node.pan.value = pan;
    return node;
  };
  const loop = (color) => {
    const node = noise.source(color);
    keep(node);
    sources.push(node);
    node.start(0, rng.range(0, noise.duration - 0.5));
    return node;
  };
  const osc = (type, frequency) => {
    const node = keep(ctx.createOscillator());
    node.type = type;
    node.frequency.value = frequency;
    sources.push(node);
    node.start(0);
    return node;
  };
  const chain = (...list) => {
    for (let i = 0; i < list.length - 1; i++) list[i].connect(list[i + 1]);
    return list[list.length - 1];
  };

  // Everything the engine makes reaches the mix through this switch. While the
  // game is quiet (hub, pause) it is opened, so the web of noise sources and
  // filters behind it stops being processed at all.
  const power = gain(1);
  power.connect(graph.buses.engine);
  const bus = power;
  let awake = true;
  let idleSince = null;

  // Master for the engine voice: stage blips and fuel sputter act here.
  const master = gain(ENGINE_LEVEL);
  const sputterGain = gain(1);
  const sputterLfo = osc('sine', 11);
  const sputterDepth = gain(0);
  chain(sputterLfo, sputterDepth, sputterGain.gain);
  chain(master, sputterGain, bus);

  // Roar: two decorrelated pink noises, left and right.
  const roar = [-0.35, 0.35].map((pan) => {
    const g = gain(0);
    const lp = filter('lowpass', 800, 0.6);
    chain(loop('pink'), filter('highpass', 48, 0.5), lp, g, panner(pan), master);
    return { g, lp };
  });

  // Throat: three formant bands, flickered by a pair of unrelated LFOs.
  const formantSource = loop('pink');
  const formantSum = gain(1);
  const formants = [0, 1, 2].map(() => {
    const band = filter('bandpass', 500, 2);
    const g = gain(0.5);
    chain(formantSource, band, g, formantSum);
    return { band, g };
  });
  const crackle = gain(0.7);
  const crackleDepth = gain(0);
  const lfoA = osc('sine', 20);
  const lfoB = osc('sine', 32.4);
  lfoA.connect(crackleDepth);
  lfoB.connect(crackleDepth);
  crackleDepth.connect(crackle.gain);
  const formantMaster = gain(0);
  chain(formantSum, crackle, formantMaster, master);

  // Low rumble: detuned saws plus a sub sine through a low-pass.
  const rumbleLow = filter('lowpass', 260, 0.7);
  const rumbleGain = gain(0);
  const sawA = osc('sawtooth', 40);
  const sawB = osc('sawtooth', 60.5);
  const sub = osc('sine', 20);
  const sawBGain = gain(0.55);
  const subGain = gain(0.5);
  chain(sawA, rumbleLow);
  chain(sawB, sawBGain, rumbleLow);
  chain(sub, subGain, rumbleLow);
  chain(rumbleLow, rumbleGain, master);

  // Air rush: a hiss on top of the roar so the engine has presence on small speakers.
  const rushGain = gain(0);
  chain(loop('white'), filter('highpass', 1800, 0.5), filter('lowpass', 7500, 0.5), rushGain, master);

  // Hull vibration: resonant brown noise and two beating hum tones.
  const bodyIn = gain(1);
  chain(loop('brown'), peaking(80, 9, 12), peaking(150, 7, 9), filter('lowpass', 380, 0.6), bodyIn);
  const humA = osc('sine', 61);
  const humB = osc('sine', 92.5);
  const humGain = gain(0.1);
  chain(humA, humGain, bodyIn);
  chain(humB, humGain);
  const bodyAm = gain(0.8);
  const bodyLfo = osc('sine', 11);
  const bodyLfoDepth = gain(0.18);
  chain(bodyLfo, bodyLfoDepth, bodyAm.gain);
  const bodyGain = gain(0);
  chain(bodyIn, bodyAm, bodyGain, master);

  // Structure-borne buzz: the vibration's harmonics, audible even in a vacuum.
  const buzzOsc = osc('sawtooth', 80);
  const buzzBand = filter('bandpass', 260, 1.6);
  const buzzGain = gain(0);
  chain(buzzOsc, buzzBand, buzzGain, master);

  // Turbopump whine, kept far below the roar.
  const whineOsc = osc('triangle', 900);
  const whineBand = filter('bandpass', 1200, 3);
  const whineGain = gain(0);
  chain(whineOsc, whineBand, whineGain, master);

  // Wind over the hull, with gusts, a thin whistle and a slow drift in stereo.
  const windBand = filter('bandpass', 400, 0.7);
  const windGain = gain(0);
  const windPan = panner(0);
  chain(loop('pink'), windBand, windGain, windPan, bus);
  const gustDepth = gain(0);
  const gustA = osc('sine', 0.17);
  const gustB = osc('sine', 0.43);
  chain(gustA, gustDepth);
  chain(gustB, gustDepth, windGain.gain);
  const driftLfo = osc('sine', 0.09);
  const driftDepth = gain(0.35);
  chain(driftLfo, driftDepth, windPan.pan);
  const whistleBand = filter('bandpass', 1500, 16);
  const whistleGain = gain(0);
  const vibrato = osc('sine', 5.5);
  const vibratoDepth = gain(25);
  chain(vibrato, vibratoDepth, whistleBand.detune);
  chain(loop('pink'), whistleBand, whistleGain, bus);

  // RCS: hiss and a lower puff for each side, panned hard.
  const rcsSides = [-0.8, 0.8].map((pan) => {
    const panNode = panner(pan);
    panNode.connect(bus);
    const hissBand = filter('bandpass', 4200, 0.9);
    const hissGain = gain(0);
    chain(loop('white'), filter('highpass', 1800, 0.5), hissBand, hissGain, panNode);
    const puffBand = filter('bandpass', 760, 1.2);
    const puffGain = gain(0);
    chain(loop('pink'), puffBand, puffGain, panNode);
    return { hissBand, hissGain, puffGain, active: false, level: 0 };
  });

  // ---- control ----
  let first = true;
  let lastStage = null;
  let lastLevel = 0;
  let lastIgnition = -10;
  let lastEdgeLevel = 0;
  const memo = new Map();

  function set(param, value, tauSeconds, when) {
    const previous = memo.get(param);
    if (previous !== undefined && Math.abs(previous - value) < 1e-4 + Math.abs(value) * 0.004) return;
    memo.set(param, value);
    if (first) param.setValueAtTime(value, when);
    else param.setTargetAtTime(value, when, tauSeconds);
  }

  function apply(frameInput, when = now()) {
    const frame = normalizeFrame(frameInput);
    const m = mapEngine(frame);
    updatePower(m, when);
    applyEngine(m, when);
    applyWind(m, when);
    applyRcs(m, when);
    handleEdges(frame, m, when);
    graph.setEngineDuck(m.duckMusic, when);
    first = false;
  }

  const busy = (m) => m.level > 0 || m.wind.gain > 1e-4 || m.wind.whistleGain > 1e-4 || m.rcs.left > 0 || m.rcs.right > 0;

  function updatePower(m, when) {
    if (busy(m)) {
      idleSince = null;
      if (!awake) {
        power.connect(graph.buses.engine);
        awake = true;
      }
      return;
    }
    idleSince ??= when;
    if (awake && when - idleSince > SLEEP_AFTER) {
      power.disconnect(graph.buses.engine);
      awake = false;
    }
  }

  function applyEngine(m, when) {
    const rise = m.level > lastLevel ? 0.09 : 0.22;
    for (const r of roar) {
      set(r.g.gain, m.roar.gain * 0.5, rise, when);
      set(r.lp.frequency, m.roar.cutoff, 0.3, when);
    }
    m.formants.forEach((fm, i) => {
      set(formants[i].band.frequency, fm.freq, 0.3, when);
      set(formants[i].band.Q, fm.q, 0.3, when);
      set(formants[i].g.gain, fm.gain, 0.3, when);
    });
    set(formantMaster.gain, m.formantGain, rise, when);
    set(rushGain.gain, m.rush, rise, when);
    set(buzzOsc.frequency, m.buzz.freq, 0.35, when);
    set(buzzGain.gain, m.buzz.gain, rise, when);
    set(lfoA.frequency, m.crackle.rate, 0.4, when);
    set(lfoB.frequency, m.crackle.rate * 1.618, 0.4, when);
    set(crackleDepth.gain, m.crackle.depth, 0.3, when);
    set(crackle.gain, 1 - m.crackle.depth, 0.3, when);
    set(sawA.frequency, m.rumble.freq, 0.35, when);
    set(sawB.frequency, m.rumble.freq * 1.51, 0.35, when);
    set(sub.frequency, m.rumble.freq * 0.5, 0.35, when);
    set(rumbleGain.gain, m.rumble.gain, rise, when);
    set(bodyGain.gain, m.body.gain, rise, when);
    set(whineOsc.frequency, m.whine.freq, 0.4, when);
    set(whineBand.frequency, m.whine.freq, 0.4, when);
    set(whineGain.gain, m.whine.gain, 0.3, when);
    set(sputterDepth.gain, m.sputter * 0.5, 0.2, when);
    set(sputterGain.gain, 1 - m.sputter * 0.5, 0.2, when);
    lastLevel = m.level;
  }

  function applyWind(m, when) {
    set(windGain.gain, m.wind.gain, 0.5, when);
    set(windBand.frequency, m.wind.freq, 0.4, when);
    set(gustDepth.gain, m.wind.gain * m.wind.gust * 0.5, 0.5, when);
    set(whistleGain.gain, m.wind.whistleGain, 0.5, when);
    set(whistleBand.frequency, m.wind.whistleFreq, 0.5, when);
  }

  function applyRcs(m, when) {
    [m.rcs.left, m.rcs.right].forEach((value, i) => {
      const side = rcsSides[i];
      const rising = value > side.level;
      const attack = rising ? 0.012 : 0.07;
      set(side.hissBand.frequency, m.rcs.hissCutoff, 0.3, when);
      set(side.hissGain.gain, value * 0.34 * m.rcs.hiss, attack, when);
      set(side.puffGain.gain, value * 0.3 * m.rcs.body, attack, when);
      if (value >= RCS_ON && !side.active) valveClick(i === 0 ? -0.8 : 0.8, value, when);
      side.active = value >= RCS_ON;
      side.level = value;
    });
  }

  function valveClick(pan, strength, when) {
    const voice = toolkit.voice({ name: 'rcs-click', group: 'sfx', dest: bus, pan, gain: 0.5 * (0.5 + 0.5 * strength) });
    const t = Math.max(when, now());
    const tick = voice.noise('white', t, t + 0.05);
    const band = voice.filter('bandpass', 2600, 1.2);
    const env = voice.gain(1);
    percussive(env.gain, t, 1, 0.001, 0.02);
    voice.chain(tick, band, env, voice.out);
    const thump = voice.osc('sine', 300, t, t + 0.06);
    const thumpEnv = voice.gain(0.5);
    percussive(thumpEnv.gain, t, 0.5, 0.002, 0.04);
    voice.chain(thump, thumpEnv, voice.out);
  }

  function handleEdges(frame, m, when) {
    if (lastStage !== null && frame.stage !== lastStage && m.level > 0) stageBlip(when);
    lastStage = frame.stage;
    const t = Math.max(when, now());
    if (m.level >= 0.05 && lastEdgeLevel < 0.02 && t - lastIgnition > 0.8) {
      ignition(t, m.level);
      lastIgnition = t;
    }
    lastEdgeLevel = m.level;
  }

  // The old stage drops away: the note stutters and settles into the next.
  function stageBlip(when) {
    master.gain.cancelScheduledValues(when);
    master.gain.setValueAtTime(ENGINE_LEVEL * 0.25, when);
    master.gain.setTargetAtTime(ENGINE_LEVEL, when + 0.1, 0.16);
  }

  // Ignition accent: a soft thump and a swell of low noise.
  function ignition(t, level) {
    const voice = toolkit.voice({ name: 'ignition', group: 'sfx', dest: bus, gain: 0.4 + 0.3 * level });
    const body = voice.osc('sine', 70, t, t + 0.6);
    body.frequency.setValueAtTime(70, t);
    body.frequency.exponentialRampToValueAtTime(34, t + 0.45);
    const env = voice.gain(1);
    percussive(env.gain, t, 0.9, 0.01, 0.5);
    voice.chain(body, env, voice.out);
    const puff = voice.noise('brown', t, t + 0.8);
    const low = voice.filter('lowpass', 700, 0.7);
    low.frequency.setValueAtTime(300, t);
    low.frequency.exponentialRampToValueAtTime(900, t + 0.3);
    const puffEnv = voice.gain(1);
    puffEnv.gain.setValueAtTime(0.0001, t);
    puffEnv.gain.linearRampToValueAtTime(0.9, t + 0.12);
    puffEnv.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    voice.chain(puff, low, puffEnv, voice.out);
  }

  function dispose() {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
  }

  return { apply, dispose, nodeCount: () => nodes.length, isAwake: () => awake };
}
