// The master signal graph: buses, reverb, echo, ducking, air absorption and a
// safe output stage that can never exceed the ceiling.
//
//   music  -> [reverb + echo] -> tone -> engine duck -> event duck -> volume --+
//   ui     -> volume ------------------------------------------------------+  |
//   world  -> air filter (altitude) -> [reverb] -> volume ---------------+  |  |
//   engine -> air filter ------------------------------------------------+  |  |
//                                                                           v  v
//   mix -> DC block -> glue compressor -> limiter -> soft ceiling -> master -> out

import { clamp, clamp01, lerp, volumeToGain } from './util.js';

// Output ceiling: -1.6 dBFS. The shaper below is the last word on peak level.
export const CEILING = 0.83;
const KNEE = 0.6;

const MUSIC_TRIM = 0.85;
const SFX_TRIM = 1;

// Gentle at low levels, saturating smoothly into the ceiling.
export function makeCeilingCurve(points = 4096) {
  const curve = new Float32Array(points);
  const room = CEILING - KNEE;
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= KNEE ? a : KNEE + room * Math.tanh((a - KNEE) / room);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

// Synthetic room: decaying noise that darkens with time, decorrelated per channel.
export function makeImpulse(ctx, rng, { seconds, decay, preDelay = 0.012, bright = 0.85, dark = 0.1 }) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    const stream = rng.fork(`impulse-${c}`);
    let lowpassed = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      if (t < preDelay) continue;
      const age = t - preDelay;
      const body = Math.exp((-age * 6.9) / decay);
      const bloom = Math.min(1, age / 0.05);
      const alpha = lerp(bright, dark, Math.min(1, age / decay));
      lowpassed += alpha * ((stream.next() * 2 - 1) - lowpassed);
      data[i] = lowpassed * body * Math.sqrt(bloom);
    }
  }
  return buffer;
}

