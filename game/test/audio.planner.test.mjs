// Music planner and score data: pure logic, no Web Audio.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chordAt, chordInfo, createPlanner, ENABLE_LEVEL, mixTargets, nearestAtOrAbove, pickPattern, scaleMidi, STEPS_PER_BAR, voicePad,
} from '../src/audio/planner.js';
import { CHORD_SHAPES, MOTIFS, PROFILES, profileIdFor } from '../src/audio/score.js';
import { ZONES } from '../src/audio/names.js';

const stepSeconds = (profile) => 60 / profile.bpm / 4;

// Runs a planner the way the game does: small state updates, short look-ahead windows.
function run(planner, seconds, { dt = 1 / 30, lookahead = 0.4 } = {}) {
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    planner.advance(dt);
    events.push(...planner.plan(t, t + lookahead));
  }
  return events;
}

const settle = (planner) => {
  for (let i = 0; i < 400; i++) planner.advance(0.05);
};

test('score: every profile is well formed', () => {
  const allowedDrum = new Set('Xxo.');
  const allowedBass = new Set('RrR53 7c.'.split(''));
  for (const [id, p] of Object.entries(PROFILES)) {
    assert.equal(p.id, id);
    assert.ok(p.bpm >= 50 && p.bpm <= 140, `${id} bpm`);
    assert.equal(p.scale.length, 7, `${id} scale is heptatonic`);
    assert.ok(p.scale.every((n, i) => i === 0 || n > p.scale[i - 1]), `${id} scale ascends`);
    assert.ok(p.chordBars === 1 || p.chordBars === 2, `${id} chordBars`);
    assert.ok(p.sections.length >= 1);
    for (const section of p.sections) {
      assert.equal(section.length, p.sections[0].length, `${id} sections have equal length`);
      for (const chord of section) assert.ok(CHORD_SHAPES[chord.q], `${id}: unknown chord ${chord.q}`);
    }
    const lists = [p.bass.pattern, p.arp.steps, ...Object.values(p.drums)];
    for (const list of lists) {
      let lastTier = -1;
      for (const { tier, p: pattern } of list) {
        assert.equal(pattern.length, STEPS_PER_BAR, `${id}: pattern "${pattern}" must have 16 steps`);
        assert.ok(tier >= lastTier, `${id}: tiers ascend`);
        lastTier = tier;
      }
    }
    for (const { p: pattern } of p.bass.pattern) for (const c of pattern) assert.ok(allowedBass.has(c), `${id}: bass token ${c}`);
    for (const list of [p.arp.steps, ...Object.values(p.drums)]) for (const { p: pattern } of list) for (const c of pattern) assert.ok(allowedDrum.has(c), `${id}: token ${c}`);
    for (const range of Object.values(p.gates)) assert.ok(range[0] <= range[1] && range[0] >= 0 && range[1] <= 1, `${id} gate`);
    for (const level of Object.values(p.levels)) assert.ok(level >= 0 && level <= 1.01, `${id} level`);
    assert.ok(MOTIFS[p.lead.motifs], `${id} motifs`);
    assert.equal(p.lead.bars.length, 4);
    assert.ok(p.lead.range[0] < p.lead.range[1] && p.arp.range[0] < p.arp.range[1]);
  }
});

test('score: every zone, scene and mood maps to a profile', () => {
  for (const zone of ZONES) assert.ok(PROFILES[profileIdFor({ scene: 'flight', zone })], zone);
  assert.equal(profileIdFor({ scene: 'hub' }), 'hub');
  assert.equal(profileIdFor({ scene: 'results', mood: 'win' }), 'results');
  assert.equal(profileIdFor({ scene: 'results', mood: 'fail' }), 'results-fail');
  assert.equal(profileIdFor({ scene: 'flight', zone: 'nonsense' }), 'ground', 'unknown zone falls back');
});

