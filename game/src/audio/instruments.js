// Synth patches for the music layers. Each patch turns one planner event into
// a short-lived Voice; the player supplies the destination buses.

import { fm, noiseHit, tone } from './primitives.js';
import { createPulseWave, noteEnvelope, sweep, swell } from './synth.js';
import { midiToHz as hz } from './util.js';

const PAD_PATCHES = {
  warm: { cutoff: 1600, attack: 0.35, release: 0.8, types: ['sawtooth', 'sawtooth', 'triangle'], detune: 8 },
  saw: { cutoff: 2600, attack: 0.18, release: 0.5, types: ['sawtooth', 'sawtooth', 'square'], detune: 12 },
  airy: { cutoff: 3600, attack: 0.8, release: 1.4, types: ['triangle', 'sine', 'sawtooth'], detune: 6 },
  cold: { cutoff: 1200, attack: 0.6, release: 1.0, types: ['sine', 'triangle', 'sawtooth'], detune: 7 },
  dark: { cutoff: 850, attack: 0.3, release: 0.6, types: ['sawtooth', 'sawtooth', 'square'], detune: 10 },
};

function pad(inst, e) {
  const p = PAD_PATCHES[e.patch] ?? PAD_PATCHES.warm;
  const { tk } = inst;
  const v = tk.voice({ name: 'pad', group: 'music', dest: inst.dest.pad, pan: e.pan, gain: 0 });
  const f = hz(e.midi);
  const end = e.t + e.dur;
  const lowpass = v.filter('lowpass', p.cutoff * 0.45, 0.6);
  lowpass.frequency.setValueAtTime(p.cutoff * 0.45, e.t);
  lowpass.frequency.setTargetAtTime(p.cutoff, e.t, p.attack);
  const stop = end + p.release * 7;
  const levels = [0.5, 0.5, 0.2];
  [-p.detune, p.detune, 0].forEach((cents, i) => {
    const osc = v.osc(p.types[i], i === 2 ? f / 2 : f, e.t, stop);
    osc.detune.value = cents;
    const g = v.gain(levels[i]);
    v.chain(osc, g, lowpass);
  });
  lowpass.connect(v.out);
  swell(v.amp, e.t, 0.2 * e.vel, p.attack, end, p.release);
}

function bass(inst, e) {
  const { tk } = inst;
  const v = tk.voice({ name: 'bass', group: 'music', dest: inst.dest.bass, gain: 0 });
  const f = hz(e.midi);
  const stop = noteEnvelope(v.amp, e.t, e.dur, {
    attack: 0.006, peak: 0.55 * e.vel, sustain: e.patch === 'sub' ? 0.85 : 0.55, decayTau: 0.12, release: 0.07,
  });
  const body = v.gain(1);
  if (e.patch === 'sub') {
    const sine = v.osc('sine', f, e.t, stop);
    const tri = v.osc('triangle', f * 2, e.t, stop);
    const triGain = v.gain(0.22);
    const low = v.filter('lowpass', 520, 0.7);
    v.chain(sine, body, low);
    v.chain(tri, triGain, low);
    low.connect(v.out);
    return;
  }
  const wave = e.patch === 'pulse' ? inst.pulse(0.3) : 'sawtooth';
  const main = v.osc(wave, f, e.t, stop);
  const sub = v.osc('square', f / 2, e.t, stop);
  const subGain = v.gain(0.5);
  const flt = v.filter('lowpass', 200, 1.2);
  flt.frequency.setValueAtTime(600 + 1500 * e.vel, e.t);
  flt.frequency.exponentialRampToValueAtTime(180, e.t + 0.22);
  v.chain(main, body, flt);
  v.chain(sub, subGain, flt);
  flt.connect(v.out);
}

