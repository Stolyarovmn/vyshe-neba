// A strict stand-in for the Web Audio subset the engine uses. It mirrors the
// real API's argument checks (finite numbers, non-negative times, positive
// exponential targets) so wiring mistakes surface in plain Node, and it tracks
// node lifetime so tests can prove nothing leaks.

class MockParam {
  constructor(ctx, name, value) {
    this.ctx = ctx;
    this.name = name;
    this.value = value;
    this.events = [];
    this.lastValue = value;
  }

  record(type, value, time, extra) {
    this.events.push({ type, value, time, ...extra });
    if (type !== 'cancel') this.lastValue = value;
    this.ctx.stats.paramEvents++;
    return this;
  }

  setValueAtTime(value, time) {
    check(value, `${this.name}.setValueAtTime value`);
    checkTime(time, `${this.name}.setValueAtTime time`);
    return this.record('set', value, time);
  }

  linearRampToValueAtTime(value, time) {
    check(value, `${this.name}.linearRamp value`);
    checkTime(time, `${this.name}.linearRamp time`);
    return this.record('linear', value, time);
  }

  exponentialRampToValueAtTime(value, time) {
    check(value, `${this.name}.exponentialRamp value`);
    checkTime(time, `${this.name}.exponentialRamp time`);
    if (value === 0) throw new RangeError(`${this.name}: exponential ramp to zero`);
    if (this.lastValue === 0) this.ctx.warn(`${this.name}: exponential ramp starts from zero (stays flat)`);
    return this.record('exp', value, time);
  }

  setTargetAtTime(value, time, timeConstant) {
    check(value, `${this.name}.setTarget value`);
    checkTime(time, `${this.name}.setTarget time`);
    check(timeConstant, `${this.name}.setTarget timeConstant`);
    if (timeConstant < 0) throw new RangeError(`${this.name}: negative time constant`);
    return this.record('target', value, time, { timeConstant });
  }

  setValueCurveAtTime(curve, time, duration) {
    checkTime(time, `${this.name}.curve time`);
    if (!(duration > 0)) throw new RangeError(`${this.name}: curve duration must be positive`);
    for (const v of curve) check(v, `${this.name}.curve value`);
    return this.record('curve', curve[curve.length - 1], time, { duration });
  }

  cancelScheduledValues(time) {
    checkTime(time, `${this.name}.cancel time`);
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }
}

