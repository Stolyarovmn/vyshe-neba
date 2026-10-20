// Sound effect catalogue. Every entry is plain data plus a `play(S)` function
// that builds its voices from primitives. Nothing here touches Web Audio at
// import time, so the catalogue can be inspected from Node.
//
// S (play context):
//   S.t        start time          S.p      caller params (gain, pan, pitch, ...)
//   S.voice()  main voice          S.aux()  extra layer     S.wet(v, amount)
//   S.f(hz)    frequency scaled by params.pitch              S.rng  seeded random

import { fm, noiseHit, tone } from './primitives.js';
import { FLOOR, percussive, sweep } from './synth.js';
import { midiToHz as hz, clamp } from './util.js';

const COIN_LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const COIN_BASE = 83; // B5

// A train of short noise clicks through one filter and one gain: cheap debris.
function clickTrain(v, times, { color = 'white', fLo, fHi, peak, decay = 0.03, q = 1.4 }, S) {
  if (times.length === 0) return;
  const end = times[times.length - 1] + decay + 0.1;
  const source = v.noise(color, times[0], end);
  const band = v.filter('bandpass', fLo, q);
  const env = v.gain(0);
  times.forEach((ti, i) => {
    const room = i + 1 < times.length ? times[i + 1] - ti - 0.004 : decay;
    const tail = Math.max(0.004, Math.min(decay, room - 0.002));
    band.frequency.setValueAtTime(S.rng.range(fLo, fHi), ti);
    env.gain.setValueAtTime(FLOOR, ti);
    env.gain.linearRampToValueAtTime(peak * S.rng.range(0.4, 1), ti + 0.002);
    env.gain.exponentialRampToValueAtTime(FLOOR, ti + 0.002 + tail);
  });
  v.chain(source, band, env, v.out);
}

function scatter(S, start, span, count, bias = 1.6) {
  const times = [];
  for (let i = 0; i < count; i++) times.push(start + span * Math.pow(S.rng.next(), bias));
  return times.sort((a, b) => a - b).filter((x, i, all) => i === 0 || x - all[i - 1] > 0.004);
}

// Amplitude modulation stage: feed sounds into the returned node.
function tremolo(v, t, end, rate, depth, output) {
  const am = v.gain(1 - depth);
  const lfo = v.osc('sine', rate, t, end);
  const lfoDepth = v.gain(depth);
  v.chain(lfo, lfoDepth, am.gain);
  am.connect(output);
  return am;
}

// ---------------------------------------------------------------------------

