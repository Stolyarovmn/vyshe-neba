// Generative music planner. Pure: no Web Audio, no clocks. Given a target state
// and a time window it returns timed note events, always the same ones for the
// same seed, state history and window sequence.
//
// The grid is 4/4 in sixteenth steps. Layers (pad, bass, arp, lead, drums) are
// latched on at bar boundaries so they enter on the downbeat; a zone change
// waits for the next bar, a scene change for the next beat.

import { CHORD_SHAPES, MOTIFS, PROFILES, profileIdFor } from './score.js';
import { createRng } from './prng.js';
import { approach, clamp01, lerp, pickClosest, smoothstep } from './util.js';

export const STEPS_PER_BAR = 16;
export const ENABLE_LEVEL = 0.04;
const START_DELAY = 0.08;
const MAX_LATE = 0.06;
const MAX_STALL = 0.5; // longer gaps (mute, suspended tab) restart the grid instead of catching up
const ARP_STEP_FEEL = { X: 1, x: 0.82, o: 0.5 };
const DRUM_FEEL = { X: 1, x: 0.82, o: 0.45 };
const LEAD_WALK = [-2, -1, -1, 0, 1, 1, 2, 3];
const BROKEN = [0, 1, 2, 1, 0, 2, 1, 3];

export const DEFAULT_TARGET = Object.freeze({
  scene: 'hub',
  zone: 'ground',
  mood: 'win',
  intensity: 0.25,
  tension: 0,
  speed01: 0,
  alt01: 0,
  paused: false,
});

// ---------------------------------------------------------------------------
// Theory helpers (exported for tests)

export function chordInfo(profile, chord) {
  const shape = CHORD_SHAPES[chord.q];
  const rootPc = (profile.root + chord.r) % 12;
  const pcs = [...new Set(shape.map((i) => (rootPc + i) % 12))];
  return { rootPc, shape, pcs };
}

export function nearestAtOrAbove(pc, floor) {
  return floor + ((((pc - floor) % 12) + 12) % 12);
}

export function scaleMidi(profile, base, degree) {
  const n = profile.scale.length;
  const octave = Math.floor(degree / n);
  const index = ((degree % n) + n) % n;
  return base + 12 * octave + profile.scale[index];
}

export function chordAt(profile, barCounter) {
  const number = Math.floor(barCounter / profile.chordBars);
  const len = profile.sections[0].length;
  const section = profile.sections[Math.floor(number / len) % profile.sections.length];
  return { chord: section[number % section.length], number, sectionStart: number % len === 0 };
}

export function pickPattern(list, intensity) {
  let chosen = null;
  for (const entry of list ?? []) if (entry.tier <= intensity) chosen = entry.p;
  return chosen;
}

// Distance in steps from `step` to the next played step of a bass pattern.
function noteSpan(pattern, step) {
  for (let d = 1; d <= STEPS_PER_BAR; d++) if (pattern[(step + d) % STEPS_PER_BAR] !== '.') return d;
  return STEPS_PER_BAR;
}

function padIntervals(shape) {
  return shape.length <= 4 ? shape : shape.filter((_, i) => i !== 2).slice(0, 4);
}

// Keeps the chord's own stacking (root, third, seventh, ninth...) so extensions
// stay on top, then tries octave lifts and inversions and keeps the voicing that
// moves least from the previous chord while staying in the pad register.
export function voicePad(profile, info, previous) {
  const home = profile.padCenter;
  const rootBase = nearestAtOrAbove(info.rootPc, Math.round(home) - 14);
  const stack = [...new Set(padIntervals(info.shape))].sort((a, b) => a - b).map((i) => rootBase + i);
  let best = null;
  for (const lift of [-12, 0, 12]) {
    for (let k = 0; k < stack.length; k++) {
      const notes = [...new Set(stack.map((n, i) => n + lift + (i < k ? 12 : 0)))].sort((x, y) => x - y);
      const center = notes.reduce((sum, n) => sum + n, 0) / notes.length;
      const spread = notes[notes.length - 1] - notes[0];
      let cost = Math.max(0, Math.abs(center - home) - 5) * 4 + Math.max(0, spread - 16) * 2;
      cost += previous ? voiceMotion(previous.notes, notes) : Math.abs(center - home);
      if (!best || cost < best.cost) best = { notes, center, cost };
    }
  }
  return { notes: best.notes, center: best.center };
}

