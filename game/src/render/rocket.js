// Ракета: стек ступеней по эпохе, пламя по тяге и высоте, РСУ, парашют, оторванные ступени.
// Опорная точка (x, y) — низ ступени (сопло/опоры); ось Y вниз, угол 0 — нос вверх.

import { spriteName } from './manifest.js';
import { clamp, lerp, smoothstep } from './util.js';

export const ROCKET_SIZE = {
  coreH: 72,
  boosterH: 36,
  capsuleH: 35,
  boosterOverlap: 4, // ядро заходит в верхушку разгонного блока
  coreFeetDrop: 2, // опоры ядра чуть ниже опорной точки
  canopyW: 88,
  canopyLift: 64,
  packW: 24,
};

// Номинальный стек: 28 + 52 + 27 - 2 × 1,5 = 104, как прежний booster + core.
// Для нового арта высоты считаются по PNG при общей ширине STACK_W.
// Все три PNG стека одной ширины холста (корпус 120 px на холсте 146 px), поэтому STACK_W задаёт и толщину корпуса.
export const STACK_W = 24;
export const STACK_H = Object.freeze({ booster: 28, core: 52, capsule: 27 });
export const STACK_OVERLAP = 1.5;
// Глубина стыка в пикселях PNG: на сколько часть, стоящая выше, утоплена в эту. Сопло ядра (28 px) уходит в открытую
// юбку разгонного блока целиком, поэтому до отделения его не видно; кабина садится на ядро встык.
export const STACK_JOINT_PX = Object.freeze({ booster: 36, core: 4 });

/** Цельный стек включается только при наличии всех трёх частей одной эпохи. */
export function stackGeometry(assets, era = 0) {
  const geometry = {};
  for (const base of Object.keys(STACK_H)) {
    const name = spriteName(`stack_${base}`, era);
    const asset = assets?.get(name);
    if (!asset || !(asset.w > 0 && asset.h > 0)) return null;
    const k = STACK_W / asset.w; // мировых единиц на пиксель PNG
    const joint = STACK_JOINT_PX[base] !== undefined ? STACK_JOINT_PX[base] * k : STACK_OVERLAP;
    geometry[base] = { name, w: STACK_W, h: asset.h * k, joint };
  }
  return geometry;
}

export const SKIN_HUE = Object.freeze({ classic: 0, wasp: 45, arctic: 170, cosmos: 270 });

/**
 * Посадочные опоры по уровню модуля «Опоры» (E0, спрайты rocket/leg1..3.png — левая опора; правая — зеркально).
 * h — высота спрайта в единицах мира, hinge — шарнир (доли спрайта от левого верхнего угла). В раскрытом виде низ
 * опоры стоит на уровне среза сопла (опорная точка ракеты), в сложенном — опора повёрнута вверх вдоль корпуса.
 */
export const LEG_SPRITES = Object.freeze([
  null,
  { name: 'rocket_leg1_1978', h: 16, hinge: [0.89, 0.08] },
  { name: 'rocket_leg2_1978', h: 18, hinge: [0.86, 0.08] },
  { name: 'rocket_leg3_1978', h: 22, hinge: [0.85, 0.09] },
]);
const LEG_STOW = (140 * Math.PI) / 180; // угол складывания вокруг шарнира
const BODY_HALF = (STACK_W * 120) / 146 / 2; // половина ширины корпуса: холст 146 px, корпус 120 px

/** Спрайт опор уровня level, если он есть в ассетах (иначе null — ракета садится на срез сопла, как прежде). */
export function legSprite(level, assets) {
  const spec = LEG_SPRITES[clamp(level | 0, 0, LEG_SPRITES.length - 1)];
  return spec && assets?.get(spec.name) ? spec : null;
}

/**
 * Пара опор у опорной точки (0, 0) текущей трансформации ctx; s — пикселей устройства на единицу, deploy 0..1.
 * blit(asset, sx, sy, w, h, ax, ay, opts) рисует спрайт (у полёта — painter.blit с видом, у сборки — blitDev).
 */
export function drawLegPair(spec, asset, s, deploy, blit, alpha = 1) {
  const h = spec.h;
  const w = (h * asset.w) / asset.h;
  const [hx, hy] = spec.hinge;
  const e = clamp(deploy, 0, 1);
  // сложенные опоры убраны за обшивку: видны только пока раскрываются и раскрытые
  if (e < 0.04) return;
  const k = e * e * (3 - 2 * e);
  const hingeY = -h * (1 - hy);
  for (const side of [-1, 1]) {
    blit(asset, Math.round(side * (BODY_HALF - 0.6) * s), Math.round(hingeY * s), w, h, hx, hy, {
      angle: -side * LEG_STOW * (1 - k), flipX: side > 0, alpha, smooth: false,
    });
  }
}

