// Looping noise buffers (white, pink, brown) generated from the engine's own
// seeded generator, so every render contains exactly the same noise.

import { clamp } from './util.js';

const LOOP_SECONDS = 4;
const SEAM_SECONDS = 0.06;
const TARGET_RMS = 0.25;

function generate(kind, length, rng) {
  const out = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, brown = 0;
  for (let i = 0; i < length; i++) {
    const white = rng.next() * 2 - 1;
    if (kind === 'white') {
      out[i] = white;
    } else if (kind === 'pink') {
      // Paul Kellet's economy filter.
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      out[i] = brown;
    }
  }
  return out;
}

// Blends the tail into the head with an equal-power fade so the loop has no click.
function makeSeamless(raw, length, seam) {
  const out = new Float32Array(length);
  out.set(raw.subarray(0, length));
  for (let i = 0; i < seam; i++) {
    const phase = (i / seam) * Math.PI * 0.5;
    out[i] = raw[i] * Math.sin(phase) + raw[length + i] * Math.cos(phase);
  }
  return out;
}

function normalise(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  const scale = TARGET_RMS / Math.sqrt(sum / data.length || 1);
  for (let i = 0; i < data.length; i++) data[i] = clamp(data[i] * scale, -1, 1);
}

export function createNoiseBank(ctx, rng) {
  const length = Math.floor(ctx.sampleRate * LOOP_SECONDS);
  const seam = Math.floor(ctx.sampleRate * SEAM_SECONDS);
  const buffers = {};
  for (const kind of ['white', 'pink', 'brown']) {
    const raw = generate(kind, length + seam, rng.fork(`noise-${kind}`));
    const data = makeSeamless(raw, length, seam);
    normalise(data);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    buffers[kind] = buffer;
  }
  return {
    duration: LOOP_SECONDS,
    buffer: (kind) => buffers[kind] ?? buffers.white,
    // A looping source; call start(when, offset) on the result.
    source(kind) {
      const node = ctx.createBufferSource();
      node.buffer = buffers[kind] ?? buffers.white;
      node.loop = true;
      return node;
    },
  };
}
