// Кинетическая прокрутка: перетаскивание, инерция, упругий выход за границы. Чистая логика без DOM.

const SAMPLE_WINDOW = 0.1; // секунд истории для оценки скорости отпускания
const FRICTION = 4.2; // 1/с, экспоненциальное затухание инерции
const MIN_FLING = 40; // px/с, ниже — просто остановка
const MAX_FLING = 6000;
const SPRING = 220;
const DAMPING = 26;
const RUBBER = 0.45; // доля смещения, которая «проходит» за границу во время перетаскивания

export function createScroll() {
  return { offset: 0, vel: 0, min: 0, max: 0, dragging: false, samples: [], settled: true };
}

/** Задать допустимый диапазон смещения [0, max]. */
export function setRange(s, contentSize, viewSize) {
  s.min = 0;
  s.max = Math.max(0, contentSize - viewSize);
  if (!s.dragging && s.offset > s.max && Math.abs(s.vel) < 1) s.vel = 0;
}

export function dragStart(s) {
  s.dragging = true;
  s.vel = 0;
  s.samples.length = 0;
  s.settled = false;
}

/** Палец сместился на dy пикселей (положительное dy = контент уезжает вниз, смещение уменьшается). */
export function dragMove(s, dy, now) {
  if (!s.dragging || s.max <= s.min) return;
  let delta = -dy;
  const out = s.offset < s.min ? s.min - s.offset : s.offset > s.max ? s.offset - s.max : 0;
  const movingOut = (s.offset <= s.min && delta < 0) || (s.offset >= s.max && delta > 0);
  if (movingOut) delta *= RUBBER / (1 + out / 80);
  s.offset += delta;
  s.samples.push({ t: now, y: s.offset });
  const cutoff = now - SAMPLE_WINDOW;
  while (s.samples.length > 2 && s.samples[0].t < cutoff) s.samples.shift();
}

export function dragEnd(s) {
  s.dragging = false;
  const smp = s.samples;
  let v = 0;
  if (smp.length >= 2) {
    const a = smp[0];
    const b = smp[smp.length - 1];
    const dt = b.t - a.t;
    if (dt > 0.004) v = (b.y - a.y) / dt;
  }
  v = Math.max(-MAX_FLING, Math.min(MAX_FLING, v));
  s.vel = Math.abs(v) < MIN_FLING ? 0 : v;
  s.samples.length = 0;
}

/** Колесо мыши: мгновенный сдвиг с небольшой инерцией. */
export function wheel(s, deltaY) {
  s.offset = clampRange(s, s.offset + deltaY);
  s.vel = 0;
  s.settled = false;
}

function clampRange(s, v) {
  return v < s.min ? s.min : v > s.max ? s.max : v;
}

/** Шаг физики. Возвращает true, пока что-то движется. */
export function update(s, dt) {
  if (s.dragging) return true;
  const over = s.offset < s.min ? s.offset - s.min : s.offset > s.max ? s.offset - s.max : 0;
  if (over !== 0) {
    // упругий возврат к границе
    const a = -SPRING * over - DAMPING * s.vel;
    s.vel += a * dt;
    s.offset += s.vel * dt;
    const still = Math.abs(s.offset - clampRange(s, s.offset)) < 0.3 && Math.abs(s.vel) < 8;
    if (still) {
      s.offset = clampRange(s, s.offset);
      s.vel = 0;
      s.settled = true;
    }
    return !s.settled;
  }
  if (s.vel === 0) {
    s.settled = true;
    return false;
  }
  s.offset += s.vel * dt;
  s.vel *= Math.exp(-FRICTION * dt);
  if (Math.abs(s.vel) < 6) s.vel = 0;
  s.settled = false;
  return true;
}

/** Плавно показать прямоугольник [y, y+h] внутри окна. */
export function reveal(s, y, h, viewSize, pad = 8) {
  if (y - pad < s.offset) s.offset = clampRange(s, y - pad);
  else if (y + h + pad > s.offset + viewSize) s.offset = clampRange(s, y + h + pad - viewSize);
}