function voiceMotion(from, to) {
  const n = Math.min(from.length, to.length);
  let total = 2 * Math.abs(from.length - to.length);
  for (let i = 0; i < n; i++) total += Math.abs(from[from.length - 1 - i] - to[to.length - 1 - i]);
  return total;
}

export function mixTargets(profile, s) {
  const i = clamp01(s.intensity);
  const tension = clamp01(s.tension);
  const ramp = (range) => smoothstep(range[0], range[1], i);
  const L = profile.levels;
  const g = profile.gates;
  const calm = s.paused ? 0.5 : 1;
  return {
    pad: L.pad * lerp(1, 0.8, i) * calm,
    bass: L.bass * ramp(g.bass) * calm,
    arp: L.arp * ramp(g.arp) * calm,
    lead: L.lead * ramp(g.lead) * calm,
    perc: L.perc * ramp(g.perc) * calm,
    heart: smoothstep(0.12, 0.6, tension),
    cutoff: s.paused ? 650 : profile.tone * lerp(1, 0.5, tension) * lerp(0.85, 1.1, clamp01(s.speed01)),
    reverb: profile.fx.reverb * lerp(0.85, 1.2, clamp01(s.alt01)),
    delaySend: profile.fx.delaySend,
  };
}

// ---------------------------------------------------------------------------

