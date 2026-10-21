// Musical material: scales, chord shapes and one profile per scene or zone.
// Pure data. The planner turns it into timed notes, the player into sound.

import { ZONES } from './names.js';

//
// Pattern strings have 16 characters, one per sixteenth note of a 4/4 bar.
//   drums/arp: 'X' accent, 'x' normal, 'o' soft, '.' rest
//   bass:      'R' root, 'r' root one octave up, '5' fifth, '3' third, '7' seventh,
//              'c' random chord tone, '.' rest
// A list of { tier, p } picks the densest pattern whose tier is not above the
// current intensity, so a layer thickens as the flight gets hotter.

export const SCALES = Object.freeze({
  lydian: [0, 2, 4, 6, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
});

export const CHORD_SHAPES = Object.freeze({
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  pow: [0, 7, 12],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  sus4_7: [0, 5, 7, 10],
  m7b5: [0, 3, 6, 10],
  add9: [0, 4, 7, 14],
  maj9: [0, 4, 7, 11, 14],
  min9: [0, 3, 7, 10, 14],
  maj7s11: [0, 4, 7, 11, 18],
});

const ch = (r, q) => ({ r, q });

// Rhythms for melodic phrases: [startStep, lengthInSteps] inside one bar.
export const MOTIFS = Object.freeze({
  bright: [
    [[0, 3], [3, 1], [4, 4], [8, 4], [12, 4]],
    [[0, 4], [6, 2], [8, 3], [11, 1], [12, 4]],
    [[2, 2], [4, 2], [6, 2], [8, 6]],
    [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4]],
    [[0, 6], [8, 2], [10, 2], [12, 4]],
  ],
  slow: [
    [[0, 8], [8, 8]],
    [[0, 6], [8, 4], [12, 4]],
    [[4, 8], [12, 4]],
    [[0, 4], [8, 8]],
  ],
});

const NO_DRUMS = {};

