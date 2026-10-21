// Generative music: turns game state into a planner target, plays the planner's
// notes through the instruments and cross-fades the layers.
//
// The pure part (deriveMusicTarget) is testable in Node; createMusic needs a
// Web Audio context.

import { createInstruments } from './instruments.js';
import { createPlanner } from './planner.js';
import { clamp01, smoothstep } from './util.js';
import { normalizeZone, zoneForFrame } from './zones.js';
import { SCENES } from './names.js';

export const LOOKAHEAD = 0.4;
const CONTROL_INTERVAL = 0.05;

const PHASE_INTENSITY = {
  hub: 0.25,
  pad: 0.3,
  ascent: 0.45,
  space: 0.35,
  transfer: 0.5,
  descent: 0.55,
  landed: 0.2,
  crashed: 0.1,
};
const BURNING_PHASES = new Set(['pad', 'ascent', 'space', 'transfer', 'descent']);

function autoIntensity(frame, scene) {
  if (scene === 'hub') return 0.25;
  if (scene === 'results') return 0.3;
  const base = PHASE_INTENSITY[frame.phase] ?? 0.4;
  return clamp01(base + 0.25 * frame.throttle + 0.2 * frame.speed01);
}

// Explicit values from music.set() win over what the frame suggests.
export function deriveMusicTarget(frame, explicit = {}) {
  const scene = SCENES.includes(explicit.scene) ? explicit.scene : frame.phase === 'hub' ? 'hub' : 'flight';
  const flight = scene === 'flight';
  const base = Number.isFinite(explicit.intensity) ? explicit.intensity : autoIntensity(frame, scene);
  const lowFuel = BURNING_PHASES.has(frame.phase) ? 1 - smoothstep(0.08, 0.25, frame.fuel01) : 0;
  return {
    scene,
    zone: normalizeZone(explicit.zone) ?? zoneForFrame(frame),
    mood: explicit.mood === 'fail' ? 'fail' : 'win',
    intensity: clamp01(base + (flight ? 0.4 * frame.danger01 : 0)),
    tension: flight ? Math.max(frame.danger01, lowFuel) : 0,
    speed01: frame.speed01,
    alt01: frame.alt01,
    paused: frame.paused,
  };
}

// Two short modulated delays panned apart: the classic string-machine chorus.
function buildChorus(ctx, own, lfos) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  dry.gain.value = 0.7;
  input.connect(dry);
  dry.connect(output);
  own.push(input, output, dry);
  [[0.31, 0.018, -0.7], [0.23, 0.024, 0.7]].forEach(([rate, base, pan]) => {
    const delay = ctx.createDelay(0.06);
    delay.delayTime.value = base;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rate;
    const depth = ctx.createGain();
    depth.gain.value = 0.004;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    lfo.connect(depth);
    depth.connect(delay.delayTime);
    input.connect(delay);
    delay.connect(panner);
    panner.connect(wet);
    wet.connect(output);
    lfo.start(0);
    own.push(delay, lfo, depth, panner, wet);
    lfos.push(lfo);
  });
  return { input, output };
}