function check(value, what) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${what} is not a finite number: ${value}`);
}

function checkTime(value, what) {
  check(value, what);
  if (value < 0) throw new RangeError(`${what} is negative: ${value}`);
}

class MockNode {
  constructor(ctx, kind) {
    this.ctx = ctx;
    this.kind = kind;
    this.outputs = new Set();
    this.disconnected = false;
    ctx.stats.created++;
    ctx.stats.byKind[kind] = (ctx.stats.byKind[kind] ?? 0) + 1;
    ctx.nodes.add(this);
  }

  param(name, value) {
    return new MockParam(this.ctx, `${this.kind}.${name}`, value);
  }

  connect(target) {
    if (!target || target.ctx !== this.ctx) throw new TypeError(`${this.kind}.connect: foreign or missing target`);
    this.outputs.add(target);
    return target;
  }

  disconnect(target) {
    if (target !== undefined) {
      // Selective disconnect: the node stays alive, like in the real API.
      if (!this.outputs.delete(target)) throw new Error(`${this.kind}.disconnect: not connected to that target`);
      return;
    }
    this.outputs.clear();
    if (!this.disconnected) {
      this.disconnected = true;
      this.ctx.nodes.delete(this);
      this.ctx.stats.released++;
    }
  }
}

class MockSource extends MockNode {
  constructor(ctx, kind) {
    super(ctx, kind);
    this.started = false;
    this.startTime = null;
    this.stopTime = null;
    this.onended = null;
    this.ended = false;
  }

  start(when = 0) {
    checkTime(when, `${this.kind}.start`);
    if (this.started) throw new Error(`${this.kind}.start called twice`);
    this.started = true;
    this.startTime = when;
    this.ctx.sources.add(this);
  }

  stop(when = 0) {
    checkTime(when, `${this.kind}.stop`);
    if (!this.started) throw new Error(`${this.kind}.stop before start`);
    this.stopTime = when;
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    this.ctx.sources.delete(this);
    if (typeof this.onended === 'function') this.onended();
  }
}

class MockOscillator extends MockSource {
  constructor(ctx) {
    super(ctx, 'oscillator');
    this.frequency = this.param('frequency', 440);
    this.detune = this.param('detune', 0);
    this._type = 'sine';
  }

  get type() { return this._type; }
  set type(value) {
    if (!['sine', 'square', 'sawtooth', 'triangle'].includes(value)) throw new TypeError(`bad oscillator type ${value}`);
    this._type = value;
  }

  setPeriodicWave(wave) {
    if (!wave || wave.kind !== 'periodicwave') throw new TypeError('not a PeriodicWave');
    this._type = 'custom';
  }
}

class MockBufferSource extends MockSource {
  constructor(ctx) {
    super(ctx, 'buffersource');
    this.buffer = null;
    this.loop = false;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.playbackRate = this.param('playbackRate', 1);
  }

  start(when = 0, offset = 0, duration) {
    if (!this.buffer) throw new Error('buffer source started without a buffer');
    checkTime(offset, 'buffersource.offset');
    if (offset > this.buffer.duration) throw new RangeError('offset beyond buffer');
    if (duration !== undefined) checkTime(duration, 'buffersource.duration');
    super.start(when);
  }
}

class MockGain extends MockNode {
  constructor(ctx) {
    super(ctx, 'gain');
    this.gain = this.param('gain', 1);
  }
}

class MockBiquad extends MockNode {
  constructor(ctx) {
    super(ctx, 'biquad');
    this.frequency = this.param('frequency', 350);
    this.Q = this.param('Q', 1);
    this.gain = this.param('gain', 0);
    this.detune = this.param('detune', 0);
    this._type = 'lowpass';
  }

  get type() { return this._type; }
  set type(value) {
    const ok = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'];
    if (!ok.includes(value)) throw new TypeError(`bad filter type ${value}`);
    this._type = value;
  }
}

class MockPanner extends MockNode {
  constructor(ctx) {
    super(ctx, 'stereopanner');
    this.pan = this.param('pan', 0);
  }
}

class MockDelay extends MockNode {
  constructor(ctx, max) {
    super(ctx, 'delay');
    if (!(max > 0 && max <= 180)) throw new RangeError('bad maxDelayTime');
    this.maxDelayTime = max;
    this.delayTime = this.param('delayTime', 0);
  }
}

class MockConvolver extends MockNode {
  constructor(ctx) {
    super(ctx, 'convolver');
    this.buffer = null;
    this.normalize = true;
  }
}

class MockCompressor extends MockNode {
  constructor(ctx) {
    super(ctx, 'compressor');
    this.threshold = this.param('threshold', -24);
    this.knee = this.param('knee', 30);
    this.ratio = this.param('ratio', 12);
    this.attack = this.param('attack', 0.003);
    this.release = this.param('release', 0.25);
    this.reduction = 0;
  }
}

class MockShaper extends MockNode {
  constructor(ctx) {
    super(ctx, 'waveshaper');
    this.curve = null;
    this.oversample = 'none';
  }
}

class MockAnalyser extends MockNode {
  constructor(ctx) {
    super(ctx, 'analyser');
    this.fftSize = 2048;
    this.smoothingTimeConstant = 0.8;
  }

  get frequencyBinCount() { return this.fftSize / 2; }
  getFloatTimeDomainData(array) { array.fill(0); }
  getByteFrequencyData(array) { array.fill(0); }
}

export class MockAudioContext {
  constructor({ sampleRate = 44100, state = 'running' } = {}) {
    this.sampleRate = sampleRate;
    this.state = state;
    this.currentTime = 0;
    this.stats = { created: 0, released: 0, paramEvents: 0, byKind: {} };
    this.nodes = new Set();
    this.sources = new Set();
    this.warnings = [];
    this.destination = new MockNode(this, 'destination');
  }

  warn(message) { this.warnings.push(message); }

  // Moves the clock forward and fires `onended` for sources that have stopped.
  advance(seconds) {
    this.currentTime = seconds;
    for (const source of [...this.sources]) {
      if (source.stopTime !== null && source.stopTime <= seconds) source.finish();
    }
  }

  liveCount() { return this.nodes.size; }
  runningSources() { return this.sources.size; }

  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }

  createGain() { return new MockGain(this); }
  createOscillator() { return new MockOscillator(this); }
  createBufferSource() { return new MockBufferSource(this); }
  createBiquadFilter() { return new MockBiquad(this); }
  createStereoPanner() { return new MockPanner(this); }
  createDelay(max = 1) { return new MockDelay(this, max); }
  createConvolver() { return new MockConvolver(this); }
  createDynamicsCompressor() { return new MockCompressor(this); }
  createWaveShaper() { return new MockShaper(this); }
  createAnalyser() { return new MockAnalyser(this); }

  createBuffer(channels, length, sampleRate) {
    if (!(channels >= 1 && length >= 1 && sampleRate >= 3000)) throw new RangeError('bad buffer size');
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: (c) => data[c],
    };
  }

  createPeriodicWave(real, imag) {
    if (real.length !== imag.length || real.length < 2) throw new RangeError('bad periodic wave tables');
    for (const v of [...real, ...imag]) check(v, 'periodic wave coefficient');
    return { kind: 'periodicwave' };
  }
}