/** Сопло кабины для полёта одной кабиной (E0): спрайт rocket/nozzle_capsule.png, если есть. */
function capsuleNozzle(assets, era) {
  if ((era | 0) !== 0) return null;
  const asset = assets?.get('rocket_nozzle_capsule_1978');
  if (!asset || !(asset.w > 0)) return null;
  const k = STACK_W / 146; // та же плотность, что у ступеней
  return { name: 'rocket_nozzle_capsule_1978', w: asset.w * k, h: asset.h * k, joint: 1 };
}

/** Какая часть ракеты сейчас активна: 'booster' (разгонный блок + ядро), 'core' или 'capsule'. */
export function activeKind(stageIds, stageIndex) {
  const id = stageIds && stageIds[Math.min(stageIndex | 0, stageIds.length - 1)];
  if (id === 'booster' || id === 'capsule') return id;
  return 'core';
}

/** Детали стека снизу вверх: { base: 'booster'|'core'|'capsule', h, bottom } (bottom — локальная y низа, вверх отрицательна). */
export function stackParts(kind, assets, era = 0) {
  const geometry = stackGeometry(assets, era);
  if (geometry) {
    const bases = kind === 'capsule' ? ['capsule'] : kind === 'core' ? ['core', 'capsule'] : ['booster', 'core', 'capsule'];
    let bottom = 0;
    const out = [];
    // кабина после отделения летит на своём сопле: оно внизу, кабина стоит на его фланце
    const nozzle = kind === 'capsule' ? capsuleNozzle(assets, era) : null;
    if (nozzle) {
      out.push({ base: 'nozzle', ...nozzle, bottom });
      bottom -= nozzle.h - nozzle.joint;
    }
    // Без купленной кабины этот же нос служит обтекателем, поэтому он всегда виден.
    for (const base of bases) {
      const part = { base, ...geometry[base], bottom };
      bottom -= part.h - part.joint;
      out.push(part);
    }
    return out;
  }
  if (kind === 'booster') {
    return [
      { base: 'booster', h: ROCKET_SIZE.boosterH, bottom: 0 },
      { base: 'core', h: ROCKET_SIZE.coreH, bottom: -(ROCKET_SIZE.boosterH - ROCKET_SIZE.boosterOverlap) },
    ];
  }
  if (kind === 'capsule') return [{ base: 'capsule', h: ROCKET_SIZE.capsuleH, bottom: 0 }];
  return [{ base: 'core', h: ROCKET_SIZE.coreH, bottom: ROCKET_SIZE.coreFeetDrop }];
}

export function stackHeight(kind, assets, era = 0) {
  const parts = stackParts(kind, assets, era);
  const top = parts[parts.length - 1];
  return -(top.bottom - top.h);
}

/** Смещение сопла от опорной точки вдоль оси ракеты (вниз положительно). */
export function nozzleOffset(kind, assets, era = 0) {
  if (stackGeometry(assets, era)) return 0;
  return kind === 'core' ? ROCKET_SIZE.coreFeetDrop : 0;
}

const FLAME_PALETTES = [
  { outer: '#e4753f', mid: '#f4a64a', core: '#ffe1a0', glow: '255,160,80' },
  { outer: '#e4753f', mid: '#f4a64a', core: '#ffe1a0', glow: '255,160,80' },
  { outer: '#e86a3a', mid: '#ffb85a', core: '#fff0c0', glow: '255,170,90' },
  { outer: '#e86a3a', mid: '#ffb85a', core: '#fff0c0', glow: '255,170,90' },
  { outer: '#4aa8e8', mid: '#8fe0ff', core: '#ecfbff', glow: '110,200,255' },
  { outer: '#4aa8e8', mid: '#8fe0ff', core: '#ecfbff', glow: '110,200,255' },
];

/**
 * Параметры пламени: длина и полуширина в единицах мира.
 * В атмосфере — короткий широкий факел, в вакууме — длинная тонкая струя.
 */
export function flameShape(throttle, atmo, boost, kind) {
  const scale = kind === 'capsule' ? 0.55 : 1;
  const vac = 1 - clamp(atmo, 0, 1);
  const length = scale * (4 + 28 * throttle) * lerp(1, 1.45, vac) * (boost ? 1.35 : 1);
  const half = scale * lerp(2.6, 5.4, clamp(atmo, 0, 1)) * (0.55 + 0.45 * throttle) * (boost ? 1.2 : 1);
  return { length, half };
}