export function createGraph(ctx, { rng, now }) {
  const nodes = [];
  const own = (node) => {
    nodes.push(node);
    return node;
  };
  const gain = (value = 1) => {
    const node = own(ctx.createGain());
    node.gain.value = value;
    return node;
  };
  const filter = (type, frequency, q = 0.7) => {
    const node = own(ctx.createBiquadFilter());
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  };
  const tau = (param, value, when, time) => param.setTargetAtTime(value, when, time);

  // ---- output stage ----
  const mix = gain(1);
  const dcBlock = filter('highpass', 24, 0.5);
  const glue = own(ctx.createDynamicsCompressor());
  glue.threshold.value = -20;
  glue.knee.value = 24;
  glue.ratio.value = 2.4;
  glue.attack.value = 0.02;
  glue.release.value = 0.28;
  const limiter = own(ctx.createDynamicsCompressor());
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  const ceiling = own(ctx.createWaveShaper());
  ceiling.curve = makeCeilingCurve();
  ceiling.oversample = '2x';
  const master = gain(1);
  mix.connect(dcBlock);
  dcBlock.connect(glue);
  glue.connect(limiter);
  limiter.connect(ceiling);
  ceiling.connect(master);
  master.connect(ctx.destination);

  let analyser = null;
  const getAnalyser = () => {
    if (!analyser && ctx.createAnalyser) {
      analyser = own(ctx.createAnalyser());
      analyser.fftSize = 1024;
      master.connect(analyser);
    }
    return analyser;
  };

  // ---- sound effects: ui, world (diegetic), engine ----
  const sfxVolume = gain(SFX_TRIM);
  sfxVolume.connect(mix);

  const uiIn = gain(1);
  uiIn.connect(sfxVolume);

  const airFilter = filter('lowpass', 18000, 0.5);
  const worldIn = gain(1);
  const engineIn = gain(1);
  worldIn.connect(airFilter);
  engineIn.connect(airFilter);
  airFilter.connect(sfxVolume);

  const worldConvolver = own(ctx.createConvolver());
  worldConvolver.buffer = makeImpulse(ctx, rng.fork('world-room'), { seconds: 2.4, decay: 2.1 });
  const worldReverbSend = gain(0.2);
  const uiReverbSend = gain(0.16);
  const worldReverbReturn = gain(0.9);
  const reverbIn = gain(1);
  reverbIn.connect(worldConvolver);
  const worldWetAir = filter('lowpass', 18000, 0.5);
  const worldWetIn = gain(1);
  worldWetIn.connect(worldWetAir);
  worldWetAir.connect(worldConvolver);
  airFilter.connect(worldReverbSend);
  worldReverbSend.connect(worldConvolver);
  uiIn.connect(uiReverbSend);
  uiReverbSend.connect(worldConvolver);
  worldConvolver.connect(worldReverbReturn);
  worldReverbReturn.connect(sfxVolume);

  // ---- music ----
  const musicTone = filter('lowpass', 9000, 0.5);
  const musicEngineDuck = gain(1);
  const musicEventDuck = gain(1);
  const musicVolume = gain(MUSIC_TRIM);
  musicTone.connect(musicEngineDuck);
  musicEngineDuck.connect(musicEventDuck);
  musicEventDuck.connect(musicVolume);
  musicVolume.connect(mix);

  const musicIn = gain(1);
  musicIn.connect(musicTone);

  const musicConvolver = own(ctx.createConvolver());
  musicConvolver.buffer = makeImpulse(ctx, rng.fork('music-hall'), { seconds: 2.2, decay: 1.9, bright: 0.7, dark: 0.07 });
  const musicReverbSend = gain(1);
  const musicReverbReturn = gain(0.8);
  musicReverbSend.connect(musicConvolver);
  musicConvolver.connect(musicReverbReturn);
  musicReverbReturn.connect(musicTone);

  // Ping-pong echo: left tap feeds the right tap, which feeds back to the left.
  const echoIn = gain(1);
  const echoHigh = filter('highpass', 220, 0.5);
  const echoLeft = own(ctx.createDelay(3));
  const echoRight = own(ctx.createDelay(3));
  const echoDarkL = filter('lowpass', 3600, 0.5);
  const echoDarkR = filter('lowpass', 3200, 0.5);
  const echoFeedL = gain(0.38);
  const echoFeedR = gain(0.38);
  const echoPanL = own(ctx.createStereoPanner());
  const echoPanR = own(ctx.createStereoPanner());
  echoPanL.pan.value = -0.65;
  echoPanR.pan.value = 0.65;
  const echoReturn = gain(0.75);
  echoLeft.delayTime.value = 0.4;
  echoRight.delayTime.value = 0.4;
  echoIn.connect(echoHigh);
  echoHigh.connect(echoLeft);
  echoLeft.connect(echoDarkL);
  echoDarkL.connect(echoPanL);
  echoPanL.connect(echoReturn);
  echoDarkL.connect(echoFeedL);
  echoFeedL.connect(echoRight);
  echoRight.connect(echoDarkR);
  echoDarkR.connect(echoPanR);
  echoPanR.connect(echoReturn);
  echoDarkR.connect(echoFeedR);
  echoFeedR.connect(echoLeft);
  echoReturn.connect(musicTone);

  // ---- control surface ----
  let duck = { depth: 1, until: 0 };

  const graph = {
    ctx,
    buses: { ui: uiIn, world: worldIn, engine: engineIn, music: musicIn, reverb: reverbIn, worldWet: worldWetIn },
    sends: { musicReverb: musicReverbSend, musicEcho: echoIn },
    getAnalyser,
    master,

    setVolumes({ master: m, music, sfx }, when = now()) {
      if (m !== undefined) tau(master.gain, graph.muted ? 0 : volumeToGain(m), when, 0.03);
      if (music !== undefined) tau(musicVolume.gain, volumeToGain(music) * MUSIC_TRIM, when, 0.05);
      if (sfx !== undefined) tau(sfxVolume.gain, volumeToGain(sfx) * SFX_TRIM, when, 0.05);
      graph.volumes = { ...graph.volumes, ...definedOnly({ master: m, music, sfx }) };
    },

    setMuted(muted, when = now()) {
      graph.muted = Boolean(muted);
      tau(master.gain, graph.muted ? 0 : volumeToGain(graph.volumes.master), when, 0.03);
    },

    // Altitude-dependent acoustics: thin air swallows highs and carries echoes.
    setEnvironment({ airCutoff, worldReverb }, when = now()) {
      tau(airFilter.frequency, clamp(airCutoff, 200, 20000), when, 0.3);
      tau(worldWetAir.frequency, clamp(airCutoff, 200, 20000), when, 0.3);
      tau(worldReverbSend.gain, clamp01(worldReverb), when, 0.4);
    },

    setMusicSpace({ cutoff, reverb, echoTime, echoFeedback }, when = now()) {
      if (cutoff !== undefined) tau(musicTone.frequency, clamp(cutoff, 200, 20000), when, 0.6);
      if (reverb !== undefined) tau(musicReverbSend.gain, clamp01(reverb) * 1.4, when, 0.5);
      if (echoTime !== undefined) {
        tau(echoLeft.delayTime, clamp(echoTime, 0.05, 2.9), when, 0.35);
        tau(echoRight.delayTime, clamp(echoTime, 0.05, 2.9), when, 0.35);
      }
      if (echoFeedback !== undefined) {
        tau(echoFeedL.gain, clamp(echoFeedback, 0, 0.7), when, 0.3);
        tau(echoFeedR.gain, clamp(echoFeedback, 0, 0.7), when, 0.3);
      }
    },

    // Continuous ducking from the engine (sidechain feel without a sidechain).
    setEngineDuck(amount, when = now()) {
      tau(musicEngineDuck.gain, lerp(1, 0.8, clamp01(amount)), when, 0.25);
    },

    // Event ducking: dip the music quickly, hold, then let it back up.
    duckMusic({ depth = 0.5, hold = 0.2, release = 0.6 }, when = now()) {
      const active = duck.until > when;
      const nextDepth = active ? Math.min(duck.depth, depth) : depth;
      const until = Math.max(active ? duck.until : 0, when + hold);
      duck = { depth: nextDepth, until };
      const g = musicEventDuck.gain;
      g.cancelScheduledValues(when);
      g.setTargetAtTime(nextDepth, when, 0.025);
      g.setTargetAtTime(1, until, release / 3);
    },

    nodeCount: () => nodes.length,

    dispose() {
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      }
    },
  };

  graph.volumes = { master: 0.8, music: 0.6, sfx: 0.9 };
  graph.muted = false;
  master.gain.value = volumeToGain(graph.volumes.master);
  musicVolume.gain.value = volumeToGain(graph.volumes.music) * MUSIC_TRIM;
  sfxVolume.gain.value = volumeToGain(graph.volumes.sfx) * SFX_TRIM;
  return graph;
}

function definedOnly(object) {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== undefined));
}

