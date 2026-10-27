// Полётный HUD как приборная панель: сегментное табло высоты, лента вертикальной скорости, светодиодные шкалы топлива и прочности,
// предупредительные лампы, шкала маршрута, пиксельный радар, рычаг тяги с фиксатором и диск-штурвал наклона.
// Геометрия — layout.hudLayout. Минимум подписей: числа, полоски и лампы.

import { t } from '../../i18n/index.js';
import { clamp, fmtAlt, fmtInt, fmtSpeed } from '../format.js';
import { centerCard } from '../layout.js';
import { tutorialHint, drawTutorialPointer } from './onboarding.js';
import { mix } from '../theme.js';
import * as inst from '../skin/instruments.js';

const DANGER_WARNS = ['brake', 'tilt', 'drift', 'hazard', 'chute-air', 'overheat', 'hull'];
const WARN_KEYS = { brake: 'hint.brake', tilt: 'hint.tilt', drift: 'hint.drift', hazard: 'hint.hazard', 'chute-air': 'hint.chuteAir', overheat: 'hint.overheat', hull: 'hint.hull' };
const WARN_ICON = { brake: 'up', tilt: 'target', drift: 'wind', hazard: 'warn', 'chute-air': 'chute', overheat: 'boost', hull: 'shield' };
const KEY_LEGEND = [
  { keys: ['W', '↑'], label: 'legend.thrust' },
  { keys: ['A', 'D'], label: 'legend.tilt' },
  { keys: ['_'], label: 'legend.boost' },
  { keys: ['X'], label: 'legend.chute' },
  { keys: ['P'], label: 'legend.pause' },
];

export default {
  id: 'flight',
  background: 'flight',
  enter(app) {
    app.ui.flightHud = { confirm: false };
  },
  onBack(app) {
    if (app.session?.paused) app.resume();
    return true;
  },
  draw(app, kit, L, dt) {
    const s = app.session;
    if (!s) {
      app.go('hub');
      return;
    }
    const f = s.flight;
    const hud = L.hud;
    const touch = app.touchUi;
    app.hudTargets = {};

    drawFlash(app, kit, L, s);
    drawInstruments(app, kit, L, s, f, hud);
    const hasRadar = f.cfg.base.radar > 0;
    drawStrip(app, kit, L, f, hud, hasRadar ? hud.radar : null);
    if (hasRadar) drawRadar(app, kit, L, f, hud);
    drawPredict(app, kit, L, f);
    const hint = tutorialHint(app, s);
    drawHint(app, kit, L, s, f, hud, hint);
    drawControls(app, kit, L, s, f, hud, touch);
    if (!touch) drawLegend(app, kit, L, s, hud);
    drawTutorialPointer(app, kit, L, hint);
    if (s.paused) drawPause(app, kit, L);
    void dt;
  },
};

// ---------- тревожная рамка ----------

function drawFlash(app, kit, L, s) {
  const ctx = kit.S.ctx;
  const cc = kit.cell();
  // тревога (мало топлива, столкновение, опасность): красные ступенчатые полосы по краям, дубль звукового сигнала
  if (app.time < s.alarmUntil) {
    const k = Math.min(1, (s.alarmUntil - app.time) / 0.4);
    const pulse = app.settings.reduceMotion ? 0.7 : Math.floor(app.time * 7) % 2 === 0 ? 0.8 : 0.35;
    const e = cc * 5;
    ctx.globalAlpha = 0.55 * k * pulse;
    ctx.fillStyle = kit.c.red;
    ctx.fillRect(0, 0, L.w, e);
    ctx.fillRect(0, L.h - e, L.w, e);
    ctx.fillRect(0, 0, e, L.h);
    ctx.fillRect(L.w - e, 0, e, L.h);
    ctx.globalAlpha = 1;
  }
  if (s.flash <= 0 || app.settings.reduceMotion) return;
  ctx.globalAlpha = s.flash * 0.3;
  ctx.fillStyle = kit.c.gold;
  const e = cc * 3;
  ctx.fillRect(0, 0, L.w, e);
  ctx.fillRect(0, L.h - e, L.w, e);
  ctx.fillRect(0, 0, e, L.h);
  ctx.fillRect(L.w - e, 0, e, L.h);
  ctx.globalAlpha = 1;
}

// ---------- приборы ----------