test('theory helpers', () => {
  assert.equal(nearestAtOrAbove(9, 40), 45); // A at or above E2
  assert.equal(nearestAtOrAbove(4, 52), 52);
  assert.equal(scaleMidi(PROFILES.ground, 57, 0), 57);
  assert.equal(scaleMidi(PROFILES.ground, 57, 7), 69, 'a full scale up is an octave');
  assert.equal(scaleMidi(PROFILES.ground, 57, -1), 55, 'seventh degree below the tonic');
  const info = chordInfo(PROFILES.ground, { r: 8, q: 'maj7' }); // F major seventh in A
  assert.deepEqual(info.pcs.sort((a, b) => a - b), [0, 4, 5, 9]);
  assert.equal(pickPattern([{ tier: 0, p: 'a' }, { tier: 0.5, p: 'b' }], 0.3), 'a');
  assert.equal(pickPattern([{ tier: 0, p: 'a' }, { tier: 0.5, p: 'b' }], 0.5), 'b');
  assert.equal(pickPattern([{ tier: 0.4, p: 'a' }], 0.2), null);
  assert.equal(pickPattern(undefined, 1), null);
});

test('chord progression is a pure function of the bar number', () => {
  const p = PROFILES.hub; // two bars per chord, two sections of four chords
  assert.deepEqual(chordAt(p, 0).chord, p.sections[0][0]);
  assert.deepEqual(chordAt(p, 1).chord, p.sections[0][0]);
  assert.deepEqual(chordAt(p, 2).chord, p.sections[0][1]);
  assert.deepEqual(chordAt(p, 8).chord, p.sections[1][0], 'second section after four chords');
  assert.deepEqual(chordAt(p, 16).chord, p.sections[0][0], 'then it loops');
  assert.equal(chordAt(p, 8).sectionStart, true);
  assert.equal(chordAt(p, 2).sectionStart, false);
});

test('pad voicing keeps chord tones, stays in range and moves smoothly', () => {
  for (const [id, p] of Object.entries(PROFILES)) {
    let previous = null;
    for (let bar = 0; bar < p.sections[0].length * p.sections.length * p.chordBars; bar += p.chordBars) {
      const info = chordInfo(p, chordAt(p, bar).chord);
      const voicing = voicePad(p, info, previous);
      assert.ok(voicing.notes.length >= 2 && voicing.notes.length <= 4, `${id}: pad voices`);
      for (const note of voicing.notes) {
        assert.ok(info.pcs.includes(note % 12), `${id}: ${note} is a chord tone`);
        assert.ok(note >= 40 && note <= 90, `${id}: pad note ${note} in range`);
      }
      assert.ok(voicing.notes.every((n, i) => i === 0 || n > voicing.notes[i - 1]), `${id}: voicing ascends`);
      assert.ok(Math.abs(voicing.center - p.padCenter) <= 9, `${id}: pad drifted to ${voicing.center}`);
      if (previous) {
        const pairs = Math.min(previous.notes.length, voicing.notes.length);
        let motion = 0;
        for (let i = 1; i <= pairs; i++) motion += Math.abs(previous.notes[previous.notes.length - i] - voicing.notes[voicing.notes.length - i]);
        assert.ok(motion / pairs <= 6, `${id}: voices leap ${motion / pairs} semitones on average`);
      }
      previous = voicing;
    }
  }
});

test('same seed and state history give identical events; another seed differs', () => {
  const play = (seed) => {
    const planner = createPlanner({ seed });
    planner.setTarget({ scene: 'flight', zone: 'troposphere', intensity: 0.8 });
    const first = run(planner, 12);
    planner.setTarget({ zone: 'space', intensity: 0.4, tension: 0.7 });
    return [...first, ...run(planner, 12)];
  };
  const a = play(5);
  const b = play(5);
  assert.ok(a.length > 400);
  assert.deepEqual(a, b);
  assert.notDeepEqual(play(6), a);
});

test('planning in one go equals planning in pieces', () => {
  const make = () => {
    const planner = createPlanner({ seed: 3 });
    planner.setTarget({ scene: 'flight', zone: 'ground', intensity: 0.9 });
    settle(planner);
    return planner;
  };
  const whole = make().plan(0, 20);
  const piecewise = make();
  const parts = [];
  let from = 0;
  for (const to of [0.3, 1.7, 2.2, 2.9, 7.5, 7.6, 14, 20]) {
    parts.push(...piecewise.plan(from, to));
    from = to;
  }
  const key = (e) => JSON.stringify(e);
  assert.deepEqual(parts.map(key).sort(), whole.map(key).sort());
});