const ui = {
  'ui-hover': {
    bus: 'ui', gain: 0.273, cooldown: 0.04, maxVoices: 3, priority: 0,
    play(S) {
      const v = S.voice();
      tone(v, S.t, { f: S.f(1400), f2: S.f(1520), attack: 0.003, decay: 0.05, peak: 0.6 });
      noiseHit(v, S.t, { decay: 0.02, peak: 0.2, filter: { type: 'bandpass', f: 6000, q: 1 } });
    },
  },

  'ui-press': {
    bus: 'ui', gain: 0.335, cooldown: 0.03, maxVoices: 4, priority: 1,
    play(S) {
      const v = S.voice();
      tone(v, S.t, { f: S.f(210), f2: 95, decay: 0.09, peak: 1 });
      noiseHit(v, S.t, { decay: 0.015, peak: 0.6, filter: { type: 'bandpass', f: 3200, q: 1 } });
      tone(v, S.t + 0.01, { type: 'triangle', f: S.f(520), f2: S.f(780), attack: 0.002, decay: 0.07, peak: 0.35 });
    },
  },

  'ui-deny': {
    bus: 'ui', gain: 0.32, cooldown: 0.12, maxVoices: 2, priority: 2,
    play(S) {
      const v = S.voice();
      for (const offset of [0, 0.12]) {
        tone(v, S.t + offset, { type: 'sawtooth', f: S.f(196), f2: S.f(155), decay: 0.11, peak: 0.8, filter: { f: 900, q: 0.8 } });
        tone(v, S.t + offset, { type: 'square', f: S.f(98), f2: S.f(78), decay: 0.11, peak: 0.35, filter: { f: 400 } });
      }
    },
  },

  'ui-back': {
    bus: 'ui', gain: 0.24, cooldown: 0.05, maxVoices: 3, priority: 1,
    play(S) {
      const v = S.voice();
      tone(v, S.t, { type: 'triangle', f: S.f(600), f2: S.f(400), decay: 0.09, peak: 0.6 });
      tone(v, S.t, { f: S.f(160), f2: 90, decay: 0.08, peak: 0.5 });
    },
  },

  purchase: {
    bus: 'ui', gain: 0.429, cooldown: 0.1, maxVoices: 2, priority: 3,
    duck: { depth: 0.65, hold: 0.25, release: 0.5 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.25);
      noiseHit(v, S.t, { decay: 0.03, peak: 0.5, filter: { type: 'highpass', f: 5000 } });
      fm(v, S.t + 0.03, { f: S.f(hz(88)), ratio: 3.5, index: 2.2, decay: 0.6, peak: 0.45 });
      fm(v, S.t + 0.09, { f: S.f(hz(95)), ratio: 3.5, index: 2.2, decay: 0.7, peak: 0.5 });
      noiseHit(v, S.t + 0.09, { decay: 0.35, peak: 0.22, filter: { type: 'bandpass', f: 9000, q: 3 } });
      for (const m of [76, 80, 83]) tone(v, S.t + 0.02, { type: 'triangle', f: S.f(hz(m)), attack: 0.02, decay: 0.5, peak: 0.12 });
    },
  },

  build: {
    bus: 'ui', gain: 0.36, cooldown: 0.2, maxVoices: 2, priority: 2,
    play(S) {
      const v = S.voice();
      [[0, 520, 1], [0.22, 480, 0.9], [0.44, 440, 1.1]].forEach(([at, f, power]) => {
        const t = S.t + at;
        noiseHit(v, t, { decay: 0.04, peak: 0.6 * power, filter: { type: 'bandpass', f: 2200, q: 2 } });
        fm(v, t, { f: S.f(f), ratio: 1.41, index: 3, indexEnd: 0.2, decay: 0.22, peak: 0.5 * power });
        tone(v, t, { f: 140, f2: 70, decay: 0.09, peak: 0.5 * power });
      });
      tone(v, S.t + 0.05, {
        type: 'sawtooth', f: 110, f2: 330, attack: 0.1, decay: 0.55, peak: 0.16, filter: { f: 700, q: 1.5 },
      });
    },
  },

  'build-complete': {
    bus: 'ui', gain: 0.616, cooldown: 0.3, maxVoices: 1, priority: 4,
    duck: { depth: 0.6, hold: 0.7, release: 0.8 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.3);
      tone(v, S.t, { f: 80, f2: 50, decay: 0.4, peak: 0.6 });
      [72, 74, 76, 79, 84].forEach((m, i) => fm(v, S.t + 0.04 + i * 0.09, { f: S.f(hz(m)), ratio: 2, index: 1.8, decay: 0.5, peak: 0.4 }));
      for (const m of [72, 76, 79, 84]) tone(v, S.t + 0.5, { type: 'triangle', f: S.f(hz(m)), attack: 0.01, decay: 1.0, peak: 0.16 });
      noiseHit(v, S.t + 0.4, { attack: 0.15, decay: 0.5, peak: 0.12, filter: { type: 'bandpass', f: 8000, q: 3 } });
    },
  },

  'era-up': {
    bus: 'ui', gain: 0.357, cooldown: 1, maxVoices: 1, priority: 5,
    duck: { depth: 0.3, hold: 2.2, release: 1.2 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.55);
      noiseHit(v, S.t, { attack: 0.85, decay: 0.12, peak: 0.5, filter: { type: 'bandpass', f: 400, f2: 5000, q: 1.5 } });
      tone(v, S.t + 0.95, { f: 70, f2: 35, decay: 1.2, peak: 0.9 });
      noiseHit(v, S.t + 0.95, { decay: 0.8, peak: 0.6, filter: { f: 500, f2: 120 } });
      const brass = (at, notes, dur, peak) => {
        for (const m of notes) {
          for (const detune of [-9, 9]) {
            const note = tone(v, S.t + at, {
              type: 'sawtooth', f: hz(m), attack: 0.04, hold: dur * 0.5, decay: dur * 0.6, peak: peak / 2,
              filter: { f: 400, f2: 3500, q: 0.9 },
            });
            note.osc.detune.value = detune;
          }
        }
      };
      brass(0.95, [48, 55, 60, 64], 0.55, 0.5);
      brass(1.5, [43, 55, 59, 62], 0.5, 0.5);
      brass(2.05, [48, 60, 64, 67, 72], 1.6, 0.6);
      fm(v, S.t + 2.1, { f: hz(96), ratio: 2, index: 1.5, decay: 1.6, peak: 0.25 });
    },
  },

  achievement: {
    bus: 'ui', gain: 0.435, cooldown: 0.4, maxVoices: 1, priority: 4,
    duck: { depth: 0.5, hold: 0.8, release: 0.8 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.4);
      [84, 88, 91, 96].forEach((m, i) => fm(v, S.t + i * (i === 3 ? 0.11 : 0.09), { f: S.f(hz(m)), ratio: 3.01, index: 2, decay: 0.7, peak: 0.4 }));
      noiseHit(v, S.t, { attack: 0.2, decay: 0.45, peak: 0.15, filter: { type: 'bandpass', f: 7500, q: 4 } });
      for (const m of [72, 79]) tone(v, S.t + 0.05, { attack: 0.15, decay: 0.9, peak: 0.18, f: hz(m) });
    },
  },

  coin: {
    bus: 'ui', gain: 0.39, cooldown: 0.02, maxVoices: 8, priority: 2,
    play(S) {
      const step = COIN_LADDER[Math.min(S.series, COIN_LADDER.length - 1)];
      const base = COIN_BASE + step;
      const v = S.voice();
      fm(v, S.t, { f: S.f(hz(base)), ratio: 2, index: 1.2, indexEnd: 0.1, decay: 0.09, peak: 0.45 });
      fm(v, S.t + 0.06, { f: S.f(hz(base + 5)), ratio: 2, index: 1.0, indexEnd: 0.1, decay: 0.32, peak: 0.5 });
      tone(v, S.t + 0.06, { f: S.f(hz(base + 17)), decay: 0.2, peak: 0.08 });
    },
  },

  ring: {
    bus: 'ui', gain: 0.435, cooldown: 0.08, maxVoices: 3, priority: 3,
    play(S) {
      const v = S.voice();
      S.wet(v, 0.3);
      const lift = Math.min(S.series, 6) * 2;
      noiseHit(v, S.t, { attack: 0.02, decay: 0.25, peak: 0.45, filter: { type: 'bandpass', f: 500, f2: 3500, q: 1.2 } });
      [81, 88, 93].forEach((m, i) => fm(v, S.t + 0.05 + i * 0.04, { f: S.f(hz(m + lift)), ratio: 2, index: 1.5, decay: 0.6, peak: 0.38 }));
      tone(v, S.t, { f: 220, f2: 330, decay: 0.2, peak: 0.35 });
    },
  },

  'fuel-pickup': {
    bus: 'ui', gain: 0.49, cooldown: 0.15, maxVoices: 2, priority: 3,
    play(S) {
      const v = S.voice();
      const pour = tremolo(v, S.t, S.t + 0.45, 24, 0.5, v.out);
      tone(v, S.t, { f: 180, f2: 420, attack: 0.03, hold: 0.1, decay: 0.22, peak: 0.5, to: pour });
      for (let i = 0; i < 4; i++) tone(v, S.t + 0.04 + i * 0.07, { f: S.rng.range(500, 900), decay: 0.04, peak: 0.25 });
      fm(v, S.t + 0.3, { f: 330, ratio: 1.5, index: 3, indexEnd: 0.2, decay: 0.12, peak: 0.5 });
      noiseHit(v, S.t + 0.3, { decay: 0.02, peak: 0.4, filter: { type: 'bandpass', f: 1800, q: 1 } });
      fm(v, S.t + 0.38, { f: S.f(hz(88)), ratio: 2, index: 1.4, decay: 0.5, peak: 0.3 });
    },
  },

  repair: {
    bus: 'ui', gain: 0.55, cooldown: 0.2, maxVoices: 2, priority: 3,
    play(S) {
      const v = S.voice();
      S.wet(v, 0.2);
      [0, 0.07, 0.13, 0.18, 0.22].forEach((at) => {
        noiseHit(v, S.t + at, { decay: 0.015, peak: 0.5, filter: { type: 'bandpass', f: 3500, q: 3 } });
        tone(v, S.t + at, { f: 900, decay: 0.01, peak: 0.4 });
      });
      const weld = tremolo(v, S.t + 0.12, S.t + 0.45, 60, 0.6, v.out);
      noiseHit(v, S.t + 0.12, { attack: 0.02, hold: 0.1, decay: 0.12, peak: 0.2, filter: { type: 'bandpass', f: 3000, q: 2 }, to: weld });
      fm(v, S.t + 0.4, { f: S.f(hz(79)), ratio: 2, index: 1.2, decay: 0.5, peak: 0.4 });
      fm(v, S.t + 0.48, { f: S.f(hz(86)), ratio: 2, index: 1.2, decay: 0.55, peak: 0.4 });
    },
  },

  'low-fuel-alarm': {
    bus: 'ui', gain: 0.535, cooldown: 0.35, maxVoices: 1, priority: 4,
    duck: { depth: 0.75, hold: 0.3, release: 0.3 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.15);
      [[0, 880], [0.22, 660]].forEach(([at, f]) => {
        tone(v, S.t + at, { type: 'triangle', f: S.f(f), attack: 0.01, hold: 0.12, decay: 0.08, peak: 0.5, filter: { f: 2400, q: 0.7 } });
        tone(v, S.t + at, { f: S.f(f * 2), attack: 0.01, hold: 0.1, decay: 0.08, peak: 0.12 });
      });
    },
  },

  warn: {
    bus: 'ui', gain: 0.395, cooldown: 0.3, maxVoices: 1, priority: 4,
    duck: { depth: 0.8, hold: 0.2, release: 0.3 },
    play(S) {
      const v = S.voice();
      const kind = S.p.kind ?? '';
      if (kind === 'hull' || kind === 'damage') {
        for (let i = 0; i < 3; i++) {
          tone(v, S.t + i * 0.14, { type: 'sawtooth', f: 120, f2: 100, decay: 0.12, peak: 0.7, filter: { f: 600, q: 0.8 } });
        }
      } else if (kind === 'speed') {
        for (let i = 0; i < 3; i++) tone(v, S.t + i * 0.09, { type: 'triangle', f: 1000, attack: 0.005, decay: 0.05, peak: 0.45, filter: { f: 3000 } });
      } else if (kind === 'tilt') {
        const wobble = tone(v, S.t, { type: 'triangle', f: 500, attack: 0.02, hold: 0.3, decay: 0.1, peak: 0.5 });
        const lfo = v.osc('sine', 9, S.t, S.t + 0.5);
        const depth = v.gain(60);
        v.chain(lfo, depth, wobble.osc.detune);
      } else if (kind === 'altitude' || kind === 'ground') {
        tone(v, S.t, { type: 'triangle', f: 1200, f2: 600, attack: 0.02, hold: 0.25, decay: 0.15, peak: 0.5, filter: { f: 2600 } });
      } else if (kind === 'radar' || kind === 'collision' || kind === 'air') {
        tone(v, S.t, { f: 1500, attack: 0.004, decay: 0.5, peak: 0.45 });
        tone(v, S.t + 0.25, { f: 1500, attack: 0.004, decay: 0.4, peak: 0.18 });
        S.wet(v, 0.3);
      } else {
        [784, 659, 523].forEach((f, i) => tone(v, S.t + i * 0.11, { type: 'triangle', f: S.f(f), attack: 0.006, decay: 0.1, peak: 0.45, filter: { f: 2800 } }));
      }
    },
  },

  'countdown-tick': {
    bus: 'ui', gain: 0.338, cooldown: 0.1, maxVoices: 2, priority: 3,
    play(S) {
      const v = S.voice();
      tone(v, S.t, { f: S.f(880), attack: 0.002, decay: 0.05, peak: 0.6 });
      tone(v, S.t, { f: S.f(440), attack: 0.002, decay: 0.08, peak: 0.3 });
      noiseHit(v, S.t, { decay: 0.01, peak: 0.4, filter: { type: 'bandpass', f: 2500, q: 1 } });
    },
  },

  'countdown-go': {
    bus: 'ui', gain: 0.332, cooldown: 0.3, maxVoices: 1, priority: 5,
    duck: { depth: 0.55, hold: 0.4, release: 0.6 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.3);
      for (const m of [72, 76, 79, 84]) {
        for (const detune of [-8, 8]) {
          const note = tone(v, S.t, { type: 'sawtooth', f: hz(m), attack: 0.005, decay: 0.5, peak: 0.15, filter: { f: 3000, q: 0.8 } });
          note.osc.detune.value = detune;
        }
      }
      noiseHit(v, S.t, { attack: 0.2, decay: 0.12, peak: 0.3, filter: { type: 'highpass', f: 2000 } });
      tone(v, S.t, { f: 100, f2: 60, decay: 0.3, peak: 0.6 });
    },
  },

  toast: {
    bus: 'ui', gain: 0.536, cooldown: 0.12, maxVoices: 2, priority: 1,
    play(S) {
      const v = S.voice();
      S.wet(v, 0.2);
      fm(v, S.t, { f: S.f(hz(76)), ratio: 2, index: 1.2, decay: 0.22, peak: 0.35 });
      fm(v, S.t + 0.08, { f: S.f(hz(81)), ratio: 2, index: 1.2, decay: 0.35, peak: 0.35 });
      noiseHit(v, S.t, { decay: 0.05, peak: 0.08, filter: { type: 'highpass', f: 6000 } });
    },
  },
};