function drawInstruments(app, kit, L, s, f, hud) {
  const c = kit.c;
  const I = hud.instruments;
  const u = L.ui;

  // высота: прибор эпохи (барабанный счётчик, светодиодное табло, плоский индикатор…), лампа тревоги слева
  const alt = fmtAlt(f.alt);
  const unit = t(alt.unit === 'km' ? 'unit.km' : 'unit.m');
  const alarm = app.time < s.alarmUntil || DANGER_WARNS.some((k) => s.warn[k] !== undefined && app.time - s.warn[k] < 1.2);
  const zones = (app.mods.sim.ZONES?.[f.body] || []).filter((z) => z.from > f.alt);
  inst.altitude(kit, I.alt, f, { alt, unit, alarm, meters: Math.max(0, f.alt) * 10, nextZone: zones.length ? zones[0].from * 10 : 0 });

  // вертикальная скорость: число и лента или стрелка; красная зона — быстрее допуска посадки
  const climb = f.climb ?? -f.vy;
  const falling = f.vy > 0 && f.liftedOff;
  const tol = f.landing?.vTol ?? 0;
  const danger = falling && f.alt < 400 && tol > 0 && f.vy > tol;
  const vcol = danger ? c.red : falling ? c.amber : c.green;
  inst.vspeed(kit, I.vspeed, { climb, tol, vcol, numStr: fmtSpeed(climb) });

  // монеты: табличка с числом
  kit.plate(I.coins.x, I.coins.y, I.coins.w, I.coins.h, 'coin', f.coins, c.gold);

  // топливо активной ступени и прочность; ниже порога значок заменяется мигающей красной лампой
  const fuel01 = f.maxFuel > 0 ? f.fuel / f.maxFuel : 0;
  const hull01 = f.maxHp > 0 ? f.hp / f.maxHp : 0;
  const st = f.stages?.length > 1 ? `${f.stageIndex + 1}/${f.stages.length}` : '';
  const bar = (r, v, color, iconName, caption, lowAt) => {
    const vertical = r.h > r.w;
    const low = v <= lowAt;
    if (vertical) {
      inst.gauge(kit, r, v, color, lowAt);
      const iy = r.y - Math.round(13 * u);
      if (low) kit.lamp(r.x + r.w / 2, iy, Math.round(16 * u), c.red, true, true);
      else kit.icon(iconName, r.x + r.w / 2, iy, Math.round(18 * u), color);
      if (caption) kit.drawText(caption, r.x, r.y + r.h + Math.round(10 * u), { size: kit.fs(10), color: c.textDim });
    } else {
      const shift = Math.round(r.h * 1.5);
      inst.gauge(kit, { x: r.x + shift, y: r.y, w: r.w - shift, h: r.h }, v, color, lowAt);
      if (low) kit.lamp(r.x + shift / 2, r.y + r.h / 2, Math.round(r.h * 0.9), c.red, true, true);
      else kit.icon(iconName, r.x + shift / 2, r.y + r.h / 2, Math.round(r.h * 1.1), color);
    }
  };
  bar(I.fuel, fuel01, c.green, 'fuel', st, 0.2);
  bar(I.hull, hull01, c.cyan, 'shield', '', 0.3);
}

/** Горизонтальная лента от нуля: вправо — набор высоты, влево — спуск; белая риска — допуск посадки. */
function drawRibbon(kit, r, climb, tol, color) {
  const c = kit.c;
  const cc = kit.cell();
  const n = 15;
  const mid = (n - 1) / 2;
  const gap = cc;
  const w = Math.max(cc, Math.floor((r.w - gap * (n - 1)) / n));
  const total = w * n + gap * (n - 1);
  const x0 = Math.round(r.x + (r.w - total) / 2);
  const full = Math.max(tol * 3, 20);
  const k = clamp(Math.abs(climb) / full, 0, 1);
  const lit = Math.round(k * mid);
  const dir = climb >= 0 ? 1 : -1;
  const tolCells = Math.round(clamp(tol / full, 0, 1) * mid);
  for (let i = 0; i < n; i++) {
    const off = i - mid;
    const on = off === 0 || (Math.sign(off) === dir && Math.abs(off) <= lit);
    const isTol = Math.abs(off) === tolCells && off < 0;
    kit.rect(x0 + i * (w + gap), r.y, w, r.h, on ? color : isTol ? c.steel1 : c.navy2);
    if (isTol) kit.rect(x0 + i * (w + gap), r.y - cc, w, cc, c.white);
  }
}

// ---------- шкала маршрута ----------