/** Описание отрисовываемой ракеты; один объект переиспользуется, чтобы не создавать мусор. */
export function createRocketPose() {
  return {
    x: 0,
    y: 0,
    angle: 0,
    era: 0,
    kind: 'core',
    throttle: 0,
    atmo: 1,
    boost: false,
    rcsLeft: 0,
    rcsRight: 0,
    legs: 0, // уровень модуля «Опоры»
    legDeploy: 0, // 0 — сложены вдоль корпуса, 1 — раскрыты (низ на уровне среза сопла)
    skin: 'classic',
    chute: 0, // 0..1 прогресс раскрытия
    chuteTime: 0, // секунды с момента раскрытия
    visible: true,
  };
}

/** Рисует ракету целиком (пламя, ступени, РСУ). Парашют рисуется отдельно, без поворота. */
export function drawRocket(ctx, painter, view, pose, time) {
  if (!pose.visible) return;
  const S = view.S;
  ctx.save();
  ctx.translate(view.sx(pose.x), view.sy(pose.y));
  if (pose.angle) ctx.rotate(pose.angle);
  if (pose.throttle > 0.02) drawFlame(ctx, view, pose, time, painter.assets);
  const hue = SKIN_HUE[pose.skin] || 0;
  // опоры за корпусом: шарниры прячутся под обшивкой
  const legs = stackGeometry(painter.assets, pose.era) ? legSprite(pose.legs, painter.assets) : null;
  if (legs) {
    drawLegPair(legs, painter.assets.get(legs.name), S, pose.legDeploy,
      (asset, sx, sy, w, h, ax, ay, opts) => painter.blit(ctx, view, asset, sx, sy, w, h, ax, ay, { ...opts, hue }));
  }
  const parts = stackParts(pose.kind, painter.assets, pose.era);
  // Нижняя юбка перекрывает стык и сопло верхней части.
  if (parts[0].name) parts.reverse();
  for (const part of parts) {
    const name = part.name || spriteName(part.base, pose.era);
    const asset = painter.assets.get(name);
    if (asset) {
      const uw = part.w ?? part.h * asset.w / asset.h;
      painter.blit(ctx, view, asset, 0, Math.round(part.bottom * S), uw, part.h, 0.5, 1, { hue });
    } else {
      fallbackBody(ctx, S, part);
    }
  }
  drawRcs(ctx, view, pose, time, painter.assets);
  ctx.restore();
}

function fallbackBody(ctx, S, part) {
  ctx.fillStyle = '#d9ddd2';
  ctx.fillRect(Math.round(-part.h * 0.2 * S), Math.round((part.bottom - part.h) * S), Math.round(part.h * 0.4 * S), Math.round(part.h * S));
}

function row(ctx, S, half, y, h, color) {
  const w = Math.max(1, Math.round(half * 2));
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(-w * S / 2), Math.round(y * S), Math.round(w * S), Math.max(1, Math.round(h * S)));
}