const RAW_PROFILES = {
  hub: {
    bpm: 78,
    swing: 0,
    root: 50, // D
    scale: SCALES.lydian,
    chordBars: 2,
    sections: [
      [ch(0, 'maj9'), ch(9, 'min9'), ch(5, 'maj9'), ch(7, 'sus4_7')],
      [ch(2, 'min9'), ch(7, 'sus4_7'), ch(5, 'maj9'), ch(0, 'add9')],
    ],
    padCenter: 62,
    pad: { patch: 'warm', vel: 0.8 },
    bass: { patch: 'sub', register: 34, gate: 0.9, pattern: [{ tier: 0, p: 'R.......R.....5.' }] },
    arp: {
      patch: 'ep', mode: 'broken', range: [62, 86], gate: 0.9, density: 0.9,
      steps: [{ tier: 0, p: 'x.x.x.x.x.x.x.x.' }, { tier: 0.7, p: 'x.xox.xox.xox.xo' }],
    },
    lead: { patch: 'soft', motifs: 'bright', range: [69, 90], bars: [1, 1, 0, 1], vel: 0.75 },
    drums: {
      kick: [{ tier: 0.5, p: 'X.......x.......' }],
      shaker: [{ tier: 0.3, p: 'o.o.o.o.o.o.o.o.' }],
      rim: [{ tier: 0.6, p: '....o.......o...' }],
    },
    gates: { bass: [0.05, 0.3], arp: [0, 0.25], lead: [0.25, 0.55], perc: [0.35, 0.65] },
    levels: { pad: 0.9, bass: 0.7, arp: 0.7, lead: 0.62, perc: 0.5 },
    fx: { delayBeats: 0.75, delayFeedback: 0.36, delaySend: 0.38, reverb: 0.42 },
    tone: 7500,
  },

  ground: {
    bpm: 104,
    swing: 0,
    root: 45, // A
    scale: SCALES.aeolian,
    chordBars: 1,
    sections: [
      [ch(0, 'min9'), ch(8, 'maj7'), ch(3, 'add9'), ch(10, 'maj')],
      [ch(5, 'min7'), ch(8, 'maj7'), ch(7, 'min7'), ch(0, 'min')],
    ],
    padCenter: 60,
    pad: { patch: 'saw', vel: 0.65 },
    bass: {
      patch: 'saw', register: 33, gate: 0.55,
      pattern: [{ tier: 0, p: 'R.......R.......' }, { tier: 0.25, p: 'R.R.r.R.R.R.r.R.' }, { tier: 0.7, p: 'RrRrRrRrRrRrRrRr' }],
    },
    arp: {
      patch: 'pulse', mode: 'updown', range: [57, 84], gate: 0.5, density: 0.95,
      steps: [{ tier: 0, p: 'x.x.x.x.x.x.x.x.' }, { tier: 0.6, p: 'xxxxxxxxxxxxxxxx' }],
    },
    lead: { patch: 'saw', motifs: 'bright', range: [69, 93], bars: [1, 0, 1, 1], vel: 0.7 },
    drums: {
      kick: [{ tier: 0.35, p: 'x...x...x...x...' }, { tier: 0.8, p: 'X..ox..xX..ox...' }],
      snare: [{ tier: 0.55, p: '....x.......x...' }],
      clap: [{ tier: 0.75, p: '....x.......x...' }],
      hat: [{ tier: 0.2, p: 'x.o.x.o.x.o.x.o.' }, { tier: 0.75, p: 'xoxoxoxoxoxoxoxo' }],
      ohat: [{ tier: 0.5, p: '..x...x...x...x.' }],
    },
    gates: { bass: [0.12, 0.3], arp: [0.2, 0.45], lead: [0.55, 0.8], perc: [0.3, 0.55] },
    levels: { pad: 0.7, bass: 0.9, arp: 0.62, lead: 0.55, perc: 0.85 },
    fx: { delayBeats: 0.75, delayFeedback: 0.34, delaySend: 0.3, reverb: 0.3 },
    tone: 9000,
  },

  troposphere: {
    bpm: 112,
    swing: 0,
    root: 50, // D
    scale: SCALES.mixolydian,
    chordBars: 1,
    sections: [
      [ch(0, 'maj'), ch(10, 'maj'), ch(5, 'add9'), ch(0, 'maj')],
      [ch(9, 'min7'), ch(5, 'maj7'), ch(0, 'maj'), ch(7, 'sus4')],
    ],
    padCenter: 63,
    pad: { patch: 'warm', vel: 0.7 },
    bass: {
      patch: 'saw', register: 34, gate: 0.6,
      pattern: [{ tier: 0, p: 'R.......R.....5.' }, { tier: 0.25, p: 'R.rR.rR.R.rR.rR.' }, { tier: 0.7, p: 'R.rRRrR.R.rRRr5.' }],
    },
    arp: {
      patch: 'pluck', mode: 'updown', range: [62, 90], gate: 0.7, density: 0.95,
      steps: [{ tier: 0, p: 'x.x.x.x.x.x.x.x.' }, { tier: 0.65, p: 'xoxoxoxoxoxoxoxo' }],
    },
    lead: { patch: 'saw', motifs: 'bright', range: [71, 95], bars: [1, 1, 1, 0], vel: 0.72 },
    drums: {
      kick: [{ tier: 0.3, p: 'x...x...x...x...' }, { tier: 0.75, p: 'X..ox..xX..ox..o' }],
      snare: [{ tier: 0.5, p: '....x.......x...' }],
      clap: [{ tier: 0.7, p: '....x.......x...' }],
      hat: [{ tier: 0.2, p: 'x.o.x.o.x.o.x.o.' }, { tier: 0.7, p: 'xoxoxoxoxoxoxoxo' }],
      ohat: [{ tier: 0.45, p: '..x...x...x...x.' }],
      shaker: [{ tier: 0.6, p: 'oooooooooooooooo' }],
    },
    gates: { bass: [0.1, 0.28], arp: [0.15, 0.4], lead: [0.45, 0.75], perc: [0.28, 0.5] },
    levels: { pad: 0.7, bass: 0.9, arp: 0.7, lead: 0.62, perc: 0.85 },
    fx: { delayBeats: 0.75, delayFeedback: 0.36, delaySend: 0.34, reverb: 0.34 },
    tone: 11000,
  },

  stratosphere: {
    bpm: 96,
    swing: 0,
    root: 53, // F
    scale: SCALES.lydian,
    chordBars: 2,
    sections: [
      [ch(0, 'maj9'), ch(2, 'add9'), ch(4, 'min7'), ch(7, 'maj9')],
      [ch(9, 'min9'), ch(2, 'sus2'), ch(7, 'maj9'), ch(0, 'maj7s11')],
    ],
    padCenter: 64,
    pad: { patch: 'warm', vel: 0.8 },
    bass: { patch: 'sub', register: 33, gate: 0.85, pattern: [{ tier: 0, p: 'R.......R.......' }, { tier: 0.4, p: 'R.....R.R.....5.' }] },
    arp: {
      patch: 'bell', mode: 'skip', range: [65, 96], gate: 1, density: 0.85,
      steps: [{ tier: 0, p: 'x...x...x...x...' }, { tier: 0.35, p: 'x.x.x.x.x.x.x.x.' }, { tier: 0.75, p: 'x.xox.xox.xox.xo' }],
    },
    lead: { patch: 'soft', motifs: 'bright', range: [72, 96], bars: [1, 1, 0, 1], vel: 0.75 },
    drums: {
      kick: [{ tier: 0.4, p: 'X.......x.......' }, { tier: 0.75, p: 'x...x...x...x...' }],
      snare: [{ tier: 0.6, p: '............x...' }],
      hat: [{ tier: 0.35, p: 'x.o.x.o.x.o.x.o.' }],
      shaker: [{ tier: 0.3, p: 'o.o.o.o.o.o.o.o.' }],
    },
    gates: { bass: [0.08, 0.3], arp: [0.05, 0.3], lead: [0.35, 0.65], perc: [0.4, 0.65] },
    levels: { pad: 0.9, bass: 0.75, arp: 0.7, lead: 0.62, perc: 0.7 },
    fx: { delayBeats: 0.75, delayFeedback: 0.42, delaySend: 0.42, reverb: 0.5 },
    tone: 9500,
  },

  space: {
    bpm: 72,
    swing: 0,
    root: 45, // A
    scale: SCALES.aeolian,
    chordBars: 2,
    sections: [
      [ch(0, 'sus2'), ch(8, 'maj7s11'), ch(3, 'add9'), ch(7, 'min7')],
      [ch(0, 'min9'), ch(5, 'sus2'), ch(8, 'maj9'), ch(10, 'sus2')],
    ],
    padCenter: 64,
    pad: { patch: 'airy', vel: 0.9 },
    bass: { patch: 'sub', register: 31, gate: 1.8, pattern: [{ tier: 0, p: 'R...............' }, { tier: 0.5, p: 'R.......R.....5.' }] },
    arp: {
      patch: 'glass', mode: 'rand', range: [69, 100], gate: 1.4, density: 0.55,
      steps: [{ tier: 0, p: 'x.......x.......' }, { tier: 0.35, p: 'x.....x...x.....' }, { tier: 0.7, p: 'x...x...x...x...' }],
    },
    lead: { patch: 'glass', motifs: 'slow', range: [69, 93], bars: [0, 1, 0, 1], vel: 0.65 },
    drums: {
      kick: [{ tier: 0.5, p: 'x...............' }, { tier: 0.85, p: 'x.......x.......' }],
      shaker: [{ tier: 0.55, p: 'o...o...o...o...' }],
      hat: [{ tier: 0.8, p: '....o.......o...' }],
    },
    gates: { bass: [0.05, 0.25], arp: [0.05, 0.3], lead: [0.4, 0.7], perc: [0.5, 0.8] },
    levels: { pad: 1, bass: 0.75, arp: 0.62, lead: 0.55, perc: 0.55 },
    fx: { delayBeats: 1.5, delayFeedback: 0.5, delaySend: 0.5, reverb: 0.65 },
    tone: 8000,
  },

  moon: {
    bpm: 66,
    swing: 0,
    root: 52, // E
    scale: SCALES.phrygian,
    chordBars: 2,
    sections: [
      [ch(0, 'min9'), ch(1, 'maj7'), ch(8, 'maj7'), ch(7, 'm7b5')],
      [ch(0, 'sus2'), ch(10, 'sus2'), ch(1, 'maj7s11'), ch(0, 'min7')],
    ],
    padCenter: 66,
    pad: { patch: 'cold', vel: 0.85 },
    bass: { patch: 'sub', register: 34, gate: 1.6, pattern: [{ tier: 0, p: 'R...............' }, { tier: 0.5, p: 'R.....R.........' }] },
    arp: {
      patch: 'glass', mode: 'rand', range: [76, 103], gate: 1.2, density: 0.5,
      steps: [{ tier: 0, p: '..x.......x.....' }, { tier: 0.45, p: 'x.....x...x...x.' }],
    },
    lead: { patch: 'bell', motifs: 'slow', range: [72, 96], bars: [0, 1, 0, 0], vel: 0.6 },
    drums: {
      kick: [{ tier: 0.4, p: 'x....x..........' }, { tier: 0.8, p: 'x....x..x.......' }],
      rim: [{ tier: 0.6, p: '............o...' }],
      shaker: [{ tier: 0.7, p: 'o...o...o...o...' }],
    },
    gates: { bass: [0.05, 0.25], arp: [0.1, 0.4], lead: [0.45, 0.75], perc: [0.45, 0.75] },
    levels: { pad: 1, bass: 0.7, arp: 0.6, lead: 0.5, perc: 0.6 },
    fx: { delayBeats: 1.5, delayFeedback: 0.5, delaySend: 0.5, reverb: 0.7 },
    tone: 6500,
  },

  mars: {
    bpm: 90,
    swing: 0.04,
    root: 50, // D
    scale: SCALES.phrygianDominant,
    chordBars: 1,
    sections: [
      [ch(0, 'maj'), ch(1, 'maj'), ch(0, 'maj'), ch(10, 'min')],
      [ch(0, 'pow'), ch(8, 'maj'), ch(7, 'min'), ch(1, 'maj')],
    ],
    padCenter: 58,
    pad: { patch: 'dark', vel: 0.7 },
    bass: {
      patch: 'pulse', register: 33, gate: 0.5,
      pattern: [{ tier: 0, p: 'R.......R.......' }, { tier: 0.25, p: 'R..R..R.R..R..R.' }, { tier: 0.7, p: 'R.RR.RR.R.RR.R5.' }],
    },
    arp: {
      patch: 'pulse', mode: 'skip', range: [57, 84], gate: 0.45, density: 0.9,
      steps: [{ tier: 0.1, p: 'x..x..x.x..x..x.' }, { tier: 0.6, p: 'x.xx.xx.x.xx.xx.' }],
    },
    lead: { patch: 'saw', motifs: 'bright', range: [66, 90], bars: [0, 1, 1, 1], vel: 0.65 },
    drums: {
      tom: [{ tier: 0.2, p: 'x..x..x.x..x..x.' }],
      kick: [{ tier: 0.45, p: 'X.......x.......' }, { tier: 0.8, p: 'X..o..x.X..o..x.' }],
      snare: [{ tier: 0.6, p: '............x...' }],
      hat: [{ tier: 0.4, p: 'x.o.x.o.x.o.x.o.' }],
      shaker: [{ tier: 0.3, p: 'o.oo.oo.o.oo.oo.' }],
    },
    gates: { bass: [0.08, 0.25], arp: [0.2, 0.45], lead: [0.55, 0.8], perc: [0.15, 0.4] },
    levels: { pad: 0.75, bass: 0.9, arp: 0.6, lead: 0.5, perc: 0.9 },
    fx: { delayBeats: 0.75, delayFeedback: 0.38, delaySend: 0.3, reverb: 0.35 },
    tone: 7000,
  },

  results: {
    bpm: 88,
    swing: 0,
    root: 48, // C
    scale: SCALES.lydian,
    chordBars: 2,
    sections: [
      [ch(0, 'maj9'), ch(4, 'min7'), ch(5, 'maj9'), ch(7, 'sus4_7')],
      [ch(9, 'min9'), ch(5, 'maj9'), ch(0, 'maj7'), ch(7, 'sus4')],
    ],
    padCenter: 63,
    pad: { patch: 'warm', vel: 0.8 },
    bass: { patch: 'sub', register: 34, gate: 0.9, pattern: [{ tier: 0, p: 'R.......R.....5.' }] },
    arp: {
      patch: 'ep', mode: 'broken', range: [64, 88], gate: 0.9, density: 0.9,
      steps: [{ tier: 0, p: 'x.x.x.x.x.x.x.x.' }],
    },
    lead: { patch: 'soft', motifs: 'bright', range: [72, 93], bars: [1, 1, 0, 1], vel: 0.75 },
    drums: {
      kick: [{ tier: 0.6, p: 'X.......x.......' }],
      shaker: [{ tier: 0.4, p: 'o.o.o.o.o.o.o.o.' }],
    },
    gates: { bass: [0, 0.2], arp: [0, 0.2], lead: [0.1, 0.4], perc: [0.45, 0.75] },
    levels: { pad: 0.95, bass: 0.7, arp: 0.7, lead: 0.7, perc: 0.5 },
    fx: { delayBeats: 0.75, delayFeedback: 0.38, delaySend: 0.4, reverb: 0.5 },
    tone: 8500,
  },

  'results-fail': {
    bpm: 60,
    swing: 0,
    root: 45, // A
    scale: SCALES.aeolian,
    chordBars: 2,
    sections: [
      [ch(0, 'min9'), ch(8, 'maj7'), ch(5, 'min9'), ch(7, 'sus4_7')],
      [ch(0, 'min7'), ch(10, 'maj'), ch(8, 'maj7'), ch(7, 'dom7')],
    ],
    padCenter: 60,
    pad: { patch: 'cold', vel: 0.85 },
    bass: { patch: 'sub', register: 33, gate: 1.8, pattern: [{ tier: 0, p: 'R...............' }] },
    arp: { patch: 'glass', mode: 'rand', range: [69, 96], gate: 1.2, density: 0.5, steps: [{ tier: 0, p: 'x.......x.......' }] },
    lead: { patch: 'soft', motifs: 'slow', range: [64, 88], bars: [0, 1, 0, 1], vel: 0.6 },
    drums: NO_DRUMS,
    gates: { bass: [0, 0.2], arp: [0, 0.2], lead: [0.1, 0.4], perc: [0.9, 1] },
    levels: { pad: 1, bass: 0.65, arp: 0.55, lead: 0.55, perc: 0.3 },
    fx: { delayBeats: 1.5, delayFeedback: 0.45, delaySend: 0.4, reverb: 0.6 },
    tone: 5500,
  },
};

export const PROFILES = Object.freeze(
  Object.fromEntries(Object.entries(RAW_PROFILES).map(([id, profile]) => [id, Object.freeze({ id, ...profile })])),
);

export function profileIdFor({ scene, zone, mood }) {
  if (scene === 'hub') return 'hub';
  if (scene === 'results') return mood === 'fail' ? 'results-fail' : 'results';
  return ZONES.includes(zone) ? zone : 'ground';
}