/** Вертикальная шкала приборов: засечки рубежей, пройденные горят янтарём; указатель — пиксельный треугольник. */
function drawStrip(app, kit, L, f, hud, radar) {
  const r = hud.strip;
  if (r.h < 40) return;
  const c = kit.c;
  const cc = kit.cell();
  const zones = (app.mods.sim.ZONES?.[f.body] || []).filter((z) => z.from > 0);
  if (!zones.length) return;
  const top = zones[zones.length - 1].from * 1.12;
  const inner = { x: r.x + cc * 2, y: r.y + cc * 2, w: r.w - cc * 4, h: r.h - cc * 4 };
  const pos = (alt) => inner.y + inner.h - Math.sqrt(clamp(alt / top, 0, 1)) * inner.h;
  kit.nine('screen', r.x, r.y, r.w, r.h);
  // нижняя часть шкалы, пройденная ракетой, подсвечена
  const py = Math.round(pos(f.alt));
  kit.rect(inner.x + cc, py, inner.w - cc * 2, inner.y + inner.h - py, c.navy2);
  for (const z of zones) {
    const y = Math.round(pos(z.from));
    const passed = f.maxAlt >= z.from;
    kit.rect(inner.x, y, inner.w, cc, passed ? c.amber : c.steel1);
  }
  // указатель слева от шкалы: ступенчатый треугольник
  for (let i = 0; i < 4; i++) kit.rect(r.x - cc * (4 - i) - cc, py - cc * (3 - i), cc * 2, cc * (3 - i) * 2 + cc, c.white);
  // подпись ближайшего рубежа слева от шкалы
  const next = zones.find((z) => z.from > f.alt);
  if (next && !L.portrait) {
    const key = `zone.${next.id}`;
    const name = t(key) === key ? next.id : t(key);
    const size = kit.fs(10);
    const tw = Math.min(kit.text.measure(name, size), r.x - L.gap * 2 - L.area.x);
    let ly = Math.max(r.y + 8, pos(next.from) - 8);
    if (radar) {
      const hitsRadar = ly > radar.cy - radar.r - 8 && ly < radar.cy + radar.r + 8 && r.x - L.gap - tw < radar.cx + radar.r + 4;
      if (hitsRadar) ly = radar.cy + radar.r + 14;
    }
    if (ly < r.y + r.h - 4) kit.drawText(name, r.x - L.gap - cc * 4, ly, { size, color: c.textDim, align: 'right', shadow: true, maxWidth: tw });
  }
}

// ---------- радар ----------

function drawRadar(app, kit, L, f, hud) {
  const R = hud.radar;
  const cc = kit.cell();
  if (['analog', 'led', 'digital'].includes(kit.S.skin.instr)) {
    // радар эпох ЭЛТ — круглая развёртка на квадратном экране с корпусом
    const box = { x: Math.round(R.cx - R.r - cc), y: Math.round(R.cy - R.r - cc), w: Math.round(R.r * 2 + cc * 2), h: Math.round(R.r * 2 + cc * 2) };
    kit.nine('raised', box.x - cc * 2, box.y - cc * 2, box.w + cc * 4, box.h + cc * 4);
    kit.screen('hud-radar', box, () => drawRadarFace(app, kit, L, f, hud));
    return;
  }
  drawRadarFace(app, kit, L, f, hud);
}

function drawRadarFace(app, kit, L, f, hud) {
  const c = kit.c;
  const cc = kit.cell();
  const R = hud.radar;
  const range = 350 + 900 * f.cfg.base.radar;
  kit.ring(R.cx, R.cy, R.r, R.r, c.ink);
  kit.ring(R.cx, R.cy, R.r - cc * 2, R.r - cc * 2, c.navy0);
  kit.ring(R.cx, R.cy, (R.r - cc * 2) * 0.62, cc, c.navy2);
  kit.ring(R.cx, R.cy, (R.r - cc * 2) * 0.3, cc, c.navy2);
  kit.rect(Math.round(R.cx - R.r + cc * 3), Math.round(R.cy), Math.round(R.r * 2 - cc * 6), cc, c.navy2);
  kit.rect(Math.round(R.cx), Math.round(R.cy - R.r + cc * 3), cc, Math.round(R.r * 2 - cc * 6), c.navy2);
  if (!app.settings.reduceMotion) {
    const a = (app.time * 2.4) % (Math.PI * 2);
    kit.line(R.cx, R.cy, R.cx + Math.cos(a) * (R.r - cc * 3), R.cy + Math.sin(a) * (R.r - cc * 3), c.cyanDark);
  }
  const dot = cc * 2;
  const plot = (x, alt, color, shape = 'sq') => {
    const px = R.cx + ((x - f.x) / range) * R.r;
    const py = R.cy - ((alt - f.alt) / range) * R.r;
    if ((px - R.cx) ** 2 + (py - R.cy) ** 2 > (R.r - cc * 3) ** 2) return;
    const x0 = Math.round(px / cc) * cc;
    const y0 = Math.round(py / cc) * cc;
    if (shape === 'ring') {
      kit.rect(x0 - dot, y0 - dot, dot * 2 + cc, cc, color);
      kit.rect(x0 - dot, y0 + dot, dot * 2 + cc, cc, color);
      kit.rect(x0 - dot, y0 - dot, cc, dot * 2 + cc, color);
      kit.rect(x0 + dot, y0 - dot, cc, dot * 2 + cc, color);
    } else if (shape === 'tri') {
      kit.rect(x0, y0 - dot, cc, cc, color);
      kit.rect(x0 - cc, y0 - cc, cc * 3, cc, color);
      kit.rect(x0 - dot, y0, dot * 2 + cc, cc, color);
    } else kit.rect(x0, y0, dot, dot, color);
  };
  for (const o of f.objects || []) {
    if (!o.active) continue;
    if (o.hazard) plot(o.x, -o.y, c.red, 'tri');
    else if (o.kind === 'coin') plot(o.x, -o.y, c.gold);
    else if (o.kind === 'fuel') plot(o.x, -o.y, c.green);
    else if (o.kind === 'repair') plot(o.x, -o.y, c.white);
    else if (o.kind === 'ring') plot(o.x, -o.y, c.cyan, 'ring');
  }
  if (f.pad) plot(f.pad.x, 0, c.amber, 'tri');
  kit.rect(Math.round(R.cx - cc), Math.round(R.cy - cc), cc * 2, cc * 2, c.white);
  kit.ring(R.cx, R.cy, R.r, cc * 2, c.steel1);
}

