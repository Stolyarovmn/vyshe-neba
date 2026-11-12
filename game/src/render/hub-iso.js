// Изометрический хаб: координаты карты — пиксели PNG, ракета сохраняет свои мировые единицы.
// Старые якоря, декор, тени и маршруты сюда не передаются.
import { BUILDING_KEYS, E0_BUILDING_CLIPS, ENTRY_KEYS } from './manifest.js';
import { createMapView, drawSea } from './islandmap.js';
import { drawEntryHint } from './entries.js';
import { createRocketPose, drawRocket, nozzleOffset, stackHeight } from './rocket.js';
import { BUILD_DURATION, createHubFx, drawScaffold } from './hubfx.js';
import { dayOverlay, daylightAt, drawGlowScreen, drawVehicles, drawHeadlights, lightsAt } from './life.js';
import { powerBalance } from '../rules/base.js';
import { clamp, damp } from './util.js';
import { weatherMood } from './weather.js';

const WARM = '255,206,120';
const RED = '255,90,70';

/**
 * Физические лампы изометрических спрайтов E0 (найдены по кадрам iso/<key>.png): [доля ширины, доля высоты от верха,
 * радиус свечения px карты, красная мигалка]. Окна светятся тёплым изнутри. Без лампы на спрайте постройка ночью тёмная.
 */
export const ISO_LAMPS = {
  beacons: [[0.5, 0.18, 9, true]],
  gantry: [[0.55, 0.28, 16], [0.55, 0.49, 16], [0.83, 0.02, 8, true]],
  service: [[0.24, 0.47, 18], [0.74, 0.47, 18]],
  rescue: [[0.07, 0.6, 14], [0.92, 0.6, 14]],
  recovery: [[0.15, 0.55, 12]],
  control: [[0.25, 0.6, 18], [0.76, 0.6, 18]],
  radar: [[0.51, 0.73, 8]],
  factory: [[0.49, 0.39, 18], [0.16, 0.58, 12], [0.84, 0.58, 12]],
  logistics: [[0.5, 0.5, 18], [0.29, 0.24, 12], [0.66, 0.24, 12]],
  // объекты-входы: фонарь над воротами ангара, над прилавком лавки, на козырьке доски
  workshop: [[0.5, 0.3, 14]],
  shop: [[0.53, 0.35, 12]],
  board: [[0.51, 0.13, 8]],
};

const pair = (v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite);
const positivePair = (v) => pair(v) && v.every((n) => n > 0);

/** Неполная или повреждённая обязательная геометрия оставляет прежний хаб. */
export function isoLayout(assets) {
  const data = assets.json('base_iso_layout');
  if (!assets.has('island_base_iso') || !data || !positivePair(data.size)
    || !Number.isFinite(data.pad?.x) || !Number.isFinite(data.pad?.y)
    || !(Number.isFinite(data.pad?.rocketScale) && data.pad.rocketScale > 0)
    || !data.buildings || typeof data.buildings !== 'object' || Array.isArray(data.buildings)) return null;
  const buildings = {};
  for (const key of BUILDING_KEYS) {
    const b = data.buildings[key];
    if (b && pair(b.anchor) && positivePair(b.size)) buildings[key] = b;
  }
  // объекты-входы: ангар, доска контрактов, лавка, памятник эпох (не покупаются, есть всегда)
  const entries = {};
  for (const key of ENTRY_KEYS) {
    const e = data.entries?.[key];
    if (e && pair(e.anchor) && positivePair(e.size)) entries[key] = e;
  }
  const roads = (Array.isArray(data.roads) ? data.roads : [])
    .filter((points) => Array.isArray(points) && points.length >= 2 && points.every(pair))
    .map((points) => ({ points }))
    .filter((road) => road.points.some((p) => p[0] !== road.points[0][0] || p[1] !== road.points[0][1]));
  // Полоса застройки: все спрайты построек и стол; стартовый вид на широком экране показывает её целиком.
  const xs = [data.pad.x];
  const ys = [data.pad.y];
  for (const b of [...Object.values(buildings), ...Object.values(entries)]) {
    for (const a of [b.anchor, ...(Array.isArray(b.anchors) ? b.anchors.slice(1).filter(pair) : [])]) {
      xs.push(a[0] - b.size[0] / 2, a[0] + b.size[0] / 2);
      ys.push(a[1] - b.size[1], a[1]);
    }
  }
  const strip = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  return { size: data.size, pad: data.pad, buildings, entries, roads, camera: data.camera || {}, strip };
}