// ---------------------------------------------------------------------------

const world = {
  'stage-sep': {
    bus: 'world', gain: 0.544, cooldown: 0.3, maxVoices: 2, priority: 4,
    duck: { depth: 0.55, hold: 0.3, release: 0.8 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.5);
      noiseHit(v, S.t, { decay: 0.12, peak: 1, filter: { f: 7000, f2: 400 } });
      tone(v, S.t, { f: 90, f2: 45, decay: 0.15, peak: 0.8 });
      fm(v, S.t + 0.02, { f: 320, ratio: 2.41, index: 4, indexEnd: 0.3, decay: 0.5, peak: 0.5 });
      fm(v, S.t + 0.05, { f: 540, ratio: 1.9, index: 4, indexEnd: 0.3, decay: 0.35, peak: 0.3 });
      noiseHit(v, S.t + 0.05, { attack: 0.02, decay: 0.6, peak: 0.25, filter: { type: 'highpass', f: 3000, f2: 1200 } });
      const fall = S.aux({ pan: 0 });
      const lean = fall.panner(0);
      lean.pan.setValueAtTime(0, S.t);
      lean.pan.linearRampToValueAtTime(-0.6, S.t + 1.1);
      lean.connect(fall.out);
      tone(fall, S.t + 0.12, {
        type: 'sawtooth', f: 160, f2: 55, attack: 0.05, decay: 0.95, peak: 0.35, filter: { f: 600, f2: 200 }, to: lean,
      });
    },
  },

  liftoff: {
    bus: 'world', gain: 0.484, cooldown: 1, maxVoices: 1, priority: 5,
    duck: { depth: 0.6, hold: 1.0, release: 1.2 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.3);
      tone(v, S.t, { f: 55, f2: 28, decay: 1.2, peak: 1 });
      noiseHit(v, S.t, { attack: 0.02, hold: 0.25, decay: 0.5, peak: 0.5, filter: { type: 'bandpass', f: 1800, q: 0.8 } });
      clickTrain(v, scatter(S, S.t, 0.55, 9), { fLo: 1500, fHi: 3500, peak: 0.45 }, S);
      noiseHit(v, S.t, { color: 'pink', attack: 0.5, decay: 1.2, peak: 0.6, filter: { type: 'bandpass', f: 200, f2: 1400, q: 0.8 } });
      [0.1, 0.25].forEach((at, i) => fm(v, S.t + at, { f: 280 - i * 40, ratio: 1.8, index: 3, decay: 0.3, peak: 0.35 }));
    },
  },

  'thrust-cut': {
    bus: 'world', gain: 0.552, cooldown: 0.2, maxVoices: 2, priority: 3,
    play(S) {
      const v = S.voice();
      noiseHit(v, S.t, { color: 'pink', decay: 0.5, peak: 0.6, filter: { f: 2200, f2: 120 } });
      tone(v, S.t, { type: 'sawtooth', f: 140, f2: 50, decay: 0.5, peak: 0.35, filter: { f: 400 } });
      noiseHit(v, S.t + 0.45, { decay: 0.02, peak: 0.4, filter: { type: 'bandpass', f: 1200, q: 1 } });
    },
  },

  'parachute-open': {
    bus: 'world', gain: 0.42, cooldown: 0.5, maxVoices: 1, priority: 4,
    duck: { depth: 0.75, hold: 0.2, release: 0.6 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.2);
      noiseHit(v, S.t, { color: 'pink', decay: 0.35, peak: 1, filter: { f: 500, f2: 150 } });
      tone(v, S.t, { f: 90, f2: 60, decay: 0.25, peak: 0.7 });
      noiseHit(v, S.t, { decay: 0.06, peak: 0.6, filter: { type: 'bandpass', f: 1500, q: 0.8 } });
      const flutter = tremolo(v, S.t + 0.05, S.t + 0.75, 22, 0.7, v.out);
      noiseHit(v, S.t + 0.05, { attack: 0.02, decay: 0.6, peak: 0.35, filter: { type: 'bandpass', f: 900, q: 1 }, to: flutter });
      noiseHit(v, S.t + 0.1, { attack: 0.1, decay: 0.8, peak: 0.3, filter: { type: 'bandpass', f: 1800, f2: 400, q: 0.8 } });
    },
  },

  'touch-soft': {
    bus: 'world', gain: 0.296, cooldown: 0.1, maxVoices: 2, priority: 3,
    play(S) {
      const v = S.voice();
      const dusty = S.body !== 'earth';
      tone(v, S.t, { f: dusty ? 80 : 95, f2: dusty ? 50 : 55, decay: 0.14, peak: dusty ? 0.7 : 0.9 });
      fm(v, S.t, { f: 380, ratio: 1.7, index: 2, indexEnd: 0.2, decay: 0.18, peak: 0.3 });
      fm(v, S.t + 0.03, { f: 450, ratio: 1.7, index: 2, indexEnd: 0.2, decay: 0.15, peak: 0.25 });
      noiseHit(v, S.t, { color: 'brown', decay: dusty ? 0.5 : 0.25, peak: dusty ? 0.5 : 0.35, filter: { f: 900, f2: 300 } });
    },
  },

  'touch-hard': {
    bus: 'world', gain: 0.342, cooldown: 0.1, maxVoices: 2, priority: 4,
    duck: { depth: 0.5, hold: 0.3, release: 0.7 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.2);
      tone(v, S.t, { f: 80, f2: 38, decay: 0.3, peak: 1 });
      noiseHit(v, S.t, { decay: 0.22, peak: 0.7, filter: { type: 'bandpass', f: 1400, q: 0.7 } });
      noiseHit(v, S.t, { color: 'brown', decay: 0.4, peak: 0.5, filter: { f: 800, f2: 200 } });
      fm(v, S.t, { f: 210, ratio: 2.2, index: 3, indexEnd: 0.2, decay: 0.35, peak: 0.5 });
      const creak = tone(v, S.t + 0.05, { type: 'sawtooth', f: 340, f2: 180, attack: 0.02, decay: 0.22, peak: 0.35, filter: { f: 900 } });
      const lfo = v.osc('sine', 40, S.t + 0.05, S.t + 0.35);
      const depth = v.gain(80);
      v.chain(lfo, depth, creak.osc.detune);
      clickTrain(v, scatter(S, S.t + 0.1, 0.4, 4, 1), { fLo: 2000, fHi: 4000, peak: 0.25 }, S);
    },
  },

  crash: {
    bus: 'world', gain: 0.43, cooldown: 0.5, maxVoices: 1, priority: 6,
    duck: { depth: 0.25, hold: 1.8, release: 1.5 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.6);
      tone(v, S.t, { f: 65, f2: 24, decay: 1.4, peak: 1 });
      tone(v, S.t + 0.05, { f: 40, f2: 20, decay: 1.8, peak: 0.8 });
      noiseHit(v, S.t, { decay: 1.8, peak: 1, filter: { f: 9000, f2: 90 } });
      noiseHit(v, S.t, { decay: 0.12, peak: 0.8, filter: { type: 'highpass', f: 3000 } });
      clickTrain(v, scatter(S, S.t + 0.1, 1.3, 22), { fLo: 700, fHi: 5000, peak: 0.3, decay: 0.04 }, S);
      tone(v, S.t + 0.02, { type: 'sawtooth', f: 900, f2: 220, attack: 0.01, decay: 0.5, peak: 0.3, filter: { f: 2500 } });
      const groan = tone(v, S.t + 0.5, { type: 'sawtooth', f: 90, f2: 60, attack: 0.1, decay: 0.9, peak: 0.3, filter: { f: 400 } });
      const lfo = v.osc('sine', 5, S.t + 0.5, S.t + 1.6);
      const depth = v.gain(30);
      v.chain(lfo, depth, groan.osc.detune);
    },
  },

  explosion: {
    bus: 'world', gain: 0.396, cooldown: 0.15, maxVoices: 2, priority: 5,
    duck: { depth: 0.45, hold: 0.6, release: 0.8 },
    play(S) {
      const size = clamp(S.p.size ?? 1, 0.4, 1.6);
      const v = S.voice({ gain: size });
      S.wet(v, 0.4);
      tone(v, S.t, { f: 90, f2: 35, decay: 0.8 * size, peak: 1 });
      noiseHit(v, S.t, { decay: 1.0 * size, peak: 0.9, filter: { f: 7000, f2: 150 } });
      noiseHit(v, S.t, { decay: 0.08, peak: 0.7, filter: { type: 'highpass', f: 3500 } });
      clickTrain(v, scatter(S, S.t + 0.05, 0.75 * size, 12), { fLo: 900, fHi: 5000, peak: 0.28 }, S);
    },
  },

  'transfer-start': {
    bus: 'world', gain: 0.504, cooldown: 1, maxVoices: 1, priority: 5,
    duck: { depth: 0.5, hold: 1.5, release: 1.2 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.45);
      for (const detune of [-12, 12]) {
        const stack = tone(v, S.t, {
          type: 'sawtooth', f: 80, f2: 700, attack: 0.3, decay: 1.3, peak: 0.22, filter: { f: 300, f2: 3000, q: 1 },
        });
        stack.osc.detune.value = detune;
      }
      noiseHit(v, S.t, { attack: 1.2, decay: 0.6, peak: 0.4, filter: { type: 'bandpass', f: 300, f2: 4500, q: 2 } });
      tone(v, S.t, { f: 45, f2: 60, attack: 0.8, decay: 0.9, peak: 0.6 });
      [74, 81, 88].forEach((m, i) => fm(v, S.t + 1.2 + i * 0.05, { f: hz(m), ratio: 2, index: 3, decay: 1.2, peak: 0.25 }));
      noiseHit(v, S.t + 1.6, { color: 'pink', decay: 0.6, peak: 0.4, filter: { f: 3000, f2: 300 } });
    },
  },

  'transfer-done': {
    bus: 'world', gain: 0.405, cooldown: 1, maxVoices: 1, priority: 5,
    duck: { depth: 0.55, hold: 1.2, release: 1.2 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.5);
      noiseHit(v, S.t, { color: 'pink', decay: 1.0, peak: 0.35, filter: { type: 'bandpass', f: 3000, f2: 400, q: 1 } });
      tone(v, S.t, { f: 120, f2: 40, decay: 1.2, peak: 0.7 });
      for (const m of [62, 69, 74, 78]) tone(v, S.t + 0.1, { type: 'triangle', f: hz(m), attack: 0.1, decay: 2.0, peak: 0.22 });
      fm(v, S.t + 0.3, { f: hz(93), ratio: 2, index: 1.5, decay: 1.2, peak: 0.3 });
    },
  },

  'storm-thunder': {
    bus: 'world', gain: 0.76, cooldown: 1, maxVoices: 2, priority: 3,
    duck: { depth: 0.5, hold: 1.2, release: 1.2 },
    play(S) {
      const side = S.rng.range(-0.5, 0.5);
      const v = S.voice({ pan: side });
      S.wet(v, 0.6);
      if (S.p.near) noiseHit(v, S.t, { decay: 0.08, peak: 0.6, filter: { type: 'highpass', f: 1500 } });
      const rumble = v.noise('brown', S.t, S.t + 4);
      const low = v.filter('lowpass', 260, 0.7);
      sweep(low.frequency, S.t, 260, 90, 3.5);
      const swells = v.gain(0);
      const shape = [[0.05, 0.8], [0.5, 0.3], [0.9, 0.7], [1.5, 0.2], [2.0, 0.5], [3.4, 0.0001]];
      swells.gain.setValueAtTime(0.0001, S.t);
      for (const [at, level] of shape) swells.gain.linearRampToValueAtTime(Math.max(level, 0.0001) * S.rng.range(0.85, 1.1), S.t + at);
      v.chain(rumble, low, swells, v.out);
      tone(v, S.t, { f: 48, f2: 30, attack: 0.1, decay: 2.5, peak: 0.4 });
      const wide = S.aux({ pan: -side });
      const echo = wide.noise('brown', S.t + 0.12, S.t + 3.6);
      const deep = wide.filter('lowpass', 200, 0.7);
      const echoEnv = wide.gain(0);
      percussive(echoEnv.gain, S.t + 0.12, 0.5, 0.3, 2.8);
      wide.chain(echo, deep, echoEnv, wide.out);
    },
  },

  'near-miss': {
    bus: 'world', gain: 0.668, cooldown: 0.3, maxVoices: 2, priority: 3,
    play(S) {
      const side = S.p.side === -1 || S.p.side === 1 ? S.p.side : S.rng.sign();
      const v = S.voice({ pan: 0 });
      const lean = v.panner(0);
      lean.pan.setValueAtTime(side * 0.9, S.t);
      lean.pan.linearRampToValueAtTime(-side * 0.2, S.t + 0.7);
      lean.connect(v.out);
      const peak = (param, level, rise, fall) => {
        param.setValueAtTime(FLOOR, S.t);
        param.linearRampToValueAtTime(level, S.t + rise);
        param.exponentialRampToValueAtTime(FLOOR, S.t + rise + fall);
      };
      for (const detune of [-15, 15]) {
        const jet = v.osc('sawtooth', 260, S.t, S.t + 0.8);
        jet.detune.value = detune;
        sweep(jet.frequency, S.t, 260, 150, 0.7);
        const low = v.filter('lowpass', 1500, 0.8);
        sweep(low.frequency, S.t, 1500, 500, 0.7);
        const env = v.gain(0);
        peak(env.gain, 0.17, 0.25, 0.45);
        v.chain(jet, low, env, lean);
      }
      const whoosh = v.noise('white', S.t, S.t + 0.8);
      const band = v.filter('bandpass', 2500, 0.9);
      sweep(band.frequency, S.t, 2500, 700, 0.7);
      const whooshEnv = v.gain(0);
      peak(whooshEnv.gain, 0.5, 0.25, 0.45);
      v.chain(whoosh, band, whooshEnv, lean);
    },
  },

  hit: {
    bus: 'world', gain: 0.272, cooldown: 0.12, maxVoices: 2, priority: 4,
    duck: { depth: 0.5, hold: 0.25, release: 0.5 },
    play(S) {
      const v = S.voice();
      S.wet(v, 0.15);
      fm(v, S.t, { f: 260, ratio: 1.41, index: 3, indexEnd: 0.2, decay: 0.3, peak: 0.8 });
      fm(v, S.t + 0.01, { f: 410, ratio: 2.2, index: 3, indexEnd: 0.2, decay: 0.2, peak: 0.4 });
      tone(v, S.t, { f: 120, f2: 55, decay: 0.15, peak: 0.9 });
      noiseHit(v, S.t, { decay: 0.1, peak: 0.6, filter: { type: 'bandpass', f: 1800, q: 1 } });
      clickTrain(v, [S.t + 0.12, S.t + 0.2, S.t + 0.31], { fLo: 2500, fHi: 4500, peak: 0.25 }, S);
    },
  },
};