// ---------- прогноз посадки (авионика) ----------

function drawPredict(app, kit, L, f) {
  const pr = f.predict;
  const proj = app.renderer.flight?.project;
  if (!pr || !proj) return;
  let prev = null;
  pr.points.forEach(([x, y]) => {
    const p = proj(x, y);
    if (!p) {
      prev = null;
      return;
    }
    if (prev) kit.line(prev.x, prev.y, p.x, p.y, kit.c.amber, { dash: true });
    prev = p;
  });
}

// ---------- подсказки ----------

function pickHint(app, s, f, tut) {
  const now = app.time;
  const out = [];
  for (const kind of DANGER_WARNS) {
    if (s.warn[kind] !== undefined && now - s.warn[kind] < 2.4) out.push({ pri: 3, key: `w:${kind}`, text: t(WARN_KEYS[kind]), icon: WARN_ICON[kind], kind: 'bad' });
  }
  for (const [type, cue] of Object.entries(s.cues || {})) {
    if (now - cue.at < 2.2) out.push({ pri: cue.pri ?? 2, key: `cue:${type}:${cue.at}`, text: cue.text, icon: cue.icon, kind: cue.kind });
  }
  if (tut) out.push({ pri: 2, key: `tut:${tut.text}`, text: tut.text, icon: tut.icon, kind: 'tip' });
  if (f.canTransfer) out.push({ pri: 2, key: 'transfer', text: app.touchUi ? t('hint.transfer.touch') : t('hint.transfer'), icon: 'transfer', kind: 'good' });
  if (f.lowFuel >= 1 && f.fuelTotal > 0) out.push({ pri: 1, key: 'lowfuel', text: t('hint.lowFuel'), icon: 'fuel', kind: 'bad' });
  if (f.liftedOff && f.vy > 20 && f.alt < 380 && f.fuelTotal <= 0.01 && !f.chute.deployed && f.chute.consumable) out.push({ pri: 3, key: 'chute', text: t('hint.chute'), icon: 'chute', kind: 'bad' });
  // ветер: боковое ускорение weather.push (знак — направление, + вправо); прогноз weather.forecast — если открыт
  const w = f.weather;
  const push = w ? w.push || 0 : 0;
  if (Math.abs(push) > 3 && f.liftedOff) out.push({ pri: 1, key: `wind${Math.sign(push)}`, text: t(push > 0 ? 'hint.wind.right' : 'hint.wind.left'), icon: push > 0 ? 'arrow' : 'back', kind: 'tip' });
  const fc = w?.forecast;
  if (fc && f.liftedOff) {
    const soon = Math.ceil(fc.in);
    const front = fc.kind !== w.kind && fc.in > 0 && fc.in <= 20 && ['storm', 'dust', 'rain'].includes(fc.kind);
    const windSoon = fc.windIn > 0 && fc.windIn <= 12 && Math.abs(fc.wind) >= 3 && Math.sign(fc.wind || fc.windDir) !== Math.sign(w.windDir || 1);
    if (front) out.push({ pri: 0.9, key: `fc:${fc.kind}`, text: t(`hint.forecast.${fc.kind}`, { n: soon }), icon: 'wind', kind: 'tip' });
    else if (windSoon) out.push({ pri: 0.8, key: `fcw:${fc.windDir}`, text: t(fc.windDir > 0 ? 'hint.forecast.wind.right' : 'hint.forecast.wind.left', { n: Math.ceil(fc.windIn) }), icon: fc.windDir > 0 ? 'arrow' : 'back', kind: 'tip' });
  }
  // упор ограничителя наклона: раз за полёт подсказываем, что углом управляют маневровые (стабилизаторы)
  const lim = tiltLimit(f);
  if (lim !== null && f.liftedOff) {
    if (s.tiltHintAt === undefined && Math.abs(f.angle) >= lim * 0.95) s.tiltHintAt = now;
    if (s.tiltHintAt !== undefined && now - s.tiltHintAt < 2.4) out.push({ pri: 2.5, key: 'tiltlimit', text: t('hint.tiltLimit'), icon: 'fins', kind: 'tip' });
  }
  const impact = f.predict?.impact;
  if (impact && f.vy > 5) out.push({ pri: 1, key: 'impact', text: t('hint.impact', { t: Math.max(0.1, impact.t).toFixed(1).replace('.', ','), v: fmtSpeed(impact.v), tol: fmtSpeed(f.landing?.vTol ?? 0) }), icon: impact.onPad ? 'check' : 'target', kind: impact.onPad ? 'good' : 'tip' });
  out.sort((a, b) => b.pri - a.pri);
  const cur = s.hint;
  const best = out[0];
  if (cur && now < cur.until) {
    // текущая живёт минимум 1,4 с, заменяется только более важной
    const same = out.find((o) => o.key === cur.key);
    if (same) {
      cur.text = same.text;
      cur.kind = same.kind;
    }
    if (!best || best.pri <= cur.pri || best.key === cur.key) return cur;
  }
  if (!best) return cur && now < cur.until ? cur : null;
  s.hint = { ...best, until: now + 0.9 + (best.pri >= 3 ? 1 : 0) };
  return s.hint;
}