test('events are timed inside the requested window and never invalid', () => {
  for (const id of Object.keys(PROFILES)) {
    const scene = id === 'hub' ? 'hub' : id.startsWith('results') ? 'results' : 'flight';
    const planner = createPlanner({ seed: 9 });
    planner.setTarget({ scene, zone: ZONES.includes(id) ? id : 'ground', mood: id === 'results-fail' ? 'fail' : 'win', intensity: 0.95, tension: 0.8 });
    settle(planner);
    let from = 0;
    for (let i = 0; i < 60; i++) {
      const to = from + 0.4;
      for (const e of planner.plan(from, to)) {
        assert.ok(e.t >= from - 0.07 && e.t < to + 0.35, `${id}: event at ${e.t} outside [${from}, ${to})`);
        assert.ok(Number.isFinite(e.t));
        if (e.vel !== undefined) assert.ok(e.vel >= 0 && e.vel <= 1.31 && Number.isFinite(e.vel), `${id}: vel ${e.vel}`);
        if (e.dur !== undefined) assert.ok(e.dur > 0 && Number.isFinite(e.dur));
        if (e.midi !== undefined) assert.ok(Number.isInteger(e.midi) && e.midi >= 24 && e.midi <= 110, `${id}: midi ${e.midi}`);
        if (e.pan !== undefined) assert.ok(Math.abs(e.pan) <= 1);
      }
      from = to;
    }
  }
});

test('notes belong to the current chord and register', () => {
  for (const id of ['hub', ...ZONES, 'results', 'results-fail']) {
    const profile = PROFILES[id];
    const scene = id === 'hub' ? 'hub' : id.startsWith('results') ? 'results' : 'flight';
    const planner = createPlanner({ seed: 4 });
    planner.setTarget({ scene, zone: id, mood: id === 'results-fail' ? 'fail' : 'win', intensity: 0.95 });
    settle(planner);
    const events = planner.plan(0, 90);
    const grid = 0.08;
    const barLength = STEPS_PER_BAR * stepSeconds(profile);
    const scalePcs = profile.scale.map((n) => (profile.root + n) % 12);
    assert.ok(events.some((e) => e.layer === 'pad'), `${id}: has pad`);
    for (const e of events) {
      if (!['pad', 'bass', 'arp', 'lead'].includes(e.layer)) continue;
      const bar = Math.floor((e.t - grid + 0.05) / barLength);
      const info = chordInfo(profile, chordAt(profile, bar).chord);
      if (e.layer === 'lead') {
        assert.ok(e.midi >= profile.lead.range[0] - 12 && e.midi <= profile.lead.range[1] + 3, `${id}: lead ${e.midi} range`);
        assert.ok(scalePcs.includes(e.midi % 12) || info.pcs.includes(e.midi % 12), `${id}: lead ${e.midi} outside scale and chord`);
      } else if (e.layer === 'arp') {
        assert.ok(e.midi >= profile.arp.range[0] && e.midi <= profile.arp.range[1], `${id}: arp ${e.midi} range`);
        assert.ok(info.pcs.includes(e.midi % 12), `${id}: arp ${e.midi} is not a chord tone`);
      } else {
        assert.ok(info.pcs.includes(e.midi % 12), `${id}: ${e.layer} ${e.midi} is not a chord tone (bar ${bar})`);
      }
      if (e.layer === 'bass') assert.ok(e.midi >= profile.bass.register && e.midi < profile.bass.register + 24, `${id}: bass ${e.midi}`);
    }
  }
});

test('layers enter with intensity', () => {
  const layersAt = (intensity) => {
    const planner = createPlanner({ seed: 2 });
    planner.setTarget({ scene: 'flight', zone: 'ground', intensity });
    settle(planner);
    return new Set(planner.plan(0, 20).map((e) => e.layer));
  };
  assert.deepEqual([...layersAt(0)], ['pad'], 'a calm flight is only a pad');
  assert.ok(layersAt(0.35).has('bass'));
  assert.ok(layersAt(0.5).has('arp'));
  const full = layersAt(0.95);
  for (const layer of ['pad', 'bass', 'arp', 'lead', 'drum']) assert.ok(full.has(layer), layer);
  assert.equal(full.has('heart'), false, 'no heartbeat without tension');
});

