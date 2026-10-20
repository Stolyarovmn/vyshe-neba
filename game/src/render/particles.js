// Пул частиц без аллокаций в кадре: данные лежат в типизированных массивах, мёртвые частицы
// удаляются обменом с последней. Координаты — мировые (ось Y вниз).

export const PARTICLE = Object.freeze({
  FLAME: 0,
  SMOKE: 1,
  DUST: 2,
  STEAM: 3,
  TRAIL: 4,
  SPARK: 5,
  DEBRIS: 6,
  FLASH: 7,
  CONFETTI: 8,
  GLINT: 9,
});

/** Слой рисования: 0 — позади ракеты, 1 — поверх. */
const LAYER_OF_KIND = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1];

const BUCKETS = 8;

function ramp(stops) {
  const out = [];
  for (let i = 0; i < BUCKETS; i++) {
    const t = (i / (BUCKETS - 1)) * (stops.length - 1);
    const a = stops[Math.min(stops.length - 1, Math.floor(t))];
    const b = stops[Math.min(stops.length - 1, Math.floor(t) + 1)];
    const f = t - Math.floor(t);
    const mix = a.map((v, k) => Math.round(v + (b[k] - v) * f));
    out.push(`rgb(${mix[0]},${mix[1]},${mix[2]})`);
  }
  return out;
}

/** Цветовые рампы по kind (по жизни частицы от рождения до смерти); у SPARK/DEBRIS/CONFETTI есть палитры вариантов. */
const RAMPS = [
  ramp([[255, 244, 200], [255, 190, 90], [236, 110, 56], [120, 60, 52]]), // FLAME
  ramp([[236, 238, 240], [196, 202, 208], [128, 134, 142]]), // SMOKE
  ramp([[214, 190, 160], [168, 148, 128], [120, 108, 98]]), // DUST
  ramp([[246, 250, 252], [208, 226, 236], [170, 196, 214]]), // STEAM
  ramp([[255, 232, 190], [236, 176, 120], [150, 130, 130]]), // TRAIL
  ramp([[255, 252, 220], [255, 200, 96], [226, 96, 48]]), // SPARK
  ramp([[190, 186, 178], [128, 126, 124], [70, 70, 74]]), // DEBRIS
  ramp([[255, 255, 255], [255, 220, 150], [255, 150, 70]]), // FLASH
  ramp([[255, 214, 90], [255, 250, 230], [255, 214, 90]]), // CONFETTI
  ramp([[255, 255, 255], [190, 244, 255], [120, 210, 240]]), // GLINT
];

// Варианты палитры для вакуумного (синего) факела и ремонта/топлива.
const COLOR_VARIANTS = [
  null,
  ramp([[236, 252, 255], [140, 224, 255], [60, 150, 230], [30, 60, 120]]), // 1: плазма
  ramp([[220, 255, 230], [120, 230, 160], [50, 150, 100]]), // 2: ремонт/зелёный
  ramp([[255, 244, 190], [255, 216, 90], [220, 150, 40]]), // 3: монеты/золото
  ramp([[255, 250, 240], [255, 140, 110], [210, 60, 50]]), // 4: удар/красный
  ramp([[220, 250, 255], [140, 224, 255], [80, 170, 230]]), // 5: кольцо/циан
  ramp([[206, 206, 212], [168, 170, 178], [124, 126, 136]]), // 6: лунная пыль
  ramp([[226, 160, 120], [184, 112, 84], [128, 76, 62]]), // 7: марсианская пыль
  ramp([[255, 240, 200], [255, 160, 70], [90, 40, 30]]), // 8: огонь взрыва
  ramp([[96, 92, 92], [62, 60, 62], [34, 34, 38]]), // 9: чёрный дым
];
export const PALETTE_VARIANT = Object.freeze({
  DEFAULT: 0, PLASMA: 1, GREEN: 2, GOLD: 3, RED: 4, CYAN: 5, MOON_DUST: 6, MARS_DUST: 7, FIREBALL: 8, BLACK_SMOKE: 9,
});