function drawHint(app, kit, L, s, f, hud, tut) {
  const c = kit.c;
  const h = pickHint(app, s, f, tut);
  if (!h) return;
  const r = hud.hint;
  const size = kit.fs(L.portrait ? 13 : 14);
  const tw = Math.min(r.w, kit.text.measure(h.text, size) + size * 3);
  const x = r.x + (r.w - tw) / 2;
  // длинная подсказка в тесной раскладке переносится на вторую строку, а не режется многоточием
  const lines = kit.text.measure(h.text, size) + size * 2.6 > tw ? kit.text.wrap(h.text, tw - size * 2.6, size).slice(0, 2) : [h.text];
  const step = lines.length > 1 ? Math.min(Math.round(size * 1.3), Math.floor((r.h - 4) / lines.length)) : 0;
  const drawLines = (color) => lines.forEach((ln, i) => kit.drawText(ln, x + size * 2.1, r.y + r.h / 2 + (i - (lines.length - 1) / 2) * step, { size, color, maxWidth: tw - size * 2.6 }));
  const variant = h.kind === 'bad' ? 'danger' : h.kind === 'good' ? 'good' : 'hud';
  const blink = h.kind === 'bad' && !app.settings.reduceMotion && Math.floor(app.time * 5) % 2 === 0;
  if (['analog', 'led', 'digital'].includes(kit.S.skin.instr)) {
    // эпохи ЭЛТ: подсказка — строка на экране; тревога мигает инверсией (светлый фон, тёмный текст)
    const box = { x, y: r.y, w: tw, h: r.h };
    kit.nine('raised', box.x - kit.cell() * 2, box.y - kit.cell() * 2, box.w + kit.cell() * 4, box.h + kit.cell() * 4);
    kit.screen('hud-hint', box, () => {
      if (h.kind === 'bad' && blink) kit.rect(box.x, box.y, box.w, box.h, c.red);
      const fg = h.kind === 'bad' && blink ? c.ink : c.text;
      kit.icon(h.icon, x + size * 1.1, r.y + r.h / 2, size * 1.25, h.kind === 'bad' && blink ? c.ink : h.kind === 'bad' ? c.red : c.amber);
      drawLines(fg);
    });
    return;
  }
  kit.nine(blink ? 'warn' : variant, x, r.y, tw, r.h);
  kit.icon(h.icon, x + size * 1.1, r.y + r.h / 2, size * 1.25, h.kind === 'bad' ? c.white : h.kind === 'good' ? c.ink : c.amber);
  drawLines(h.kind === 'good' ? c.ink : c.text);
}

// ---------- управление ----------

function pressedRole(app, role) {
  for (const p of app.input.touch.pointers.values()) if (p.role === role) return true;
  return false;
}

