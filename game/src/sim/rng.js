// Deterministic randomness for the simulation.
// The generator state is a plain `{ s }` object so it can live inside a JSON-serialisable flight.

const TWO_POW_32 = 4294967296;

export function createRngState(seed) {
  return { s: seed >>> 0 };
}

export function nextFloat(rs) {
  rs.s = (rs.s + 0x6d2b79f5) >>> 0;
  let t = rs.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
}

// Closure flavour of the same generator, handy for scripts and tests.
export function mulberry32(seed) {
  const rs = createRngState(seed);
  return () => nextFloat(rs);
}

export function range(rs, min, max) {
  return min + (max - min) * nextFloat(rs);
}

export function randInt(rs, count) {
  return Math.floor(nextFloat(rs) * count);
}

export function chance(rs, probability) {
  return nextFloat(rs) < probability;
}

export function pick(rs, list) {
  return list[randInt(rs, list.length)];
}

// `items` is an array, `weightOf(item)` returns a non-negative number. Returns null when every weight is zero.
export function pickWeighted(rs, items, weightOf) {
  let total = 0;
  for (const item of items) total += weightOf(item);
  if (total <= 0) return null;
  let roll = nextFloat(rs) * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

// Standard normal sample (Box-Muller).
export function gaussian(rs) {
  const u = Math.max(nextFloat(rs), 1e-12);
  const v = nextFloat(rs);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Mixes integers into one 32-bit seed, so a world cell gets the same content whatever order cells are generated in.
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const part of parts) {
    h = Math.imul(h ^ (part | 0), 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