/** Собирает общую очередь: глубина здания, входа и ракеты определяется низом спрайта. */
export function isoDrawItems(layout, owned, assets) {
  const items = BUILDING_KEYS.filter((key) => owned[key] > 0 && layout.buildings[key] && assets.has(`iso_${key}_1978`))
    .map((key) => ({ key, y: layout.buildings[key].anchor[1] }));
  for (const key of ENTRY_KEYS) {
    const e = layout.entries?.[key];
    if (e && assets.has(`iso_entry_${key}_1978`)) items.push({ key, y: e.anchor[1], entry: true });
  }
  items.push({ key: 'rocket', y: layout.pad.y });
  return items.sort((a, b) => a.y - b.y);
}

/**
 * Лампы построек ISO_LAMPS: тёплые горят ровно, красные мигалки мигают; маяки слабеют при нехватке энергии.
 * Недостроенная постройка (reveal(key) < 1) не светится.
 */
export function drawLamps(ctx, mv, layout, owned, profile, time, strength, reveal = () => 1) {
  let drawn = 0;
  for (const [key, lamps] of Object.entries(ISO_LAMPS)) {
    const entry = layout.entries?.[key];
    const b = layout.buildings[key] || entry;
    if (!b || (!entry && !(owned[key] > 0)) || reveal(key) < 1) continue;
    const power = key === 'beacons' ? powerBalance(profile).ratio : 1;
    const anchors = [b.anchor, ...(Array.isArray(b.anchors) ? b.anchors.slice(1).filter(pair) : [])];
    anchors.forEach(([ax, ay], n) => {
      for (const [fx, fy, radius, red] of lamps) {
        const on = !red || Math.floor(time * 1.4 + n * 0.5 + key.length * 0.37) % 2 === 0;
        const x = mv.sx(ax - b.size[0] / 2 + fx * b.size[0]);
        const y = mv.sy(ay - b.size[1] + fy * b.size[1]);
        drawGlowScreen(ctx, x, y, radius * mv.s, red ? RED : WARM, strength * (on ? 0.9 : 0.25) * power);
        drawn++;
      }
    });
  }
  return drawn;
}