function hudButton(app, kit, L, name, r, o) {
  const touch = app.touchUi;
  const id = `flight-${name}`;
  app.hudTargets[id] = r;
  const c = kit.c;
  const cc = kit.cell();
  const dim = o.disabled;
  if (touch) {
    const pressed = pressedRole(app, `button:${name}`);
    const lip = cc * 2;
    const ctx = kit.S.ctx;
    ctx.globalAlpha = dim ? 0.6 : 1;
    kit.rect(r.x + cc, r.y + r.h - lip, r.w - cc * 2, lip, c.ink);
    kit.nine(dim ? 'disabled' : pressed ? (o.variant === 'primary' ? 'primaryPress' : o.variant === 'good' ? 'goodPress' : 'btnPress') : o.variant || 'hud', r.x, r.y + (pressed ? lip : 0), r.w, r.h - lip);
    kit.icon(o.icon, r.x + r.w / 2, r.y + (r.h - lip) * 0.5 + (pressed ? lip : 0), Math.round(Math.min(r.w, r.h) * 0.46), dim ? c.textMute : o.iconColor || c.text);
    ctx.globalAlpha = 1;
  } else if (kit.button(id, r, { icon: o.icon, label: o.wide ? o.label : undefined, variant: dim ? 'disabled' : o.variant === 'hud' ? 'btn' : o.variant || 'btn', disabled: dim, tip: o.label, iconSize: Math.round(Math.min(r.w, r.h) * 0.5), size: kit.fs(13) })) {
    app.input.pulse(name);
  }
  if (o.count !== undefined) kit.drawText(String(o.count), r.x + r.w - cc * 3, r.y + cc * 6, { size: kit.fs(12), color: c.amberLight, align: 'right', shadow: true });
  if (o.heat > 0.02) kit.ledBar({ x: r.x + cc * 4, y: r.y + r.h - cc * 9, w: r.w - cc * 8, h: cc * 4 }, { value: o.heat, color: o.heat > 0.8 ? c.red : c.amber, segments: 6 });
}

function drawControls(app, kit, L, s, f, hud, touch) {
  const c = kit.c;
  const B = hud.buttons;
  const mode = app.settings.controlMode;
  const cc = kit.cell();

  // пауза всегда
  hudButton(app, kit, L, 'pause', B.pause, { icon: 'pause', variant: 'hud', label: t('hud.pause') });

  // форсаж (+ нагрев), парашют, канистра, ремонт
  if (touch) {
    const heat = f.boost?.heat ?? 0;
    hudButton(app, kit, L, 'boost', B.boost, { icon: 'boost', variant: f.boost?.active ? 'primary' : 'hud', disabled: !!f.boost?.locked, iconColor: heat > 0.8 ? c.red : c.amber, label: t('hud.boost'), heat });
  }
  // парашют — только расходник из лавки
  const hasChute = !!f.chute.consumable;
  const chuteBody = app.data.BODIES?.[f.body]?.parachute !== false;
  hudButton(app, kit, L, 'parachute', B.parachute, { icon: 'chute', variant: f.chute.deployed ? 'good' : 'hud', disabled: !hasChute || !chuteBody || f.chute.deployed, label: t('hud.chute') });
  hudButton(app, kit, L, 'canister', B.canister, { icon: 'canister', variant: 'hud', disabled: !(f.consumables.canister > 0), count: f.consumables.canister || undefined, label: t('hud.canister') });
  hudButton(app, kit, L, 'repair', B.repair, { icon: 'repair', variant: 'hud', disabled: !(f.consumables.repair > 0), count: f.consumables.repair || undefined, label: t('hud.repair') });

  // перелёт
  if (f.canTransfer) {
    const blink = app.settings.reduceMotion || Math.floor(app.time * 4) % 2 === 0;
    hudButton(app, kit, L, 'transfer', B.transfer, { icon: 'transfer', variant: blink ? 'good' : 'primary', label: t('hud.transfer'), wide: true });
  }

  const lim = tiltLimit(f);
  if (!touch) {
    // без сенсорных органов управления на месте диска — указатель крена: стрелка и зона допустимого отклонения
    const G = { cx: hud.disc.cx, cy: hud.disc.cy, r: Math.round(hud.disc.r * 0.8) };
    inst.wheel(kit, G, { finger: null, knobX: G.cx, kr: 0, hot: lim !== null && Math.abs(f.angle || 0) >= lim * 0.93 });
    drawAttitude(app, kit, G, f, lim);
    return;
  }

  // диск наклона: штурвал с шкалой и шариковой рукояткой
  const D = hud.disc;
  const tm = app.input.touch;
  app.hudTargets['flight-tilt'] = { x: D.cx - D.r, y: D.cy - D.r, w: D.r * 2, h: D.r * 2 };
  let finger = null;
  for (const p of tm.pointers.values()) if (p.role === 'disc') finger = p;
  const knobX = D.cx + (finger ? clamp((finger.x - D.cx) / (D.r * 0.78), -1, 1) : 0) * D.r * 0.78;
  const kr = Math.round(D.r * 0.34);
  const base = inst.wheel(kit, D, { finger, knobX, kr, hot: lim !== null && Math.abs(f.angle || 0) >= lim * 0.93 });
  // дуга ограничителя и стрелка крена по верхней дуге диска
  drawAttitude(app, kit, D, f, lim);
  kit.icon('back', D.cx - D.r * 0.66, D.cy + D.r * 0.15, Math.round(D.r * 0.3), c.textDim);
  kit.icon('arrow', D.cx + D.r * 0.66, D.cy + D.r * 0.15, Math.round(D.r * 0.3), c.textDim);
  base.knob();
  kit.drawText(t('hud.tilt'), D.cx, D.cy + D.r * 0.72, { size: kit.fs(10), color: c.textMute, align: 'center' });

  // рычаг тяги: паз со светодиодной шкалой, рукоятка и фиксатор
  const V = hud.lever;
  app.hudTargets['flight-thrust'] = V;
  const lv = tm.leverState(mode);
  // рычаг по эпохе: металл (E0), светодиоды (E1), цифровая шкала (E2), тонкий ползунок (E3), проекция (E4), голограмма (E5);
  // фиксатор: в режиме «Пилот» рычаг держит положение — лампа горит; в «Аркаде» отпускание сбрасывает тягу
  const lw = inst.lever(kit, V, { lv, thr: f.throttle, boost: !!f.boost?.active, mode, u: L.ui });
  // подпись на самой рукоятке: «держи» в аркаде, процент в режиме «Пилот»
  kit.drawText(mode === 'arcade' ? t('hud.hold') : `${Math.round(lv.value * 100)}`, V.x + V.w / 2, lw.thumb.y + lw.thumb.h * 0.72, { size: kit.fs(10), color: lw.label, align: 'center', maxWidth: V.w - cc * 8 });
  kit.drawText(t('hud.thrust'), V.x + V.w / 2, V.y - kit.fs(8), { size: kit.fs(10), color: c.textMute, align: 'center' });
}

