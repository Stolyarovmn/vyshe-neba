// Offline-render analysis: peak, loudness, silence and sanity checks.
// Pure functions over Float32Array channels, used by renderOffline and tests.

const SILENCE_DB = -70;

export const toDb = (linear) => 20 * Math.log10(Math.max(linear, 1e-9));

export function analyze(channels, sampleRate, { from = 0, to = Infinity, windowSeconds = 0.1, silenceDb = SILENCE_DB } = {}) {
  const length = channels[0].length;
  const start = Math.max(0, Math.floor(from * sampleRate));
  const end = Math.min(length, Number.isFinite(to) ? Math.floor(to * sampleRate) : length);
  const windowSize = Math.max(1, Math.floor(windowSeconds * sampleRate));
  let peak = 0;
  let sum = 0;
  let count = 0;
  let invalid = 0;
  let dc = 0;
  const windows = [];

  for (let w = start; w < end; w += windowSize) {
    const stop = Math.min(end, w + windowSize);
    let windowSum = 0;
    let windowCount = 0;
    for (const data of channels) {
      for (let i = w; i < stop; i++) {
        const v = data[i];
        if (!Number.isFinite(v)) {
          invalid++;
          continue;
        }
        const a = Math.abs(v);
        if (a > peak) peak = a;
        windowSum += v * v;
        windowCount++;
        dc += v;
      }
    }
    sum += windowSum;
    count += windowCount;
    windows.push(toDb(Math.sqrt(windowSum / Math.max(1, windowCount))));
  }

  let longest = 0;
  let run = 0;
  for (const db of windows) {
    run = db < silenceDb ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const rms = Math.sqrt(sum / Math.max(1, count));
  return {
    peak,
    peakDb: toDb(peak),
    rms,
    rmsDb: toDb(rms),
    invalid,
    dcOffset: dc / Math.max(1, count),
    windowSeconds,
    windowsDb: windows,
    longestSilence: longest * windowSeconds,
    seconds: (end - start) / sampleRate,
  };
}

// 16-bit PCM WAV for the demo page's download button.
export function encodeWav(channels, sampleRate) {
  const length = channels[0].length;
  const bytes = 44 + length * channels.length * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, length * channels.length * 2, true);
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (const data of channels) {
      const v = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      offset += 2;
    }
  }
  return view.buffer;
}
