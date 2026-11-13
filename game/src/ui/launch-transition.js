// Смена проекции занимает 0,5 с: затемнение базы перед стартом и раскрытие полёта после него.
export const LAUNCH_AT = 0.8 * 3 + 0.35;
export const LAUNCH_FADE_HALF = 0.25;

export function launchTransitionAlpha(countdownTime, flightElapsed) {
  const value = Number.isFinite(countdownTime)
    ? (countdownTime - (LAUNCH_AT - LAUNCH_FADE_HALF)) / LAUNCH_FADE_HALF
    : Number.isFinite(flightElapsed) ? 1 - flightElapsed / LAUNCH_FADE_HALF : 0;
  return Math.max(0, Math.min(1, value));
}