// ---------- крен и ограничитель наклона ----------

// предел наклона стабилизаторов в радианах; от этого значения и выше ракета вращается свободно (как TILT_FREE в sim/rocket.js)
const TILT_FREE = 3;
const tiltLimit = (f) => {
  const m = f.cfg?.fins?.maxTilt;
  return typeof m === 'number' && m < TILT_FREE ? m : null;
};

/**
 * Указатель крена на круглом приборе D: деления через 10° от вертикали, зона допустимого отклонения — дуга из клеток
 * цвета янтаря с красными упорами; белая стрелка — текущий крен ракеты. У упора прибор мягко подсвечивается.
 */
function drawAttitude(app, kit, D, f, lim) {
  const c = kit.c;
  const cc = kit.cell();
  const rIn = D.r - cc * 6;
  const ang = f.angle || 0;
  const hot = lim !== null && Math.abs(ang) >= lim * 0.93;
  for (let i = -9; i <= 9; i++) {
    const a = (i * Math.PI) / 18;
    const th = -Math.PI / 2 + a;
    const inside = lim === null || Math.abs(a) <= lim + 0.01;
    const len = i % 3 === 0 ? cc * 3 : cc * 2;
    const color = i === 0 ? c.amberLight : lim === null ? c.steel2 : inside ? c.amber : c.steel0;
    kit.line(D.cx + Math.cos(th) * rIn, D.cy + Math.sin(th) * rIn, D.cx + Math.cos(th) * (rIn - len), D.cy + Math.sin(th) * (rIn - len), color);
  }
  if (lim !== null && lim < Math.PI / 2) {
    // сама дуга допустимого отклонения и упоры на её концах
    const step = (cc * 2) / rIn;
    for (let a = -lim; a <= lim + 1e-6; a += step) {
      const th = -Math.PI / 2 + a;
      kit.rect(Math.round((D.cx + Math.cos(th) * (rIn + cc * 2)) / cc) * cc, Math.round((D.cy + Math.sin(th) * (rIn + cc * 2)) / cc) * cc, cc, cc, c.amber);
    }
    const blink = hot && !app.settings.reduceMotion ? Math.floor(app.time * 5) % 2 === 0 : hot;
    for (const side of [-1, 1]) {
      const th = -Math.PI / 2 + side * lim;
      kit.line(D.cx + Math.cos(th) * (rIn + cc * 4), D.cy + Math.sin(th) * (rIn + cc * 4), D.cx + Math.cos(th) * (rIn - cc * 4), D.cy + Math.sin(th) * (rIn - cc * 4), blink ? c.redLight : c.red);
    }
    if (hot) {
      // мягкая подсветка кольца, пока ракета стоит в упоре
      const k = app.settings.reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(app.time * 6);
      kit.ring(D.cx, D.cy, D.r - cc * 2, cc * 2, mix(c.steel1, c.amber, 0.35 + 0.4 * k));
    }
  }
  const th = -Math.PI / 2 + clamp(ang, -Math.PI / 2, Math.PI / 2);
  kit.line(D.cx + Math.cos(th) * (rIn + cc * 3), D.cy + Math.sin(th) * (rIn + cc * 3), D.cx + Math.cos(th) * (rIn - cc * 6), D.cy + Math.sin(th) * (rIn - cc * 6), c.white);
}

