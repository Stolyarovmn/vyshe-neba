// The whole sound machine bound to one audio context. Both the live engine and
// the offline renderer build one of these, so tests exercise the real thing.
//
// `now` is the clock used for scheduling: ctx.currentTime in the browser, a
// virtual clock while rendering offline.

import { createAmbience } from './ambience.js';
import { createEngine } from './engine.js';
import { IDLE_FRAME, normalizeFrame } from './frame.js';
import { createGraph } from './graph.js';
import { createMusic, deriveMusicTarget } from './music.js';
import { createNoiseBank } from './noise.js';
import { createRng } from './prng.js';
import { createSfx } from './sfx.js';
import { createToolkit } from './synth.js';
import { environmentFor } from './zones.js';

const CONTROL_INTERVAL = 1 / 30;

export function createCore({ ctx, seed = 1, now = () => ctx.currentTime, volumes, muted = false, offline = false }) {
  const rng = createRng(seed);
  const noise = createNoiseBank(ctx, rng.fork('noise'));
  const graph = createGraph(ctx, { rng: rng.fork('graph'), now });
  const toolkit = createToolkit({ ctx, noise, rng: rng.fork('voices'), now, offline });
  const engine = createEngine({ ctx, graph, noise, toolkit, rng: rng.fork('engine'), now });
  const ambience = createAmbience({ ctx, graph, noise, rng: rng.fork('ambience') });
  const music = createMusic({ ctx, graph, toolkit, now, seed: seed ^ 0x5eed });
  let environment = environmentFor(IDLE_FRAME);
  const sfx = createSfx({ ctx, graph, toolkit, rng: rng.fork('sfx'), now, getEnvironment: () => environment });

  let sinceControl = CONTROL_INTERVAL;
  let frame = normalizeFrame(IDLE_FRAME);

  if (volumes) graph.setVolumes(volumes, now());
  setMuted(muted);

  function setMuted(value) {
    graph.setMuted(value, now());
    music.setMuted(value);
  }

  function update(dt, input) {
    frame = normalizeFrame(input);
    const t = now();
    sinceControl += dt;
    if (sinceControl >= CONTROL_INTERVAL) {
      sinceControl = 0;
      applyWorld(t);
    }
    music.update(dt, frame, t);
    toolkit.sweep();
  }

  // Engine, wind, ambience and acoustics follow the frame at a modest rate.
  function applyWorld(t) {
    const scene = deriveMusicTarget(frame, music.get()).scene;
    environment = environmentFor(frame);
    graph.setEnvironment(environment, t);
    graph.setPaused(frame.paused, t);
    const flying = scene === 'flight';
    engine.apply(flying ? frame : { ...frame, phase: 'hub', throttle: 0, rcs: { left: 0, right: 0 } }, t);
    ambience.apply(frame, scene, t);
  }

  // Keep-alive for screens that do not call update() every frame.
  function tick() {
    music.tick(now());
    toolkit.sweep();
  }

  function dispose() {
    engine.dispose();
    ambience.dispose();
    music.dispose();
    toolkit.dispose();
    graph.dispose();
  }

  return {
    ctx,
    graph,
    toolkit,
    music,
    update,
    tick,
    dispose,
    setMuted,
    setVolumes: (v) => graph.setVolumes(v, now()),
    sfx: (name, params) => sfx.play(name, params),
    sfxStats: sfx.stats,
    stats: () => ({
      voices: toolkit.count(),
      sfxVoices: toolkit.count('sfx'),
      musicVoices: toolkit.count('music'),
      peakVoices: toolkit.stats.peak,
      stolen: toolkit.stats.stolen,
      music: music.info(),
      sfx: { ...sfx.stats },
    }),
  };
}
