// Island ambience: slow waves and a light breeze while the rocket sits on Earth
// (hub screen and launch pad). It fades away as the rocket climbs.

import { clamp01, smoothstep } from './util.js';

export function mapAmbience(frame, scene) {
  if (frame.paused || frame.body !== 'earth') return { level: 0 };
  if (scene === 'hub') return { level: 1 };
  if (scene === 'flight' && frame.phase === 'pad') return { level: 1 - smoothstep(0, 0.02, frame.alt01) };
  return { level: 0 };
}

export function createAmbience({ ctx, graph, noise, rng }) {
  const nodes = [];
  const sources = [];
  const keep = (node) => {
    nodes.push(node);
    return node;
  };
  const gain = (value) => {
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
  const loop = (color) => {
    const node = keep(noise.source(color));
    node.start(0, rng.range(0, noise.duration - 0.5));
    sources.push(node);
    return node;
  };
  const lfo = (rate) => {
    const node = keep(ctx.createOscillator());
    node.frequency.value = rate;
    node.start(0);
    sources.push(node);
    return node;
  };
  const chain = (...list) => {
    for (let i = 0; i < list.length - 1; i++) list[i].connect(list[i + 1]);
  };

  const master = gain(0);
  master.connect(graph.buses.world);

  // Wave body: brown noise whose brightness and loudness swell together.
  const surf = filter('lowpass', 500, 0.5);
  const surfGain = gain(0.2);
  const swellA = lfo(0.11);
  const swellB = lfo(0.067);
  const swellDepth = gain(0.16);
  const brightDepth = gain(380);
  chain(swellA, swellDepth, surfGain.gain);
  chain(swellB, swellDepth);
  chain(swellA, brightDepth, surf.frequency);
  chain(loop('brown'), surf, surfGain, master);

  // Foam hiss rides the crest of each wave.
  const foam = filter('bandpass', 3400, 0.5);
  const foamGain = gain(0.03);
  const foamDepth = gain(0.025);
  chain(swellA, foamDepth, foamGain.gain);
  chain(loop('pink'), filter('highpass', 1800, 0.5), foam, foamGain, master);

  // Breeze.
  const breezeBand = filter('bandpass', 520, 0.5);
  const breezeGain = gain(0.05);
  const gust = lfo(0.15);
  const gustDepth = gain(0.03);
  chain(gust, gustDepth, breezeGain.gain);
  chain(loop('pink'), breezeBand, breezeGain, master);

  let first = true;
  let last = -1;
  function apply(frame, scene, when) {
    const { level } = mapAmbience(frame, scene);
    if (Math.abs(level - last) < 0.002) return;
    last = level;
    if (first) master.gain.setValueAtTime(clamp01(level) * 0.55, when);
    else master.gain.setTargetAtTime(clamp01(level) * 0.55, when, 1.2);
    first = false;
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

  return { apply, dispose };
}