// ---------- клавиатурная подсказка ----------

function drawLegend(app, kit, L, s, hud) {
  const showFor = app.profile.stats.flights < 4 ? 40 : 10;
  const age = s.flight.time;
  if (age > showFor) return;
  const c = kit.c;
  const alpha = clamp((showFor - age) / 2, 0, 1);
  const ctx = kit.S.ctx;
  ctx.globalAlpha = alpha * 0.95;
  const size = kit.fs(12);
  const capH = Math.round(22 * L.ui);
  let total = 0;
  // подсказка не должна заезжать на кнопки справа: берём столько пунктов, сколько помещается
  const avail = (L.portrait ? L.area.w : Math.min(hud.buttons.canister?.x ?? L.area.w, hud.buttons.repair?.x ?? L.area.w, hud.buttons.parachute?.x ?? L.area.w) - L.area.x) - L.gap * 2;
  const parts = [];
  for (const e of KEY_LEGEND) {
    const label = t(e.label);
    const w = e.keys.reduce((sum, k) => sum + Math.max(capH, kit.text.measure(k, size) + 10) + 3, 0) + kit.text.measure(label, size) + 14;
    if (total + w > avail) break;
    total += w;
    parts.push({ e, label, w });
  }
  let x = L.portrait ? L.area.x + (L.area.w - total) / 2 : L.area.x + L.gap + (avail - total) / 2;
  const y = L.area.y + L.area.h - L.gap - capH - 2;
  for (const p of parts) {
    for (const k of p.e.keys) {
      const w = Math.max(capH, kit.text.measure(k, size) + 10);
      kit.nine('btn', x, y, w, capH);
      kit.drawText(k, x + w / 2, y + capH / 2, { size, color: c.text, align: 'center' });
      x += w + 3;
    }
    x += 3;
    x += kit.drawText(p.label, x, y + capH / 2, { size, color: c.textDim, shadow: true }).w + 11;
  }
  ctx.globalAlpha = 1;
  void hud;
}

// ---------- пауза ----------

function drawPause(app, kit, L) {
  const st = app.ui.flightHud;
  const ctx = kit.S.ctx;
  kit.withLayer(100, () => {
    ctx.fillStyle = kit.ditherPattern(kit.c.ink, kit.cell());
    ctx.fillRect(0, 0, L.w, L.h);
    kit.hit('pause-barrier', { x: 0, y: 0, w: L.w, h: L.h }, {});
    const bh = L.touch(54);
    const want = Math.round(kit.fs(26) + L.pad * 3 + 4 * (bh + L.gap) + L.gap);
    const card = centerCard(L, L.area, 380, 2000);
    card.y = Math.round(L.area.y + (L.area.h - Math.min(want, L.area.h - L.gap * 2)) / 2);
    card.h = Math.min(want, L.area.h - L.gap * 2);
    const inner = kit.panel(card, { title: t('pause.title'), titleIcon: 'pause', variant: 'raised' });
    let y = inner.y + L.gap;
    const row = (id, o) => {
      const clicked = kit.button(id, { x: inner.x, y, w: inner.w, h: bh }, { size: kit.fs(15), ...o });
      y += bh + L.gap;
      return clicked;
    };
    if (row('flight-resume', { label: t('pause.resume'), icon: 'play', variant: 'primary' })) app.resume();
    const mode = app.settings.controlMode;
    if (row('flight-mode', { label: t('pause.mode', { mode: t(`mode.${mode}`) }), icon: 'gear', variant: 'btn' })) app.setSetting('controlMode', mode === 'arcade' ? 'pilot' : 'arcade');
    if (row('flight-help', { label: t('pause.help'), icon: 'info', variant: 'btn' })) app.queueCard('help', true);
    if (row('flight-abandon', { label: st.confirm ? t('pause.confirm') : t('pause.abandon'), icon: 'close', variant: 'danger' })) {
      if (st.confirm) app.abandon();
      else st.confirm = true;
    }
  });
}

void fmtInt;
