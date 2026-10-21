export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Wraps an angle into (-PI, PI].
export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