test('drums thicken with intensity and fills close every fourth bar', () => {
  const count = (intensity) => {
    const planner = createPlanner({ seed: 2 });
    planner.setTarget({ scene: 'flight', zone: 'ground', intensity });
    settle(planner);
    return planner.plan(0, 30).filter((e) => e.layer === 'drum').length;
  };
  assert.ok(count(0.95) > count(0.6) && count(0.6) > count(0.4) && count(0.4) > 0);
  const planner = createPlanner({ seed: 2 });
  planner.setTarget({ scene: 'flight', zone: 'ground', intensity: 0.95 });
  settle(planner);
  const events = planner.plan(0, 20);
  const bar = 16 * stepSeconds(PROFILES.ground);
  const fillBar = events.filter((e) => e.layer === 'drum' && e.kind === 'snare' && e.t > 0.08 + 3 * bar + 12 * stepSeconds(PROFILES.ground) && e.t < 0.08 + 4 * bar);
  assert.ok(fillBar.length >= 4, 'snare roll in the last beat of bar four');
  assert.ok(fillBar[fillBar.length - 1].vel > fillBar[0].vel, 'the roll gets louder');
});

test('zone changes wait for the next bar line, scene changes for the next beat', () => {
  const planner = createPlanner({ seed: 1 });
  planner.setTarget({ scene: 'flight', zone: 'ground', intensity: 0.6 });
  settle(planner);
  const ground = PROFILES.ground;
  const bar = 16 * stepSeconds(ground);
  const beat = 4 * stepSeconds(ground);
  const first = planner.plan(0, 1);
  const origin = 0.08;
  planner.setTarget({ zone: 'space' });
  const later = [...first, ...planner.plan(1, 3 * bar)];
  const jump = later.find((e) => e.layer === 'ctl' && e.kind === 'switch');
  assert.ok(jump, 'a switch event is emitted');
  assert.equal(jump.profile, 'space');
  const barPhase = ((jump.t - origin) / bar) % 1;
  assert.ok(barPhase < 1e-6 || barPhase > 1 - 1e-6, `switch at bar line (phase ${barPhase})`);
  assert.equal(planner.info().profile, 'space');
  assert.equal(planner.info().bpm, PROFILES.space.bpm);

  const other = createPlanner({ seed: 1 });
  other.setTarget({ scene: 'hub', intensity: 0.3 });
  settle(other);
  other.plan(0, 1);
  other.setTarget({ scene: 'flight', zone: 'ground' });
  const events = other.plan(1, 2 * 16 * stepSeconds(PROFILES.hub));
  const change = events.find((e) => e.layer === 'ctl');
  assert.ok(change && change.profile === 'ground');
  const beatPhase = ((change.t - 0.08) / (4 * stepSeconds(PROFILES.hub))) % 1;
  assert.ok(beatPhase < 1e-6 || beatPhase > 1 - 1e-6, `scene change on a beat (phase ${beatPhase})`);
  assert.ok(change.t - 1 < 4 * stepSeconds(PROFILES.hub) + 0.01, 'scene change is quick');
  assert.ok(beat > 0);
});

test('a long stall restarts the grid instead of replaying the past', () => {
  const planner = createPlanner({ seed: 1 });
  planner.setTarget({ scene: 'flight', zone: 'ground', intensity: 0.9 });
  settle(planner);
  planner.plan(0, 2);
  const events = planner.plan(600, 600.4);
  assert.ok(events.length > 0 && events.length < 200);
  assert.ok(events.every((e) => e.t >= 600 - 0.07), 'nothing is scheduled in the past');
  const short = planner.plan(601.5, 601.9); // 1.1 s after the previous window: a catch-up gap
  assert.ok(short.every((e) => e.t >= 601.5 - 0.07));
});