export function createMusic({ ctx, graph, toolkit, now, seed }) {
  const planner = createPlanner({ seed });
  const explicit = { scene: null, zone: null, mood: null, intensity: null };
  const stats = { events: 0, errors: 0, lastError: null };
  const own = [];
  const oscillators = [];

  const gain = (value = 1) => {
    const node = ctx.createGain();
    node.gain.value = value;
    own.push(node);
    return node;
  };
  const connect = (from, to) => from.connect(to);

  // ---- layer buses ----
  const out = graph.buses.music;
  const reverb = graph.sends.musicReverb;
  const echo = graph.sends.musicEcho;

  const layer = (reverbAmount, echoAmount, insert) => {
    const input = gain(1);
    const level = gain(0);
    if (insert) {
      connect(input, insert.input);
      connect(insert.output, level);
    } else {
      connect(input, level);
    }
    connect(level, out);
    const sends = {};
    if (reverbAmount) {
      sends.reverb = gain(reverbAmount);
      connect(level, sends.reverb);
      connect(sends.reverb, reverb);
    }
    if (echoAmount) {
      sends.echo = gain(echoAmount);
      connect(level, sends.echo);
      connect(sends.echo, echo);
    }
    return { input, level, sends };
  };

  // The pad passes through chorus and a gain that dips on every kick.
  const chorus = buildChorus(ctx, own, oscillators);
  const padDuck = gain(1);
  connect(chorus.output, padDuck);

  const layers = {
    pad: layer(0.4, 0, { input: chorus.input, output: padDuck }),
    bass: layer(0, 0),
    arp: layer(0.3, 0.6),
    lead: layer(0.35, 0.7),
    drum: layer(0.1, 0),
    fx: layer(0.5, 0),
    heart: layer(0.1, 0),
  };

  // Snare and clap get an extra helping of reverb, 80s style.
  const snareIn = gain(1);
  const snareReverb = gain(0.32);
  connect(snareIn, layers.drum.input);
  connect(snareIn, snareReverb);
  connect(snareReverb, reverb);

  const instruments = createInstruments({
    ctx,
    toolkit,
    dest: {
      pad: layers.pad.input,
      bass: layers.bass.input,
      arp: layers.arp.input,
      lead: layers.lead.input,
      drum: layers.drum.input,
      snare: snareIn,
      fx: layers.fx.input,
      heart: layers.heart.input,
    },
  });

  // ---- playing ----
  let muted = false;
  let sinceControl = CONTROL_INTERVAL;
  let percLevel = 0;

  function duckPad(t) {
    const depth = 1 - 0.3 * Math.min(1, percLevel * 1.4);
    padDuck.gain.cancelScheduledValues(t);
    padDuck.gain.setTargetAtTime(depth, t, 0.01);
    padDuck.gain.setTargetAtTime(1, t + 0.05, 0.1);
  }

  function handle(e) {
    if (e.layer === 'ctl') {
      toolkit.each('music', (v) => {
        if (v.name === 'pad' || v.name === 'lead') v.release(e.t, 0.3);
      });
      return;
    }
    if (e.layer === 'drum' && e.kind === 'kick') duckPad(e.t);
    instruments.play(e);
    stats.events++;
  }

  function tick(t = now()) {
    if (muted) return;
    const events = planner.plan(t, t + LOOKAHEAD);
    for (const e of events) {
      try {
        handle(e);
      } catch (error) {
        stats.errors++;
        stats.lastError = String(error?.stack ?? error);
      }
    }
  }

  function applyMix(t) {
    const mix = planner.mix();
    if (!mix) return;
    const info = planner.info();
    const smooth = (param, value, tau) => param.setTargetAtTime(value, t, tau);
    smooth(layers.pad.level.gain, mix.pad, 0.6);
    smooth(layers.bass.level.gain, mix.bass, 0.6);
    smooth(layers.arp.level.gain, mix.arp, 0.6);
    smooth(layers.lead.level.gain, mix.lead, 0.6);
    smooth(layers.drum.level.gain, mix.perc, 0.5);
    smooth(layers.fx.level.gain, 0.8, 0.5);
    smooth(layers.heart.level.gain, mix.heart * 0.9, 0.15);
    percLevel = mix.perc;
    const fxBeat = planner.profileFx();
    if (fxBeat) {
      graph.setMusicSpace(
        {
          cutoff: mix.cutoff,
          reverb: mix.reverb,
          echoTime: (fxBeat.delayBeats * 60) / info.bpm,
          echoFeedback: fxBeat.delayFeedback,
        },
        t,
      );
      smooth(layers.arp.sends.echo.gain, fxBeat.delaySend, 0.5);
      smooth(layers.lead.sends.echo.gain, fxBeat.delaySend * 1.15, 0.5);
    }
  }

  function update(dt, frame, t = now()) {
    planner.setTarget(deriveMusicTarget(frame, explicit));
    planner.advance(dt);
    sinceControl += dt;
    if (sinceControl >= CONTROL_INTERVAL) {
      sinceControl = 0;
      applyMix(t);
    }
    tick(t);
  }

  function set(partial = {}) {
    for (const key of Object.keys(explicit)) {
      if (partial[key] !== undefined) explicit[key] = partial[key];
    }
  }

  function dispose() {
    for (const osc of oscillators) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
    }
    for (const node of own) {
      try {
        node.disconnect();
      } catch {
        // ignore
      }
    }
  }

  return {
    update,
    tick,
    set,
    get: () => ({ ...explicit }),
    setMuted: (value) => {
      muted = Boolean(value);
      if (!muted) planner.reset();
    },
    info: () => ({ ...planner.info(), ...stats }),
    stats,
    dispose,
  };
}