function drawFlame(ctx, view, pose, time, assets) {
  const S = view.S;
  const palette = FLAME_PALETTES[clamp(pose.era | 0, 0, 5)];
  const shape = flameShape(pose.throttle, pose.atmo, pose.boost, pose.kind);
  const flick = 1 + 0.12 * Math.sin(time * 43) + 0.05 * Math.sin(time * 71);
  const length = shape.length * flick;
  const origin = nozzleOffset(pose.kind, assets, pose.era);
  const vacuum = pose.atmo < 0.35;

  // Свечение у сопла: ярче при форсаже и тяге.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const glowR = (10 + 18 * pose.throttle + (pose.boost ? 10 : 0)) * S * lerp(0.6, 1, pose.atmo);
  const gy = (origin + 4) * S;
  const grad = ctx.createRadialGradient(0, gy, 0, 0, gy, glowR);
  grad.addColorStop(0, `rgba(${palette.glow},${0.45 * pose.throttle})`);
  grad.addColorStop(1, `rgba(${palette.glow},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(-glowR, gy - glowR, glowR * 2, glowR * 2);
  ctx.restore();

  const step = 2;
  for (let d = 0; d < length; d += step) {
    const taper = 1 - d / length;
    const wobble = 0.55 * Math.sin(time * 61 + d * 1.4);
    const half = Math.max(0.5, shape.half * taper + wobble);
    const y = origin + d;
    row(ctx, S, half, y, step, palette.outer);
    if (d < length * 0.8) row(ctx, S, half * 0.62, y, step, palette.mid);
    if (d < length * 0.55) row(ctx, S, Math.max(0.5, half * 0.32), y, step, palette.core);
  }
  if (vacuum && pose.throttle > 0.3) {
    // Ударные «алмазы» вдоль вакуумной струи.
    ctx.fillStyle = palette.core;
    for (let k = 1; k <= 3; k++) {
      const dy = origin + length * 0.22 * k;
      const pulse = 0.5 + 0.5 * Math.sin(time * 38 + k * 2);
      const w = Math.max(1, Math.round(shape.half * (1 - 0.22 * k) * (0.5 + 0.5 * pulse)));
      ctx.fillRect(-Math.round((w * S) / 2), Math.round(dy * S), Math.max(1, Math.round(w * S)), Math.max(1, Math.round(2 * S)));
    }
  }
}

/**
 * Рулевые (верньерные) струйки у низа активной ступени — там, где у ракеты сопла, а не на уровне окошка кабины
 * (замечание владельца 2026-11-13). Короткие клинья цвета пламени эпохи, косо вниз и в сторону, мигают по времени.
 */
function drawRcs(ctx, view, pose, time, assets) {
  if (pose.rcsLeft <= 0 && pose.rcsRight <= 0) return;
  const S = view.S;
  const palette = FLAME_PALETTES[clamp(pose.era | 0, 0, 5)];
  const geometry = stackGeometry(assets, pose.era);
  // низ активной ступени: опорная точка 0, струйки чуть выше среза сопла, у края корпуса
  const y = -(geometry ? 3 : 4) + (pose.kind === 'core' && !geometry ? ROCKET_SIZE.coreFeetDrop : 0);
  const x = (geometry ? STACK_W : 26) * 0.42;
  const len = 4 + 3 * Math.sin(time * 32) ** 2;
  for (const side of [-1, 1]) {
    const active = side < 0 ? pose.rcsLeft : pose.rcsRight;
    if (active <= 0) continue;
    for (const [color, k] of [[palette.outer, 1], [palette.core, 0.55]]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(side * x * S, (y - 1.2 * k) * S);
      ctx.lineTo(side * (x + len * k) * S, (y + len * 0.6 * k) * S);
      ctx.lineTo(side * x * S, (y + 1.2 * k) * S);
      ctx.closePath();
      ctx.fill();
    }
  }
}

/** Раскрытие купола 0..1 с небольшим перелётом в конце (купол «вздыхает»). */
export function canopyOpening(p) {
  const base = smoothstep(0, 0.75, p);
  const overshoot = 0.07 * Math.sin(clamp((p - 0.55) / 0.45, 0, 1) * Math.PI);
  return base + overshoot;
}

/**
 * Парашют: купол над ракетой, не поворачивается вместе с корпусом.
 * pose.chute — прогресс раскрытия 0..1, pose.chuteTime — время с раскрытия (качание).
 */
export function drawChute(ctx, painter, view, pose, time) {
  if (pose.chute <= 0.001 || !pose.visible) return;
  const p = clamp(pose.chute, 0, 1);
  const era = pose.era;
  const h = stackHeight(pose.kind, painter.assets, pose.era);
  const topX = pose.x + Math.sin(pose.angle) * h;
  const topY = pose.y - Math.cos(pose.angle) * h;
  const sway = Math.sin(time * 2.7) * 3 * p;
  const open = canopyOpening(p);
  const lift = ROCKET_SIZE.canopyLift * smoothstep(0, 0.8, p);
  const canopyY = topY - lift;
  const w = ROCKET_SIZE.canopyW * clamp(lerp(0.3, 1, open), 0.2, 1.12);
  const canopy = painter.assets.get(spriteName('canopy', era));
  const ratio = canopy ? canopy.h / canopy.w : 0.76;
  const hh = ROCKET_SIZE.canopyW * ratio * clamp(lerp(0.45, 1, open), 0.3, 1.08);
  const S = view.S;

  // Стропы от плеч ракеты к краям купола.
  ctx.save();
  ctx.strokeStyle = '#a7b3ba';
  ctx.lineWidth = Math.max(1, Math.round(view.px * 0.8));
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(view.sx(topX + side * 6), view.sy(topY));
    ctx.quadraticCurveTo(
      view.sx(topX + side * 18 + sway * 0.3),
      view.sy(topY - lift * 0.55),
      view.sx(topX + sway + side * w * 0.42),
      view.sy(canopyY + hh * 0.2),
    );
  }
  ctx.stroke();
  ctx.restore();

  const angle = Math.sin(time * 2.7) * 0.025 * p;
  const drawn = painter.sprite(ctx, view, spriteName('canopy', era), topX + sway, canopyY, { w, h: hh, angle });
  if (!drawn) {
    ctx.fillStyle = '#d9ddd2';
    ctx.beginPath();
    ctx.ellipse(view.sx(topX + sway), view.sy(canopyY), (w / 2) * S, hh * 0.5 * S, 0, Math.PI, 0);
    ctx.fill();
  }
  // Упаковка вылетает вверх в самом начале.
  if (p < 0.4) {
    const t = p / 0.4;
    painter.sprite(ctx, view, spriteName('pack', era), topX, topY - 10 - 30 * t, {
      w: ROCKET_SIZE.packW,
      alpha: 1 - t,
      angle: t * 1.2,
    });
  }
}