function arp(inst, e) {
  const { tk } = inst;
  const v = tk.voice({ name: 'arp', group: 'music', dest: inst.dest.arp, pan: e.pan, gain: 1 });
  const f = hz(e.midi);
  const peak = 0.34 * e.vel;
  switch (e.patch) {
    case 'ep':
      fm(v, e.t, { f, ratio: 1, index: 1.4, indexEnd: 0.12, attack: 0.004, decay: e.dur * 0.95, peak });
      fm(v, e.t, { f, ratio: 14, index: 0.6, indexEnd: 0.001, attack: 0.002, decay: 0.07, peak: peak * 0.45 });
      break;
    case 'bell':
      fm(v, e.t, { f, ratio: 3.5, index: 2.4, indexEnd: 0.2, attack: 0.003, decay: e.dur * 1.1, peak });
      tone(v, e.t, { f: f * 2, attack: 0.003, decay: e.dur * 0.6, peak: peak * 0.22 });
      break;
    case 'glass': {
      const parts = [[1, 1], [2, 0.38], [3, 0.2], [4.01, 0.1]];
      for (const [mult, level] of parts) {
        tone(v, e.t, { f: f * mult, attack: 0.012, decay: e.dur * (1.1 / Math.sqrt(mult)), peak: peak * 0.55 * level });
      }
      fm(v, e.t, { f, ratio: 5.2, index: 0.9, indexEnd: 0.02, attack: 0.004, decay: 0.25, peak: peak * 0.18 });
      break;
    }
    case 'pluck':
      for (const cents of [-7, 7]) {
        const note = tone(v, e.t, {
          type: 'sawtooth', f, attack: 0.004, decay: e.dur * 0.85, peak: peak * 0.6,
          filter: { f: 3600, f2: 500, q: 1.1 },
        });
        note.osc.detune.value = cents;
      }
      break;
    default: {
      // 'pulse': narrow pulse waves through a closing low-pass.
      for (const [duty, cents] of [[0.28, -6], [0.55, 6]]) {
        const note = tone(v, e.t, {
          type: inst.pulse(duty), f, attack: 0.003, decay: e.dur * 0.9, peak: peak * 0.5,
          filter: { f: 3200, f2: 650, q: 2 },
        });
        note.osc.detune.value = cents;
      }
    }
  }
}

function lead(inst, e) {
  const { tk } = inst;
  const bells = e.patch === 'bell' || e.patch === 'glass';
  const v = tk.voice({ name: 'lead', group: 'music', dest: inst.dest.lead, pan: e.pan, gain: bells ? 1 : 0 });
  const f = hz(e.midi);
  const peak = 0.3 * e.vel;
  if (bells) {
    fm(v, e.t, { f, ratio: 3.5, index: 2, indexEnd: 0.15, attack: 0.004, decay: e.dur * 1.4, peak });
    tone(v, e.t, { f: f * 2, attack: 0.004, decay: e.dur, peak: peak * 0.2 });
    return;
  }
  const saw = e.patch === 'saw';
  const stop = noteEnvelope(v.amp, e.t, e.dur, { attack: saw ? 0.015 : 0.04, peak, release: saw ? 0.18 : 0.25 });
  const flt = v.filter('lowpass', saw ? 2600 : 3200, 0.8);
  if (saw) {
    flt.frequency.setValueAtTime(900, e.t);
    flt.frequency.setTargetAtTime(2600, e.t, 0.08);
  }
  const types = saw ? ['sawtooth', 'sawtooth'] : ['triangle', 'sine'];
  const oscs = types.map((type) => v.osc(type, f, e.t, stop));
  oscs[0].detune.value = saw ? -8 : 0;
  oscs[1].detune.value = saw ? 8 : 5;
  const mix = v.gain(saw ? 0.5 : 0.7);
  for (const osc of oscs) v.chain(osc, mix);
  v.chain(mix, flt, v.out);
  // Vibrato fades in after the attack, like a played instrument.
  const lfo = v.osc('sine', 5.3, e.t, stop);
  const depth = v.gain(0);
  depth.gain.setValueAtTime(0, e.t);
  depth.gain.linearRampToValueAtTime(saw ? 14 : 10, e.t + Math.max(0.2, e.dur * 0.6));
  v.chain(lfo, depth);
  for (const osc of oscs) depth.connect(osc.detune);
}

// ---- drums ----

function kick(inst, e) {
  const v = inst.tk.voice({ name: 'drum', group: 'music', dest: inst.dest.drum, gain: 1 });
  const body = tone(v, e.t, { f: 155, attack: 0.002, decay: 0.34, peak: 0.95 * e.vel });
  sweep(body.osc.frequency, e.t, 155, 46, 0.1);
  noiseHit(v, e.t, { decay: 0.012, peak: 0.3 * e.vel, filter: { type: 'highpass', f: 2200 } });
}

function snare(inst, e) {
  const v = inst.tk.voice({ name: 'drum', group: 'music', dest: inst.dest.snare, gain: 1 });
  noiseHit(v, e.t, { decay: 0.17, peak: 0.6 * e.vel, filter: { type: 'bandpass', f: 1900, q: 0.7 } });
  noiseHit(v, e.t, { decay: 0.1, peak: 0.25 * e.vel, filter: { type: 'highpass', f: 5000 } });
  tone(v, e.t, { type: 'triangle', f: 200, f2: 140, attack: 0.002, decay: 0.09, peak: 0.5 * e.vel });
}