export function createParticles(capacity = 900) {
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const vx = new Float32Array(capacity);
  const vy = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const size = new Float32Array(capacity);
  const sizeEnd = new Float32Array(capacity);
  const gravity = new Float32Array(capacity);
  const drag = new Float32Array(capacity);
  const kind = new Uint8Array(capacity);
  const variant = new Uint8Array(capacity);
  let count = 0;
  let cursor = 0;

  function swapRemove(i) {
    const last = count - 1;
    if (i !== last) {
      x[i] = x[last];
      y[i] = y[last];
      vx[i] = vx[last];
      vy[i] = vy[last];
      life[i] = life[last];
      maxLife[i] = maxLife[last];
      size[i] = size[last];
      sizeEnd[i] = sizeEnd[last];
      gravity[i] = gravity[last];
      drag[i] = drag[last];
      kind[i] = kind[last];
      variant[i] = variant[last];
    }
    count--;
  }

  const pool = {
    capacity,
    get count() {
      return count;
    },

    clear() {
      count = 0;
      cursor = 0;
    },

    /** Добавляет частицу; при переполнении перезаписывает самую старую по кругу. */
    emit(k, px, py, pvx, pvy, ttl, startSize, endSize, grav = 0, drg = 0, pal = 0) {
      let i;
      if (count < capacity) {
        i = count++;
      } else {
        i = cursor;
        cursor = (cursor + 1) % capacity;
      }
      x[i] = px;
      y[i] = py;
      vx[i] = pvx;
      vy[i] = pvy;
      life[i] = 0;
      maxLife[i] = ttl;
      size[i] = startSize;
      sizeEnd[i] = endSize;
      gravity[i] = grav;
      drag[i] = drg;
      kind[i] = k;
      variant[i] = pal;
      return i;
    },

    /** Шаг частиц. groundY — мировая высота грунта для отскока искр и обломков (или null). */
    update(dt, groundY) {
      for (let i = 0; i < count;) {
        life[i] += dt;
        if (life[i] >= maxLife[i]) {
          swapRemove(i);
          continue;
        }
        const d = drag[i];
        if (d > 0) {
          const f = Math.max(0, 1 - d * dt);
          vx[i] *= f;
          vy[i] *= f;
        }
        vy[i] += gravity[i] * dt;
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
        if (groundY !== null && groundY !== undefined && y[i] > groundY) {
          const k = kind[i];
          if (k === PARTICLE.SPARK || k === PARTICLE.DEBRIS || k === PARTICLE.CONFETTI) {
            y[i] = groundY;
            vy[i] = -vy[i] * 0.3;
            vx[i] *= 0.55;
            if (k === PARTICLE.DEBRIS && Math.abs(vy[i]) < 4) {
              vy[i] = 0;
              vx[i] = 0;
              gravity[i] = 0;
            }
          } else if (k === PARTICLE.SMOKE || k === PARTICLE.FLAME || k === PARTICLE.STEAM) {
            y[i] = groundY;
            vy[i] = Math.min(0, vy[i]);
          }
        }
        i++;
      }
    },

    /** Рисует частицы слоя (0 — позади ракеты, 1 — поверх). */
    draw(ctx, view, layer) {
      let lastFill = '';
      let lastAlpha = -1;
      for (let i = 0; i < count; i++) {
        const k = kind[i];
        if (LAYER_OF_KIND[k] !== layer) continue;
        const t = life[i] / maxLife[i];
        const unitSize = size[i] + (sizeEnd[i] - size[i]) * t;
        const dev = Math.max(1, Math.round(unitSize * view.S));
        const sx = view.sx(x[i]);
        const sy = view.sy(y[i]);
        if (sx < -dev || sy < -dev || sx > view.devW + dev || sy > view.devH + dev) continue;
        const bucket = Math.min(BUCKETS - 1, (t * BUCKETS) | 0);
        const ramps = variant[i] ? COLOR_VARIANTS[variant[i]] : RAMPS[k];
        const fill = ramps[bucket];
        if (fill !== lastFill) {
          ctx.fillStyle = fill;
          lastFill = fill;
        }
        const alpha = alphaFor(k, t);
        if (alpha !== lastAlpha) {
          ctx.globalAlpha = alpha;
          lastAlpha = alpha;
        }
        if (k === PARTICLE.FLASH) {
          ctx.beginPath();
          ctx.arc(sx, sy, dev / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(sx - (dev >> 1), sy - (dev >> 1), dev, dev);
        }
      }
      ctx.globalAlpha = 1;
    },
  };
  return pool;
}

function alphaFor(k, t) {
  switch (k) {
    case PARTICLE.SMOKE:
      return round2(0.7 * (1 - t) * Math.min(1, t * 6 + 0.3));
    case PARTICLE.DUST:
    case PARTICLE.STEAM:
      return round2(0.55 * (1 - t));
    case PARTICLE.TRAIL:
      return round2(0.8 * (1 - t));
    case PARTICLE.FLAME:
      return round2(0.95 - 0.5 * t);
    case PARTICLE.FLASH:
      return round2(0.8 * (1 - t));
    case PARTICLE.GLINT:
      return round2(1 - t);
    default:
      return round2(1 - t * t * 0.7);
  }
}

function round2(v) {
  return Math.round(v * 20) / 20;
}