// ---------------------------------------------------------------------------

export const SFX_CATALOG = Object.freeze({ ...ui, ...world });

const SERIES_NAMES = new Set(['coin', 'ring']);
const SERIES_GAP = { coin: 1.1, ring: 4 };

// Runtime: picks voices, applies cooldowns and polyphony limits, ducks music.
export function createSfx({ ctx, graph, toolkit, rng, now, getEnvironment }) {
  const lastPlay = new Map();
  const series = new Map();
  const stats = { played: 0, dropped: 0 };

  function nextSeries(name, t, explicit) {
    if (Number.isFinite(explicit)) return Math.max(0, explicit | 0);
    if (!SERIES_NAMES.has(name)) return 0;
    const state = series.get(name) ?? { at: -10, count: 0 };
    state.count = t - state.at < SERIES_GAP[name] ? state.count + 1 : 0;
    state.at = t;
    series.set(name, state);
    return state.count;
  }

  function context(name, entry, params, t, seriesIndex) {
    const p = params ?? {};
    const pitch = clamp(p.pitch ?? 1, 0.25, 4);
    const base = (extra = {}) => ({
      name: extra.name ?? name,
      group: 'sfx',
      dest: graph.buses[entry.bus],
      pan: extra.pan ?? clamp(p.pan ?? 0, -1, 1),
      gain: entry.gain * clamp(p.gain ?? 1, 0, 2) * (extra.gain ?? 1),
      priority: entry.priority,
    });
    const S = {
      t,
      p,
      rng,
      pitch,
      series: seriesIndex,
      body: typeof p.body === 'string' ? p.body : 'earth',
      env: getEnvironment(),
      f: (freq) => freq * pitch,
      voice: (extra) => toolkit.voice(base(extra)),
      aux: (extra) => toolkit.voice(base({ ...extra, name: `${name}:aux` })),
      wet(voice, amount) {
        const send = voice.gain(amount);
        voice.out.connect(send);
        send.connect(entry.bus === 'world' ? graph.buses.worldWet : graph.buses.reverb);
      },
    };
    return S;
  }

  function play(name, params) {
    const entry = SFX_CATALOG[name];
    if (!entry) return false;
    const t = now() + 0.005;
    const last = lastPlay.get(name) ?? -10;
    if (t - last < entry.cooldown) {
      stats.dropped++;
      return false;
    }
    lastPlay.set(name, t);
    if (toolkit.count('sfx', name) >= entry.maxVoices) toolkit.stealOldest('sfx', name);
    const S = context(name, entry, params, t, nextSeries(name, t, params?.series));
    entry.play(S);
    if (entry.duck) graph.duckMusic(entry.duck, t);
    stats.played++;
    return true;
  }

  return { play, stats, has: (name) => Boolean(SFX_CATALOG[name]) };
}