function clap(inst, e) {
  const v = inst.tk.voice({ name: 'drum', group: 'music', dest: inst.dest.snare, gain: 1 });
  [0, 0.011, 0.023].forEach((at) => noiseHit(v, e.t + at, { decay: 0.01, peak: 0.45 * e.vel, filter: { type: 'bandpass', f: 1500, q: 1.2 } }));
  noiseHit(v, e.t + 0.03, { decay: 0.2, peak: 0.4 * e.vel, filter: { type: 'bandpass', f: 1400, q: 1 } });
}

function hat(inst, e, open) {
  const v = inst.tk.voice({ name: 'drum', group: 'music', dest: inst.dest.drum, gain: 1 });
  noiseHit(v, e.t, { decay: open ? 0.2 : 0.035, peak: (open ? 0.22 : 0.28) * e.vel, filter: { type: 'highpass', f: open ? 6500 : 8000 } });
}

function shaker(inst, e) {
  const v = inst.tk.voice({ name: 'drum', group: 'music', dest: inst.dest.drum, gain: 1 });
  noiseHit(v, e.t, { attack: 0.012, decay: 0.06, peak: 0.2 * e.vel, filter: { type: 'bandpass', f: 6200, q: 0.8 } });
}

function rim(inst, e) {
  const v = inst.tk.voice({ name: 'drum', group: 'music', dest: inst.dest.drum, gain: 1 });
  tone(v, e.t, { f: 1700, attack: 0.001, decay: 0.012, peak: 0.4 * e.vel });
  noiseHit(v, e.t, { decay: 0.015, peak: 0.3 * e.vel, filter: { type: 'bandpass', f: 4000, q: 1.5 } });
}

const TOM_PITCH = [205, 160, 120];
function tom(inst, e) {
  const v = inst.tk.voice({ name: 'drum', group: 'music', dest: inst.dest.drum, gain: 1 });
  const f = TOM_PITCH[e.note ?? 0] ?? 160;
  tone(v, e.t, { f: f * 1.25, f2: f, attack: 0.002, decay: 0.28, peak: 0.8 * e.vel });
  noiseHit(v, e.t, { decay: 0.02, peak: 0.2 * e.vel, filter: { type: 'bandpass', f: 1200, q: 1 } });
}

const DRUMS = {
  kick, snare, clap, shaker, rim, tom,
  hat: (inst, e) => hat(inst, e, false),
  ohat: (inst, e) => hat(inst, e, true),
};

// ---- accents ----

function fx(inst, e) {
  const v = inst.tk.voice({ name: 'fx', group: 'music', dest: inst.dest.fx, gain: 1 });
  if (e.kind === 'crash') {
    noiseHit(v, e.t, { decay: 1.4, peak: 0.4 * e.vel, filter: { type: 'highpass', f: 3500 } });
    noiseHit(v, e.t, { decay: 0.8, peak: 0.2 * e.vel, filter: { type: 'bandpass', f: 7000, q: 0.6 } });
    return;
  }
  // 'impact': a soft boom that marks a change of scene or zone.
  tone(v, e.t, { f: 70, f2: 32, decay: 1.2, peak: 0.55 * e.vel });
  noiseHit(v, e.t, { color: 'pink', attack: 0.05, decay: 1.0, peak: 0.25 * e.vel, filter: { type: 'lowpass', f: 1800, f2: 200 } });
}

function heart(inst, e) {
  const v = inst.tk.voice({ name: 'heart', group: 'music', dest: inst.dest.heart, gain: 1 });
  const lub = e.kind === 'lub';
  tone(v, e.t, { f: lub ? 88 : 98, f2: lub ? 46 : 54, attack: 0.004, decay: lub ? 0.16 : 0.13, peak: 0.9 * e.vel });
  noiseHit(v, e.t, { color: 'brown', decay: 0.08, peak: 0.35 * e.vel, filter: { type: 'lowpass', f: 400 } });
}

const LAYERS = { pad, bass, arp, lead, drum: null, fx, heart };

export function createInstruments({ ctx, toolkit, dest }) {
  const pulses = new Map();
  const inst = {
    tk: toolkit,
    dest,
    pulse(duty) {
      const key = Math.round(duty * 100);
      if (!pulses.has(key)) pulses.set(key, createPulseWave(ctx, key / 100));
      return pulses.get(key);
    },
  };
  return {
    play(e) {
      if (e.layer === 'drum') DRUMS[e.kind]?.(inst, e);
      else LAYERS[e.layer]?.(inst, e);
    },
  };
}