export function createPlanner({ seed = 1 } = {}) {
  const base = createRng(seed);
  const rng = {
    pad: base.fork('pad'),
    bass: base.fork('bass'),
    arp: base.fork('arp'),
    lead: base.fork('lead'),
    drum: base.fork('drum'),
  };
  const target = { ...DEFAULT_TARGET };
  const smooth = { intensity: DEFAULT_TARGET.intensity, tension: 0 };

  let profile = null;
  let nextStepTime = null;
  let nextBeatTime = null;
  let step = 0;
  let barCounter = 0;
  let padPrev = null;
  let bar = null; // per-bar latch
  let phrase = null;
  let leadLast = null;
  let arp = { pool: [], index: 0, dir: 1, toggle: false };

  function setTarget(partial) {
    for (const key of Object.keys(DEFAULT_TARGET)) if (partial[key] !== undefined) target[key] = partial[key];
    target.intensity = clamp01(target.intensity);
    target.tension = clamp01(target.tension);
  }

  function advance(dt) {
    const up = target.intensity > smooth.intensity;
    smooth.intensity = approach(smooth.intensity, target.intensity, dt, up ? 1.1 : 2.4);
    smooth.tension = approach(smooth.tension, target.tension, dt, target.tension > smooth.tension ? 0.5 : 1.8);
  }

  const currentState = () => ({ ...target, intensity: smooth.intensity, tension: smooth.tension });
  const mix = () => (profile ? mixTargets(profile, currentState()) : null);

  function enter(id, t, out) {
    const first = profile === null;
    profile = PROFILES[id];
    step = 0;
    barCounter = 0;
    padPrev = null;
    phrase = null;
    leadLast = null;
    if (!first) {
      out.push({ t, layer: 'ctl', kind: 'switch', profile: id, bpm: profile.bpm });
      out.push({ t, layer: 'fx', kind: 'impact', vel: 0.7 });
    }
  }

  function wantsSwitch() {
    const wanted = profileIdFor(target);
    if (profile === null) return wanted;
    if (wanted === profile.id) return null;
    const sceneChange = sceneOf(wanted) !== sceneOf(profile.id);
    const boundary = sceneChange ? step % 4 === 0 : step === 0;
    return boundary ? wanted : null;
  }

  function startBar(t, stepDur, out) {
    const { chord, number, sectionStart } = chordAt(profile, barCounter);
    const info = chordInfo(profile, chord);
    const chordStart = barCounter % profile.chordBars === 0;
    const mixNow = mix();
    const intensity = smooth.intensity;
    bar = {
      chord,
      info,
      chordStart,
      intensity,
      fill: barCounter % 4 === 3 && intensity > 0.6,
      active: {
        pad: mixNow.pad > ENABLE_LEVEL,
        bass: mixNow.bass > ENABLE_LEVEL,
        arp: mixNow.arp > ENABLE_LEVEL,
        lead: mixNow.lead > ENABLE_LEVEL,
        perc: mixNow.perc > ENABLE_LEVEL,
      },
    };
    if (chordStart) {
      resetArp(info);
      if (bar.active.pad) emitPad(t, stepDur, info, out);
      if (sectionStart && number > 0 && bar.active.perc && intensity > 0.55) {
        out.push({ t, layer: 'fx', kind: 'crash', vel: 0.6 });
      }
    }
    if (barCounter % 4 === 0) phrase = newPhrase();
  }

  function emitPad(t, stepDur, info, out) {
    const voicing = voicePad(profile, info, padPrev);
    padPrev = voicing;
    const dur = profile.chordBars * STEPS_PER_BAR * stepDur + 0.6;
    const n = voicing.notes.length;
    voicing.notes.forEach((midi, i) => {
      out.push({
        t: t + i * 0.014,
        layer: 'pad',
        patch: profile.pad.patch,
        midi,
        dur,
        vel: profile.pad.vel * (i === 0 ? 0.85 : 0.9 + 0.1 * rng.pad.next()),
        pan: n > 2 ? ((i / (n - 1)) - 0.5) * 1.1 : 0,
      });
    });
  }

  function resetArp(info) {
    const [lo, hi] = profile.arp.range;
    const pool = [];
    for (let m = lo; m <= hi; m++) if (info.pcs.includes(m % 12)) pool.push(m);
    arp = { pool, index: Math.floor(pool.length * 0.2), start: Math.floor(pool.length * 0.2), dir: 1, toggle: false, n: 0 };
  }

  function newPhrase() {
    const rhythm = rng.lead.pick(MOTIFS[profile.lead.motifs]);
    let degree = 2 + rng.lead.int(5);
    const notes = rhythm.map(([stepIndex, len]) => {
      degree = Math.max(1, Math.min(11, degree + rng.lead.pick(LEAD_WALK)));
      return { step: stepIndex, len, degree };
    });
    const last = notes[notes.length - 1];
    const before = notes.length > 1 ? notes[notes.length - 2].degree : degree;
    last.degree = pickClosest([0, 2, 4, 7], before);
    return notes;
  }

  function emitBass(t, stepDur, out) {
    if (!bar.active.bass) return;
    const pattern = pickPattern(profile.bass.pattern, bar.intensity);
    const token = pattern?.[step];
    if (!token || token === '.') return;
    const root = nearestAtOrAbove(bar.info.rootPc, profile.bass.register);
    const midi = bassNote(token, root);
    const span = noteSpan(pattern, step);
    out.push({
      t,
      layer: 'bass',
      patch: profile.bass.patch,
      midi,
      dur: Math.max(0.06, span * stepDur * profile.bass.gate),
      vel: token === 'r' ? 0.6 : step === 0 ? 1 : 0.85,
    });
  }

  function bassNote(token, root) {
    const shape = bar.info.shape;
    switch (token) {
      case 'r': return root + 12;
      case '5': return root + (shape.find((i) => i === 6 || i === 7) ?? 7);
      case '3': return root + shape[1];
      case '7': return root + (shape[3] ?? 10);
      case 'c': return root + shape[rng.bass.int(Math.min(4, shape.length))] % 12;
      default: return root;
    }
  }

  function emitArp(t, stepDur, swingOffset, out) {
    if (!bar.active.arp || arp.pool.length === 0) return;
    const list = profile.arp.steps;
    const pattern = pickPattern(list, bar.intensity);
    const token = pattern?.[step];
    if (!token || token === '.') return;
    const density = profile.arp.density * lerp(0.75, 1, bar.intensity);
    if (token !== 'X' && !rng.arp.chance(density)) return;
    const midi = nextArpNote();
    const side = (barCounter * 16 + step) % 2 === 0 ? -1 : 1;
    out.push({
      t: t + swingOffset,
      layer: 'arp',
      patch: profile.arp.patch,
      midi,
      dur: Math.max(0.08, stepDur * 2 * profile.arp.gate),
      vel: ARP_STEP_FEEL[token] * (0.9 + 0.2 * rng.arp.next()),
      pan: 0.3 * side,
    });
  }

  function nextArpNote() {
    const { pool } = arp;
    const n = pool.length;
    const note = pool[Math.max(0, Math.min(n - 1, arp.index))];
    switch (profile.arp.mode) {
      case 'updown':
        if (arp.index >= n - 1) arp.dir = -1;
        else if (arp.index <= 0) arp.dir = 1;
        arp.index += n > 1 ? arp.dir : 0;
        break;
      case 'skip':
        arp.index = (arp.index + (arp.toggle ? -1 : 2) + n) % n;
        arp.toggle = !arp.toggle;
        break;
      case 'broken':
        arp.n++;
        arp.index = (arp.start + BROKEN[arp.n % BROKEN.length]) % n;
        break;
      case 'rand':
        arp.index = Math.max(0, Math.min(n - 1, arp.index + rng.arp.pick([-3, -2, -1, 1, 2, 3])));
        break;
      default:
        arp.index = (arp.index + 1) % n;
    }
    return note;
  }

  function emitLead(t, stepDur, out) {
    if (!bar.active.lead || !phrase) return;
    const cycleBar = barCounter % 4;
    if (!profile.lead.bars[cycleBar]) return;
    const [lo, hi] = profile.lead.range;
    const tonic = nearestAtOrAbove(profile.root % 12, lo);
    const shift = [0, 1, 0, -1][cycleBar];
    for (const note of phrase) {
      if (note.step !== step) continue;
      const last = note === phrase[phrase.length - 1];
      let midi = scaleMidi(profile, tonic, note.degree + shift);
      while (midi > hi) midi -= 12;
      if (note.step % 8 === 0 || note.len >= 4 || last) midi = snapToChord(midi, bar.info.pcs);
      midi = limitLeap(midi, leadLast, lo, hi);
      leadLast = midi;
      out.push({
        t,
        layer: 'lead',
        patch: profile.lead.patch,
        midi,
        dur: Math.max(0.1, note.len * stepDur * 0.94),
        vel: profile.lead.vel * (note.step === 0 ? 1 : 0.88),
        pan: 0.1 * (cycleBar - 1.5),
      });
    }
  }

  // Keeps the melody singable: no leap wider than a major sixth when an octave shift avoids it.
  function limitLeap(midi, previous, lo, hi) {
    if (previous === null) return midi;
    for (const shift of [-12, 12]) {
      const moved = midi + shift;
      if (Math.abs(midi - previous) > 9 && Math.abs(moved - previous) < Math.abs(midi - previous) && moved >= lo && moved <= hi) return moved;
    }
    return midi;
  }

  function snapToChord(midi, pcs) {
    const candidates = [];
    for (let m = midi - 3; m <= midi + 3; m++) if (pcs.includes(((m % 12) + 12) % 12)) candidates.push(m);
    return candidates.length ? pickClosest(candidates, midi) : midi;
  }

  function emitDrums(t, swingOffset, out) {
    if (!bar.active.perc) return;
    const drums = profile.drums;
    const chosen = {};
    for (const kind of Object.keys(drums)) chosen[kind] = pickPattern(drums[kind], bar.intensity);
    const fillNow = bar.fill && step >= 12;
    for (const kind of Object.keys(chosen)) {
      const token = chosen[kind]?.[step];
      if (!token || token === '.') continue;
      if (fillNow && kind !== 'kick' && kind !== 'tom') continue;
      if (kind === 'hat' && chosen.ohat?.[step] && chosen.ohat[step] !== '.') continue;
      const jitter = kind === 'hat' || kind === 'shaker' ? rng.drum.soft() * 0.004 : 0;
      const event = { t: t + swingOffset + jitter, layer: 'drum', kind, vel: DRUM_FEEL[token] };
      if (kind === 'tom') event.note = (Math.floor(step / 3) + barCounter) % 3;
      out.push(event);
    }
    if (fillNow) {
      const kind = drums.tom ? 'tom' : 'snare';
      const event = { t, layer: 'drum', kind, vel: 0.45 + 0.15 * (step - 12) };
      if (kind === 'tom') event.note = 15 - step > 1 ? 0 : 2;
      out.push(event);
    }
  }

  function stepOnce(out) {
    const wanted = wantsSwitch();
    if (wanted) enter(wanted, nextStepTime, out);
    const stepDur = 60 / profile.bpm / 4;
    const t = nextStepTime;
    if (step === 0) startBar(t, stepDur, out);
    const swingOffset = step % 2 === 1 ? profile.swing * stepDur : 0;
    emitBass(t + swingOffset, stepDur, out);
    emitArp(t, stepDur, swingOffset, out);
    emitLead(t, stepDur, out);
    emitDrums(t, swingOffset, out);
    step = (step + 1) % STEPS_PER_BAR;
    if (step === 0) barCounter++;
    nextStepTime = t + stepDur;
  }

  function emitHeartbeat(until, out) {
    if (smooth.tension <= 0.12) {
      nextBeatTime = null;
      return;
    }
    while (nextBeatTime !== null && nextBeatTime < until) {
      const period = lerp(1.05, 0.5, smooth.tension);
      const vel = 0.35 + 0.65 * smooth.tension;
      out.push({ t: nextBeatTime, layer: 'heart', kind: 'lub', vel });
      out.push({ t: nextBeatTime + period * 0.3, layer: 'heart', kind: 'dub', vel: vel * 0.7 });
      nextBeatTime += period;
    }
  }

  // Returns every event whose start time falls in [now, horizon). Events that
  // would have started before `now` (a stalled caller) are dropped, except pad
  // chords, which are kept late so the harmony never disappears.
  function plan(now, horizon) {
    const out = [];
    if (nextStepTime === null || nextStepTime < now - MAX_STALL) nextStepTime = now + START_DELAY;
    if (nextBeatTime !== null && nextBeatTime < now - MAX_STALL) nextBeatTime = now + START_DELAY;
    if (nextBeatTime === null && smooth.tension > 0.12) nextBeatTime = now + START_DELAY;
    while (nextStepTime < horizon) stepOnce(out);
    emitHeartbeat(horizon, out);
    return lateFilter(out, now).sort((a, b) => a.t - b.t);
  }

  function lateFilter(events, now) {
    const kept = [];
    for (const e of events) {
      if (e.t >= now - MAX_LATE) kept.push(e);
      else if (e.layer === 'pad' && e.t + e.dur > now + 1) kept.push({ ...e, dur: e.dur - (now - e.t), t: now });
    }
    return kept;
  }

  function reset() {
    profile = null;
    nextStepTime = null;
    nextBeatTime = null;
    step = 0;
    barCounter = 0;
    padPrev = null;
    phrase = null;
    bar = null;
  }

  const profileFx = () => (profile ? profile.fx : null);

  function info() {
    return {
      profile: profile ? profile.id : null,
      bpm: profile ? profile.bpm : 0,
      step,
      bar: barCounter,
      chord: bar ? bar.chord : null,
      intensity: smooth.intensity,
      tension: smooth.tension,
    };
  }

  return { setTarget, advance, plan, mix, reset, info, profileFx, get target() { return { ...target }; } };
}

function sceneOf(profileId) {
  if (profileId === 'hub') return 'hub';
  return profileId.startsWith('results') ? 'results' : 'flight';
}
