// Voice plumbing shared by sound effects and music instruments.
//
// A Voice owns every node it creates and releases all of them when its last
// source ends, so nothing leaks no matter how long the game runs. The toolkit
// counts voices per group and steals the oldest one when a group is full.

import { clamp } from './util.js';

export const FLOOR = 0.0001;

// ---- envelope helpers (all times absolute, in context seconds) ----

// Linear attack, optional hold, exponential decay to silence.
export function percussive(param, t, peak, attack, decay, hold = 0) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(peak, t + attack);
  if (hold > 0) param.setValueAtTime(peak, t + attack + hold);
  param.exponentialRampToValueAtTime(FLOOR, t + attack + hold + decay);
}

// Exponential approach to a held level, then an exponential release.
export function swell(param, t, peak, attackTau, endTime, releaseTau) {
  param.setValueAtTime(0, t);
  param.setTargetAtTime(peak, t, attackTau);
  param.setTargetAtTime(0, endTime, releaseTau);
}

// Plucked or sustained note: linear attack, optional decay towards a sustain
// level, exponential release at the end of the note. Returns a safe stop time.
export function noteEnvelope(param, t, dur, { attack = 0.01, peak = 1, sustain = 1, decayTau = 0.1, release = 0.1 }) {
  param.setValueAtTime(0, t);
  param.linearRampToValueAtTime(peak, t + attack);
  if (sustain < 1) param.setTargetAtTime(peak * sustain, t + attack, decayTau);
  param.setTargetAtTime(0, t + Math.max(dur, attack), release);
  return t + Math.max(dur, attack) + release * 7;
}

export function sweep(param, t, from, to, duration) {
  param.setValueAtTime(from, t);
  param.exponentialRampToValueAtTime(to, t + duration);
}

export function glide(param, t, from, to, duration) {
  param.setValueAtTime(from, t);
  param.linearRampToValueAtTime(to, t + duration);
}

// Bright pulse wave with the given duty cycle (0..1) as a PeriodicWave.
export function createPulseWave(ctx, duty) {
  const partials = 96;
  const real = new Float32Array(partials);
  const imag = new Float32Array(partials);
  for (let n = 1; n < partials; n++) {
    const k = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    real[n] = k * Math.cos(n * Math.PI * duty);
    imag[n] = k * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

// ---- voices ----

const KILL_FADE = 0.05;

class Voice {
  constructor(toolkit, { name = '', group = 'sfx', dest, pan = 0, gain = 1, priority = 1 }) {
    this.toolkit = toolkit;
    this.ctx = toolkit.ctx;
    this.name = name;
    this.group = group;
    this.priority = priority;
    this.startTime = toolkit.now();
    this.endTime = this.startTime;
    this.nodes = [];
    this.sources = [];
    this.pending = 0;
    this.finished = false;
    this.killed = false;
    this.out = this.add(this.ctx.createGain());
    this.out.gain.value = gain;
    if (pan !== 0) {
      const panner = this.add(this.ctx.createStereoPanner());
      panner.pan.value = clamp(pan, -1, 1);
      this.out.connect(panner);
      panner.connect(dest);
    } else {
      this.out.connect(dest);
    }
  }

  get amp() {
    return this.out.gain;
  }

  add(node) {
    this.nodes.push(node);
    return node;
  }

  gain(value = 1) {
    const node = this.add(this.ctx.createGain());
    node.gain.value = value;
    return node;
  }

  filter(type, frequency, q = 0.7) {
    const node = this.add(this.ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  }

  panner(pan) {
    const node = this.add(this.ctx.createStereoPanner());
    node.pan.value = clamp(pan, -1, 1);
    return node;
  }

  osc(type, frequency, start, stop) {
    const node = this.ctx.createOscillator();
    if (typeof type === 'string') node.type = type;
    else node.setPeriodicWave(type);
    node.frequency.value = frequency;
    return this.source(node, start, stop);
  }

  noise(color, start, stop, offset) {
    const node = this.toolkit.noise.source(color);
    const at = offset ?? this.toolkit.rng.range(0, this.toolkit.noise.duration - 0.5);
    return this.source(node, start, stop, at);
  }

  source(node, start, stop, offset) {
    this.add(node);
    this.sources.push(node);
    this.pending++;
    node.onended = () => this.sourceEnded();
    if (offset === undefined) node.start(start);
    else node.start(start, offset);
    node.stop(stop);
    this.endTime = Math.max(this.endTime, stop);
    return node;
  }

  // Connects nodes in sequence and returns the last one.
  chain(...nodes) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  }

  sourceEnded() {
    this.pending--;
    if (this.pending <= 0) this.dispose();
  }

  // Fade out and stop quickly (used for voice stealing and scene changes).
  kill(when = this.toolkit.now()) {
    if (this.finished || this.killed) return;
    this.killed = true;
    const t = Math.max(when, this.toolkit.now());
    this.amp.cancelScheduledValues(t);
    this.amp.setTargetAtTime(0, t, 0.008);
    for (const source of this.sources) source.stop(t + KILL_FADE);
    this.endTime = t + KILL_FADE;
  }

  // Gentle release for sustained notes.
  release(when, tau) {
    if (this.finished || this.killed) return;
    this.killed = true;
    const t = Math.max(when, this.toolkit.now());
    this.amp.cancelScheduledValues(t);
    this.amp.setTargetAtTime(0, t, tau);
    const stopAt = t + tau * 7;
    for (const source of this.sources) source.stop(stopAt);
    this.endTime = stopAt;
  }

  dispose() {
    if (this.finished) return;
    this.finished = true;
    for (const node of this.nodes) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
    this.toolkit.forget(this);
  }
}

export function createToolkit({ ctx, noise, rng, now, limits = {} }) {
  const voices = new Set();
  const capacity = { sfx: 36, music: 72, ...limits };
  const stats = { created: 0, stolen: 0, peak: 0 };

  const toolkit = {
    ctx,
    noise,
    rng,
    now,
    stats,

    voice(options) {
      const group = options.group ?? 'sfx';
      if (toolkit.count(group) >= (capacity[group] ?? 48)) steal(group);
      const voice = new Voice(toolkit, options);
      voices.add(voice);
      stats.created++;
      stats.peak = Math.max(stats.peak, voices.size);
      return voice;
    },

    forget(voice) {
      voices.delete(voice);
    },

    count(group, name) {
      let n = 0;
      for (const v of voices) if ((!group || v.group === group) && (!name || v.name === name)) n++;
      return n;
    },

    // Safety net: drop voices whose sources never reported the end.
    sweep() {
      const t = now();
      for (const v of [...voices]) if (v.endTime + 0.5 < t) v.dispose();
    },

    killAll(group, when, fade) {
      for (const v of [...voices]) if (!group || v.group === group) fade ? v.release(when, fade) : v.kill(when);
    },

    each(group, fn) {
      for (const v of voices) if (v.group === group) fn(v);
    },

    stealOldest(group, name) {
      let victim = null;
      for (const v of voices) {
        if (v.group !== group || v.killed || (name && v.name !== name)) continue;
        if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.startTime < victim.startTime)) victim = v;
      }
      if (victim) {
        victim.kill();
        stats.stolen++;
      }
    },

    dispose() {
      for (const v of [...voices]) v.dispose();
    },
  };

  function steal(group) {
    toolkit.stealOldest(group);
  }

  return toolkit;
}