export function createIsoHub(painter, shared, layout) {
  const mv = createMapView();
  const rocketView = createMapView();
  const pose = createRocketPose();
  const rects = [];
  const clips = new Map();
  // Эффекты стройки и праздника считаются в единицах ракеты (как в прежнем хабе): 1 ед. = rocketScale px карты.
  const fx = createHubFx();
  const fxView = createMapView();
  const skyView = { left: 0, right: 0, top: 0, bottom: 0 };
  const unit = layout.pad.rocketScale;
  const lastReveal = new Map();
  const mood = {};
  const overlay = {};
  const [width, height] = layout.size;
  const camera = layout.camera;
  const minZoom = Number.isFinite(camera.minZoom) && camera.minZoom > 0 ? camera.minZoom : 1;
  const maxZoom = Math.max(minZoom, Number.isFinite(camera.maxZoom) && camera.maxZoom > 0 ? camera.maxZoom : 6);
  const home = pair(camera.home) ? camera.home : [width / 2, height / 2];
  const strip = layout.strip;
  /** Широкий экран: вся застройка в кадре (не мельче minZoom); узкий — крупный план стола, как прежде. */
  const homeZoom = () => {
    if (!strip || state.devW <= state.devH) return zoomLimit(camera.portraitZoom ?? 2.2);
    const z = Math.min(state.devW * 0.96 / ((strip.x1 - strip.x0) * state.fit),
      state.devH * 0.72 / ((strip.y1 - strip.y0) * state.fit));
    return zoomLimit(z);
  };
  const homeCenter = () => (strip && state.devW > state.devH
    ? center((strip.x0 + strip.x1) / 2, home[1]) : center(...home));
  const routes = { roads: layout.roads, origin: [0, 0], unitsPerPx: 1 };
  const state = { ready: false, cx: home[0], cy: home[1], tx: home[0], ty: home[1], zoom: 1, tz: 1,
    fit: 1, devW: 1, devH: 1, dpr: 1, time: null, selected: null, daylight: null, pending: null, hints: null };
  const zoomLimit = (z) => clamp(z, minZoom, maxZoom);
  const center = (x, y) => [clamp(x, 0, width), clamp(y, 0, height)];
  const scale = () => state.fit * state.zoom;

  function addRect(key, x, y, w, h) {
    rects.push({ key, x0: mv.sx(x - w / 2) / state.dpr, y0: mv.sy(y - h) / state.dpr,
      x1: mv.sx(x + w / 2) / state.dpr, y1: mv.sy(y) / state.dpr });
  }

  function startClip(key) {
    const spec = E0_BUILDING_CLIPS[key];
    if (spec && spec.sequence.every((i) => painter.has(`iso_${key}_1978${i > 0 ? `_on${i}` : ''}`))) {
      clips.set(key, state.time);
    }
  }

  /** Все места постройки на карте (пара маяков — два якоря). */
  function anchorsOf(b) {
    return [b.anchor, ...(Array.isArray(b.anchors) ? b.anchors.slice(1).filter(pair) : [])];
  }

  /** Рамки постройки для пыли и искр стройки, в единицах эффектов (y — низ спрайта). */
  function buildBoxes(key) {
    const b = layout.buildings[key];
    if (!b) return null;
    return anchorsOf(b).map(([x, y]) => ({ x: x / unit, y: y / unit, w: b.size[0] * 0.9 / unit, h: b.size[1] / unit }));
  }

  const hub = {
    mode: () => 'iso',
    buildDuration: BUILD_DURATION,
    get animating() { return clips.size > 0 || fx.active; },
    get selected() { return state.selected; },
    get view() { return { zoom: state.zoom, cx: state.cx, cy: state.cy, scale: scale() }; },
    /** Пульсирующие уголки вокруг объектов-входов (обучение); null — по флагу обучения в профиле. */
    setHints(on) { state.hints = on == null ? null : !!on; },
    /** Праздник новой эпохи: фейерверк над видимой частью карты и вспышка всех ламп. */
    playEra() { fx.playEra(); },
    /** Стройка: здание вырастает из лесов с пылью и искрами; клип ON — после того, как оно достроено. */
    playBuild(key) {
      if (layout.buildings[key]) { fx.playBuild(key); lastReveal.set(key, 0); } else startClip(key);
    },
    setDaylight(value) { state.daylight = value == null ? null : clamp(value, 0, 1); },
    setSelected(key) {
      if (key && key !== state.selected) startClip(key);
      state.selected = key || null;
    },
    /**
     * Подвести камеру к кадру полёта: стол в экранной точке (ax, feetY) px устройства, pxPerUnit — экранных px на
     * единицу мира. После этого первый кадр полёта совпадает с последним кадром базы.
     */
    matchPad(ax, feetY, pxPerUnit, immediate = false) {
      if (!state.ready || !(pxPerUnit > 0)) return;
      const z = zoomLimit(pxPerUnit / layout.pad.rocketScale / state.fit);
      const sc = state.fit * z;
      hub.focus({ x: layout.pad.x - (ax - state.devW / 2) / sc, y: layout.pad.y - (feetY - state.devH / 2) / sc, zoom: z }, immediate);
    },
    reset(immediate = false) {
      [state.tx, state.ty] = homeCenter();
      state.tz = homeZoom();
      if (immediate) { state.cx = state.tx; state.cy = state.ty; state.zoom = state.tz; }
    },
    pan(dxCss, dyCss = 0) {
      if (!state.ready) return;
      [state.cx, state.cy] = center(state.cx - dxCss * state.dpr / scale(), state.cy - dyCss * state.dpr / scale());
      state.tx = state.cx;
      state.ty = state.cy;
    },
    zoomBy(factor, xCss = state.devW / state.dpr / 2, yCss = state.devH / state.dpr / 2) {
      if (!state.ready || !Number.isFinite(factor) || factor <= 0) return;
      const dx = xCss * state.dpr - state.devW / 2;
      const dy = yCss * state.dpr - state.devH / 2;
      const x = state.cx + dx / scale();
      const y = state.cy + dy / scale();
      state.zoom = state.tz = zoomLimit(state.zoom * factor);
      [state.cx, state.cy] = center(x - dx / scale(), y - dy / scale());
      state.tx = state.cx;
      state.ty = state.cy;
    },
    toggleZoom(xCss = state.devW / state.dpr / 2, yCss = state.devH / state.dpr / 2) {
      if (!state.ready) return;
      if (state.tz > homeZoom() * 1.35) { hub.reset(); return; }
      hub.focus({ x: state.cx + (xCss * state.dpr - state.devW / 2) / scale(),
        y: state.cy + (yCss * state.dpr - state.devH / 2) / scale(), zoom: zoomLimit(state.zoom * 2.4) });
    },
    focus(target, immediate = false) {
      if (!state.ready) { state.pending = { target, immediate }; return; }
      let point = target;
      const building = layout.buildings[target];
      const entry = layout.entries[target];
      if (entry) {
        // как в прежнем хабе: в кадре ~380 ед. мира, чтобы рядом с объектом оставалось место для щитка
        const zoom = zoomLimit(Math.max(state.tz, state.devW / (380 * unit) / state.fit));
        // в портрете щиток встаёт над объектом: сам объект — ниже середины кадра
        const lift = state.devH > state.devW ? state.devH * 0.2 / (state.fit * zoom) : 0;
        point = { x: entry.anchor[0], y: entry.anchor[1] - entry.size[1] * 0.4 - lift, zoom };
      } else if (building) {
        point = { x: building.anchor[0], y: building.anchor[1] - building.size[1] * 0.4,
          zoom: Math.min(state.devW * 0.45 / building.size[0], state.devH * 0.55 / building.size[1]) / state.fit };
      } else if (target === 'rocket') {
        point = { x: layout.pad.x, y: layout.pad.y - stackHeight(pose.kind, painter.assets, pose.era) * layout.pad.rocketScale * 0.4,
          zoom: 2.4 };
      }
      if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
      [state.tx, state.ty] = center(point.x, point.y);
      state.tz = zoomLimit(Number.isFinite(point.zoom) ? point.zoom : state.tz);
      if (immediate) { state.cx = state.tx; state.cy = state.ty; state.zoom = state.tz; }
    },
    screenRects(key) { return rects.filter((r) => r.key === key).map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 })); },
    screenPos(key) {
      const r = rects.find((r) => r.key === key);
      return r ? { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 } : null;
    },
    hitTest(x, y) {
      // При перекрытии выбирается последний нарисованный объект; вне спрайта цель расширяется до 48 CSS px.
      for (let i = rects.length - 1; i >= 0; i--) {
        const r = rects[i];
        if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r.key;
      }
      let best = null;
      let distance = Infinity;
      for (const r of rects) {
        const dx = Math.abs(x - (r.x0 + r.x1) / 2) / Math.max(24, (r.x1 - r.x0) / 2);
        const dy = Math.abs(y - (r.y0 + r.y1) / 2) / Math.max(24, (r.y1 - r.y0) / 2);
        if (dx <= 1 && dy <= 1 && dx * dx + dy * dy < distance) {
          best = r.key; distance = dx * dx + dy * dy;
        }
      }
      return best;
    },
    draw(ctx, params) {
      const { profile, time, layout: screen } = params;
      if (shared) shared.profile = profile;
      const changed = state.devW !== ctx.canvas.width || state.devH !== ctx.canvas.height;
      state.devW = ctx.canvas.width;
      state.devH = ctx.canvas.height;
      state.dpr = state.devW / screen.w;
      state.fit = Math.min(state.devW * 0.98 / width, state.devH * 0.88 / height);
      if (!state.ready) { state.ready = true; hub.reset(true); }
      else if (changed) {
        [state.cx, state.cy] = center(state.cx, state.cy);
      }
      if (state.pending) {
        const pending = state.pending; state.pending = null;
        hub.focus(pending.target, pending.immediate);
      }
      const dt = state.time === null ? 0 : clamp(time - state.time, 0, 0.1);
      state.time = time;
      state.zoom = damp(state.zoom, state.tz, 7, dt);
      state.cx = damp(state.cx, state.tx, 7, dt);
      state.cy = damp(state.cy, state.ty, 7, dt);
      mv.set(state.devW / 2 - state.cx * scale(), state.devH / 2 - state.cy * scale(), scale(), state.devW, state.devH);
      if (params.selected !== undefined) hub.setSelected(params.selected);
      const reduce = !!params.settings?.reduceMotion;
      const owned = profile?.buildings || {};
      const era = clamp(profile?.era | 0, 0, 5);
      fxView.set(mv.ox, mv.oy, mv.s * unit, state.devW, state.devH);
      // залпы фейерверка — ниже верхней панели интерфейса
      skyView.left = fxView.left;
      skyView.right = fxView.right;
      skyView.bottom = fxView.bottom;
      skyView.top = fxView.top + (fxView.bottom - fxView.top) * 0.12;
      fx.update(dt, reduce, buildBoxes, skyView);
      for (const [key, before] of lastReveal) {
        const reveal = fx.buildState(key, reduce)?.reveal ?? 1;
        if (before < 1 && reveal >= 1) { startClip(key); lastReveal.delete(key); } else lastReveal.set(key, reveal);
      }
      rects.length = 0;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      weatherMood(params.weather, mood);
      drawSea(ctx, mv, time, mood);
      painter.sprite(ctx, mv, 'island_base_iso', 0, 0, { w: width, h: height, ax: 0, ay: 0, smooth: true });
      // Без roads машин нет; их координаты уже в пикселях новой карты.
      const count = layout.roads.length ? Math.min(3, 1 + Math.floor(Object.keys(owned).filter((k) => owned[k] > 0).length / 3)) : 0;
      drawVehicles(ctx, mv, time, count, routes);
      for (const item of isoDrawItems(layout, owned, painter.assets)) {
        const { key } = item;
        if (key === 'rocket') {
          const pad = layout.pad;
          rocketView.set(mv.sx(pad.x), mv.sy(pad.y), mv.s * pad.rocketScale, state.devW, state.devH);
          Object.assign(pose, { x: 0, y: 0, angle: 0, era, kind: profile?.parts?.booster > 0 ? 'booster' : 'core',
            throttle: 0, atmo: 1, skin: profile?.skin || 'classic', visible: true });
          // У прежнего ядра опоры ниже опорной точки; нижний пиксель также ставим на стол.
          const feet = nozzleOffset(pose.kind, painter.assets, era);
          pose.y = -feet;
          drawRocket(ctx, painter, rocketView, pose, time);
          const h = stackHeight(pose.kind, painter.assets, era) + feet;
          addRect(key, pad.x, pad.y + 4 * pad.rocketScale, 36 * pad.rocketScale, (h + 4) * pad.rocketScale);
        } else if (item.entry) {
          const e = layout.entries[key];
          painter.sprite(ctx, mv, `iso_entry_${key}_1978`, ...e.anchor, { w: e.size[0], h: e.size[1], ax: 0.5, ay: 1, smooth: true });
          addRect(key, ...e.anchor, ...e.size);
        } else {
          const b = layout.buildings[key];
          let name = `iso_${key}_1978`;
          const start = clips.get(key);
          const clip = E0_BUILDING_CLIPS[key];
          if (clips.has(key)) {
            const frame = Math.floor((time - (start ?? time)) * clip.fps);
            if (reduce || owned[key] !== 1 || frame >= clip.sequence.length) clips.delete(key);
            else {
              if (start == null) clips.set(key, time);
              const i = clip.sequence[Math.max(0, frame)];
              // без изометрического кадра клипа остаётся статичный спрайт (иначе здание мигало бы пустотой)
              if (i > 0 && painter.assets.has(`${name}_on${i}`)) name += `_on${i}`;
            }
          }
          const build = fx.buildState(key, reduce);
          // повторы того же объекта (пара маяков по сторонам стола): anchors[1..]
          for (const [x, y] of anchorsOf(b)) {
            if (build && build.reveal < 1) {
              // стройка: здание вырастает снизу вверх — видна только нижняя часть спрайта
              ctx.save();
              ctx.beginPath();
              const top = mv.sy(y - b.size[1] * build.reveal);
              ctx.rect(mv.sx(x - b.size[0]), top, mv.sx(x + b.size[0]) - mv.sx(x - b.size[0]), mv.sy(y) + 8 - top);
              ctx.clip();
              painter.sprite(ctx, mv, name, x, y, { w: b.size[0], h: b.size[1], ax: 0.5, ay: 1, smooth: true });
              ctx.restore();
            } else {
              painter.sprite(ctx, mv, name, x, y, { w: b.size[0], h: b.size[1], ax: 0.5, ay: 1, smooth: true });
            }
            if (build) {
              drawScaffold(ctx, fxView, { x: x / unit, y: y / unit, w: b.size[0] * 0.9 / unit, h: b.size[1] / unit },
                build.reveal, build.scaffold, time);
            }
            addRect(key, x, y, ...b.size);
          }
        }
      }
      fx.draw(ctx, fxView, 0);
      const daylight = params.daylight ?? state.daylight ?? daylightAt(time);
      dayOverlay(daylight, overlay);
      if (overlay.a > 0.01) {
        ctx.fillStyle = `rgba(${overlay.r},${overlay.g},${overlay.b},${overlay.a})`;
        ctx.fillRect(0, 0, state.devW, state.devH);
      }
      // ночью и в праздник эпохи загораются лампы построек (аддитивно поверх затемнения)
      const lightStrength = Math.max(lightsAt(daylight), fx.eraPulse * 0.9);
      if (lightStrength > 0.03) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        drawLamps(ctx, mv, layout, owned, profile, time, lightStrength, (key) => (layout.entries[key]
          ? (painter.has(`iso_entry_${key}_1978`) ? 1 : 0)
          : fx.buildState(key, reduce)?.reveal ?? 1));
        ctx.restore();
      }
      drawHeadlights(ctx, mv, time, count, 1 - daylight, routes);
      fx.draw(ctx, fxView, 1);
      const hints = state.hints ?? !!(profile?.settings?.tutorial && !profile.settings.tutorial.done);
      if (hints) {
        for (const r of rects) {
          if (!layout.entries[r.key]) continue;
          const d = state.dpr;
          drawEntryHint(ctx, { x0: r.x0 * d, y0: r.y0 * d, x1: r.x1 * d, y1: r.y1 * d }, time, mv.s);
        }
      }
      const selected = rects.find((r) => r.key === state.selected);
      if (selected) {
        ctx.strokeStyle = '#efc263';
        ctx.lineWidth = 2 * state.dpr;
        ctx.strokeRect(selected.x0 * state.dpr - 4, selected.y0 * state.dpr - 4,
          (selected.x1 - selected.x0) * state.dpr + 8, (selected.y1 - selected.y0) * state.dpr + 8);
      }
      for (const key of clips.keys()) if (!(owned[key] > 0) || !layout.buildings[key]) clips.delete(key);
      ctx.restore();
    },
  };
  return hub;
}