test('a stalled caller keeps the harmony', () => {
  const planner = createPlanner({ seed: 1 });
  planner.setTarget({ scene: 'hub', intensity: 0.3 });
  settle(planner);
  planner.plan(0, 0.2);
  // 0.4 s late: well inside one chord (about 6 s long): the chord must still sound
  const late = planner.plan(0.7, 1.1);
  assert.equal(late.filter((e) => e.layer === 'pad').length, 0, 'chord already sounding, nothing to repair');
  const planner2 = createPlanner({ seed: 1 });
  planner2.setTarget({ scene: 'hub', intensity: 0.3 });
  settle(planner2);
  // the very first window arrives late: pad notes starting before `now` are kept
  const events = planner2.plan(0.2, 0.6);
  assert.ok(events.filter((e) => e.layer === 'pad').length >= 2);
});

test('heartbeat follows tension and speeds up', () => {
  const beats = (tension) => {
    const planner = createPlanner({ seed: 1 });
    planner.setTarget({ scene: 'flight', zone: 'ground', intensity: 0.5, tension });
    settle(planner);
    return planner.plan(0, 20).filter((e) => e.layer === 'heart' && e.kind === 'lub');
  };
  assert.equal(beats(0).length, 0);
  const calm = beats(0.3);
  const panic = beats(1);
  assert.ok(calm.length > 8);
  assert.ok(panic.length > calm.length * 1.4, 'a faster pulse under more tension');
  assert.ok(panic[0].vel > calm[0].vel);
  const spacing = panic[2].t - panic[1].t;
  assert.ok(spacing > 0.45 && spacing < 0.6);
});

test('mix targets: monotonic, bounded and responsive', () => {
  for (const [id, profile] of Object.entries(PROFILES)) {
    let last = null;
    for (let i = 0; i <= 20; i++) {
      const mix = mixTargets(profile, { intensity: i / 20, tension: 0, speed01: 0, alt01: 0, paused: false });
      for (const [layer, value] of Object.entries(mix)) assert.ok(Number.isFinite(value) && value >= 0, `${id} ${layer}`);
      for (const layer of ['pad', 'bass', 'arp', 'lead', 'perc']) assert.ok(mix[layer] <= 1.01, `${id} ${layer} <= 1`);
      if (last) {
        for (const layer of ['bass', 'arp', 'lead', 'perc']) assert.ok(mix[layer] >= last[layer] - 1e-9, `${id}: ${layer} grows with intensity`);
        assert.ok(mix.pad <= last.pad + 1e-9 && mix.pad > ENABLE_LEVEL, `${id}: pad recedes a little but never vanishes`);
      }
      last = mix;
    }
    const calm = mixTargets(profile, { intensity: 0.5, tension: 0, speed01: 0.5, alt01: 0.5, paused: false });
    const tense = mixTargets(profile, { intensity: 0.5, tension: 1, speed01: 0.5, alt01: 0.5, paused: false });
    const paused = mixTargets(profile, { intensity: 0.5, tension: 0, speed01: 0.5, alt01: 0.5, paused: true });
    assert.ok(tense.heart > calm.heart && calm.heart === 0);
    assert.ok(tense.cutoff < calm.cutoff, `${id}: tension darkens the mix`);
    assert.ok(paused.cutoff < 1000 && paused.pad < calm.pad, `${id}: pause muffles`);
    const high = mixTargets(profile, { intensity: 0.5, tension: 0, speed01: 0.5, alt01: 1, paused: false });
    assert.ok(high.reverb > calm.reverb, `${id}: more reverb up high`);
  }
});

test('planner target is clamped and smoothing is frame-rate independent', () => {
  const a = createPlanner({ seed: 1 });
  const b = createPlanner({ seed: 1 });
  a.setTarget({ intensity: 7, tension: -3 });
  assert.deepEqual([a.target.intensity, a.target.tension], [1, 0]);
  a.setTarget({ intensity: 1 });
  b.setTarget({ intensity: 1 });
  for (let i = 0; i < 60; i++) a.advance(1 / 60);
  for (let i = 0; i < 20; i++) b.advance(1 / 20);
  assert.ok(Math.abs(a.info().intensity - b.info().intensity) < 1e-9);
  assert.ok(a.info().intensity > 0.25 && a.info().intensity < 1, 'it approaches the target gradually');
});
