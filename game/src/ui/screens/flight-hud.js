// Полётный HUD: минимум постоянных приборов (высота, вертикальная скорость, топливо активной ступени, прочность, монеты),
// полоса высотных рубежей, контекстные подсказки, мини-радар, прогноз посадки и сенсорное управление
// (диск наклона и рычаг тяги; геометрия — layout.hudLayout).

import { t } from '../../i18n/index.js';
import { clamp, fmtAlt, fmtInt, fmtSpeed } from '../format.js';
import { centerCard } from '../layout.js';
import { tutorialHint, drawTutorialPointer } from './onboarding.js';

const DANGER_WARNS = ['brake', 'tilt', 'drift', 'hazard', 'chute-air', 'overheat', 'hull'];
const WARN_KEYS = { brake: 'hint.brake', tilt: 'hint.tilt', drift: 'hint.drift', hazard: 'hint.hazard', 'chute-air': 'hint.chuteAir', overheat: 'hint.overheat', hull: 'hint.hull' };
const WARN_ICON = { brake: 'up', tilt: 'target', drift: 'wind', hazard: 'warn', 'chute-air': 'chute', overheat: 'boost', hull: 'shield' };
const KEY_LEGEND = [
  { keys: ['W', '↑'], label: 'legend.thrust' },
  { keys: ['A', 'D'], label: 'legend.tilt' },
  { keys: ['␣'], label: 'legend.boost' },
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
    const c = kit.c;
    const touch = app.touchUi;
    app.hudTargets = {};

    drawFlash(app, kit, L, s);
    drawInstruments(app, kit, L, f, hud);
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
    void c;
    void dt;
  },
};

// ---------- общие куски ----------

const hudPanel = (kit, r) => kit.nine('hud', r.x, r.y, r.w, r.h, Math.max(1, Math.round(kit.L.px / 2)));

function drawFlash(app, kit, L, s) {
  const ctx = kit.S.ctx;
  // тревога (мало топлива, столкновение, опасность): красная рамка по краям, дубль звукового сигнала
  if (app.time < s.alarmUntil) {
    const k = Math.min(1, (s.alarmUntil - app.time) / 0.4);
    const pulse = app.settings.reduceMotion ? 0.7 : 0.55 + 0.45 * Math.sin(app.time * 14);
    const e = Math.round(10 * L.ui);
    ctx.globalAlpha = 0.5 * k * pulse;
    ctx.fillStyle = kit.c.red;
    ctx.fillRect(0, 0, L.w, e);
    ctx.fillRect(0, L.h - e, L.w, e);
    ctx.fillRect(0, 0, e, L.h);
    ctx.fillRect(L.w - e, 0, e, L.h);
    ctx.globalAlpha = 1;
  }
  if (s.flash <= 0 || app.settings.reduceMotion) return;
  ctx.globalAlpha = s.flash * 0.18;
  ctx.fillStyle = kit.c.gold;
  const e = Math.round(8 * L.ui);
  ctx.fillRect(0, 0, L.w, e);
  ctx.fillRect(0, L.h - e, L.w, e);
  ctx.fillRect(0, 0, e, L.h);
  ctx.fillRect(L.w - e, 0, e, L.h);
  ctx.globalAlpha = 1;
}

// ---------- приборы ----------

function drawInstruments(app, kit, L, f, hud) {
  const c = kit.c;
  const I = hud.instruments;
  const u = L.ui;

  // высота
  hudPanel(kit, I.alt);
  const alt = fmtAlt(f.alt);
  const bigH = Math.round(I.alt.h * 0.62);
  kit.icon('altitude', I.alt.x + I.alt.h * 0.55, I.alt.y + I.alt.h / 2, Math.round(I.alt.h * 0.55), c.cyan);
  const unit = t(alt.unit === 'km' ? 'unit.km' : 'unit.m');
  const unitW = kit.text.measure(unit, Math.round(bigH * 0.5));
  kit.drawText(unit, I.alt.x + I.alt.w - L.px * 2, I.alt.y + I.alt.h * 0.62, { size: Math.round(bigH * 0.5), color: c.textDim, align: 'right', dynamic: true });
  kit.drawText(alt.value, I.alt.x + I.alt.w - L.px * 3 - unitW, I.alt.y + I.alt.h / 2, { size: bigH, color: c.text, align: 'right', dynamic: true, shadow: 'rgba(0,0,0,0.6)', maxWidth: I.alt.w - I.alt.h - unitW - L.px * 4 });

  // вертикальная скорость и допуск посадки
  hudPanel(kit, I.vspeed);
  const climb = f.climb ?? -f.vy;
  const falling = f.vy > 0 && f.liftedOff;
  const tol = f.landing?.vTol ?? 0;
  const danger = falling && f.alt < 400 && tol > 0 && f.vy > tol;
  const vcol = danger ? c.red : falling ? c.amber : c.green;
  kit.icon(climb >= 0 ? 'up' : 'down', I.vspeed.x + I.vspeed.h * 0.5, I.vspeed.y + I.vspeed.h * 0.46, Math.round(I.vspeed.h * 0.5), vcol);
  kit.drawText(fmtSpeed(climb), I.vspeed.x + I.vspeed.w - L.px * 2, I.vspeed.y + I.vspeed.h * 0.46, { size: Math.round(I.vspeed.h * 0.5), color: vcol, align: 'right', dynamic: true, shadow: 'rgba(0,0,0,0.6)', maxWidth: I.vspeed.w - I.vspeed.h });
  if (falling && f.alt < 500 && tol > 0) {
    const bar = { x: I.vspeed.x + L.px * 2, y: I.vspeed.y + I.vspeed.h - L.px * 4, w: I.vspeed.w - L.px * 4, h: L.px * 2 };
    kit.rect(bar.x, bar.y, bar.w, bar.h, c.edge);
    const k = clamp(f.vy / (tol * 2), 0, 1);
    kit.rect(bar.x, bar.y, Math.round(bar.w * k), bar.h, f.vy > tol ? c.red : c.green);
    kit.rect(bar.x + Math.round(bar.w * 0.5), bar.y - 2, 2, bar.h + 4, c.white);
  }

  // монеты
  hudPanel(kit, I.coins);
  kit.icon('coin', I.coins.x + I.coins.h * 0.5, I.coins.y + I.coins.h / 2, Math.round(I.coins.h * 0.55), c.gold);
  kit.drawText(fmtInt(f.coins), I.coins.x + I.coins.w - L.px * 2, I.coins.y + I.coins.h / 2, { size: Math.round(I.coins.h * 0.5), color: c.gold, align: 'right', dynamic: true, shadow: 'rgba(0,0,0,0.6)', maxWidth: I.coins.w - I.coins.h });

  // топливо активной ступени и прочность
  const fuel01 = f.maxFuel > 0 ? f.fuel / f.maxFuel : 0;
  const hull01 = f.maxHp > 0 ? f.hp / f.maxHp : 0;
  const bar = (r, v, color, iconName, caption) => {
    const vertical = r.h > r.w;
    hudPanel(kit, { x: r.x - L.px, y: r.y - L.px, w: r.w + L.px * 2, h: r.h + L.px * 2 });
    const warnLow = v <= 0.2;
    kit.meter(r, { value: v, color, warn: 0.2, segments: 5 });
    if (vertical) {
      kit.icon(iconName, r.x + r.w / 2, r.y - Math.round(12 * u), Math.round(16 * u), warnLow ? c.red : color);
      if (caption) kit.drawText(caption, r.x + r.w / 2, r.y + r.h + Math.round(10 * u), { size: kit.fs(10), color: c.textDim, align: 'center' });
    } else {
      kit.icon(iconName, r.x + r.h * 0.6, r.y + r.h / 2, Math.round(r.h * 1.1), warnLow ? c.red : color);
      kit.drawText(`${Math.round(v * 100)}%`, r.x + r.w - L.px * 3, r.y + r.h / 2, { size: Math.max(9, Math.round(r.h * 0.7)), color: c.white, align: 'right', dynamic: true, shadow: 'rgba(0,0,0,0.9)', weight: 900 });
    }
  };
  const st = f.stages?.length > 1 ? `${f.stageIndex + 1}/${f.stages.length}` : '';
  if (I.fuel.h > I.fuel.w) {
    bar(I.fuel, fuel01, c.green, 'fuel', st);
    bar(I.hull, hull01, c.cyan, 'shield', '');
  } else {
    // в портрете значок и процент — на самой полосе; значок слева вынесен за границу полосы
    const shift = Math.round(I.fuel.h * 1.4);
    bar({ ...I.fuel, x: I.fuel.x + shift, w: I.fuel.w - shift }, fuel01, c.green, 'fuel', st);
    bar({ ...I.hull, x: I.hull.x + shift, w: I.hull.w - shift }, hull01, c.cyan, 'shield', '');
  }
}

// ---------- высотные рубежи ----------

function drawStrip(app, kit, L, f, hud, radar) {
  const r = hud.strip;
  if (r.h < 40) return;
  const c = kit.c;
  const ctx = kit.S.ctx;
  const zones = (app.mods.sim.ZONES?.[f.body] || []).filter((z) => z.from > 0);
  if (!zones.length) return;
  const top = zones[zones.length - 1].from * 1.12;
  const pos = (alt) => r.y + r.h - Math.sqrt(clamp(alt / top, 0, 1)) * r.h;
  hudPanel(kit, r);
  const cx = r.x + r.w / 2;
  kit.rect(cx - 1, r.y + L.px, 2, r.h - L.px * 2, c.line);
  for (const z of zones) {
    const y = Math.round(pos(z.from));
    const passed = f.maxAlt >= z.from;
    kit.rect(r.x + L.px, y, r.w - L.px * 2, Math.max(2, L.px / 2), passed ? c.amber : c.textMute);
  }
  const y = pos(f.alt);
  ctx.fillStyle = c.white;
  ctx.beginPath();
  ctx.moveTo(r.x - L.px, y);
  ctx.lineTo(r.x + r.w * 0.55, y - 5 * L.ui);
  ctx.lineTo(r.x + r.w * 0.55, y + 5 * L.ui);
  ctx.closePath();
  ctx.fill();
  // подпись ближайшего рубежа слева от полосы; радар и сама полоса её не перекрывают
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
    if (ly < r.y + r.h - 4) kit.drawText(name, r.x - L.gap, ly, { size, color: c.textDim, align: 'right', shadow: 'rgba(0,0,0,0.8)', maxWidth: tw });
  }
}

// ---------- радар ----------

function drawRadar(app, kit, L, f, hud) {
  const c = kit.c;
  const ctx = kit.S.ctx;
  const R = hud.radar;
  const range = 350 + 900 * f.cfg.base.radar;
  ctx.save();
  ctx.beginPath();
  ctx.arc(R.cx, R.cy, R.r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(6,14,24,0.7)';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(82,216,255,0.25)';
  ctx.lineWidth = 1;
  for (const k of [0.33, 0.66]) {
    ctx.beginPath();
    ctx.arc(R.cx, R.cy, R.r * k, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(R.cx - R.r, R.cy);
  ctx.lineTo(R.cx + R.r, R.cy);
  ctx.moveTo(R.cx, R.cy - R.r);
  ctx.lineTo(R.cx, R.cy + R.r);
  ctx.stroke();
  if (!app.settings.reduceMotion) {
    const a = (app.time * 2.4) % (Math.PI * 2);
    const g = ctx.createConicGradient ? ctx.createConicGradient(a, R.cx, R.cy) : null;
    if (g) {
      g.addColorStop(0, 'rgba(82,216,255,0.35)');
      g.addColorStop(0.12, 'rgba(82,216,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(R.cx - R.r, R.cy - R.r, R.r * 2, R.r * 2);
    }
  }
  const dot = Math.max(3, Math.round(3 * L.ui));
  const plot = (x, alt, color, shape = 'sq') => {
    const px = R.cx + ((x - f.x) / range) * R.r;
    const py = R.cy - ((alt - f.alt) / range) * R.r;
    if ((px - R.cx) ** 2 + (py - R.cy) ** 2 > R.r * R.r) return;
    ctx.fillStyle = color;
    if (shape === 'ring') {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(px, py, dot, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'tri') {
      ctx.beginPath();
      ctx.moveTo(px, py - dot * 1.4);
      ctx.lineTo(px - dot, py + dot);
      ctx.lineTo(px + dot, py + dot);
      ctx.fill();
    } else ctx.fillRect(Math.round(px - dot / 2), Math.round(py - dot / 2), dot, dot);
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
  ctx.fillStyle = c.white;
  ctx.fillRect(R.cx - 2, R.cy - 2, 4, 4);
  ctx.restore();
  ctx.strokeStyle = c.line;
  ctx.lineWidth = Math.max(2, L.px);
  ctx.beginPath();
  ctx.arc(R.cx, R.cy, R.r, 0, Math.PI * 2);
  ctx.stroke();
}

// ---------- прогноз посадки (авионика) ----------

function drawPredict(app, kit, L, f) {
  const pr = f.predict;
  const proj = app.renderer.flight?.project;
  if (!pr || !proj) return;
  const ctx = kit.S.ctx;
  ctx.strokeStyle = 'rgba(255,182,39,0.85)';
  ctx.lineWidth = Math.max(2, L.px);
  ctx.setLineDash([L.px * 2, L.px * 2]);
  ctx.beginPath();
  pr.points.forEach(([x, y], i) => {
    const p = proj(x, y);
    if (!p) return;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
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
  if (f.liftedOff && f.vy > 20 && f.alt < 380 && f.fuelTotal <= 0.01 && !f.chute.deployed && (f.cfg.parachute.level > 0 || f.chute.consumable)) out.push({ pri: 3, key: 'chute', text: t('hint.chute'), icon: 'chute', kind: 'bad' });
  const wind = f.weather ? f.weather.wind * f.atmo : 0;
  if (Math.abs(wind) > 3 && f.liftedOff) out.push({ pri: 1, key: `wind${Math.sign(wind)}`, text: t(wind > 0 ? 'hint.wind.right' : 'hint.wind.left'), icon: 'wind', kind: 'tip' });
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
  const variant = h.kind === 'bad' ? 'warn' : h.kind === 'good' ? 'good' : 'hud';
  const pulse = h.kind === 'bad' && !app.settings.reduceMotion ? 0.8 + 0.2 * Math.sin(app.time * 10) : 1;
  kit.S.ctx.globalAlpha = pulse;
  kit.nine(variant, x, r.y, tw, r.h, Math.max(1, Math.round(L.px * 0.75)));
  kit.icon(h.icon, x + size * 1.1, r.y + r.h / 2, size * 1.25, h.kind === 'bad' ? c.red : h.kind === 'good' ? c.white : c.amber);
  kit.drawText(h.text, x + size * 2.1, r.y + r.h / 2, { size, color: c.text, maxWidth: tw - size * 2.6 });
  kit.S.ctx.globalAlpha = 1;
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
  const dim = o.disabled;
  if (touch) {
    const pressed = pressedRole(app, `button:${name}`);
    const cell = Math.max(1, Math.round(L.px * 0.75));
    kit.S.ctx.globalAlpha = dim ? 0.55 : 1;
    kit.nine(dim ? 'disabled' : pressed ? (o.variant === 'primary' ? 'primaryPress' : 'btnPress') : o.variant || 'hud', r.x, r.y + (pressed ? cell : 0), r.w, r.h, cell);
    kit.icon(o.icon, r.x + r.w / 2, r.y + r.h * (o.label ? 0.42 : 0.5) + (pressed ? cell : 0), Math.round(Math.min(r.w, r.h) * 0.46), dim ? c.textMute : o.iconColor || c.text);
    if (o.label) kit.drawText(o.label, r.x + r.w / 2, r.y + r.h * 0.82, { size: kit.fs(10), color: c.textDim, align: 'center', maxWidth: r.w - 4 });
    kit.S.ctx.globalAlpha = 1;
  } else if (kit.button(id, r, { icon: o.icon, label: o.wide ? o.label : undefined, variant: dim ? 'disabled' : o.variant === 'hud' ? 'btn' : o.variant || 'btn', disabled: dim, tip: o.label, iconSize: Math.round(Math.min(r.w, r.h) * 0.5), size: kit.fs(13) })) {
    app.input.pulse(name);
  }
  if (o.count !== undefined) kit.drawText(String(o.count), r.x + r.w - L.px * 2, r.y + L.px * 4, { size: kit.fs(12), color: c.amber, align: 'right', weight: 900, shadow: 'rgba(0,0,0,0.9)' });
}

function drawControls(app, kit, L, s, f, hud, touch) {
  const c = kit.c;
  const ctx = kit.S.ctx;
  const B = hud.buttons;
  const mode = app.settings.controlMode;

  // пауза всегда
  hudButton(app, kit, L, 'pause', B.pause, { icon: 'pause', variant: 'hud', label: t('hud.pause') });

  // форсаж (+ нагрев), парашют, канистра, ремонт
  if (touch) {
    const heat = f.boost?.heat ?? 0;
    hudButton(app, kit, L, 'boost', B.boost, { icon: 'boost', variant: f.boost?.active ? 'primary' : 'hud', disabled: !!f.boost?.locked, iconColor: heat > 0.8 ? c.red : c.amber, label: t('hud.boost') });
    if (heat > 0.02) {
      ctx.strokeStyle = heat > 0.8 ? c.red : c.amber;
      ctx.lineWidth = Math.max(2, L.px);
      ctx.beginPath();
      ctx.arc(B.boost.x + B.boost.w / 2, B.boost.y + B.boost.h / 2, B.boost.w / 2 + L.px, -Math.PI / 2, -Math.PI / 2 + heat * Math.PI * 2);
      ctx.stroke();
    }
  }
  const hasChute = f.cfg.parachute.level > 0 || f.chute.consumable;
  const chuteBody = app.data.BODIES?.[f.body]?.parachute !== false;
  hudButton(app, kit, L, 'parachute', B.parachute, { icon: 'chute', variant: f.chute.deployed ? 'good' : 'hud', disabled: !hasChute || !chuteBody || f.chute.deployed, label: t('hud.chute') });
  hudButton(app, kit, L, 'canister', B.canister, { icon: 'canister', variant: 'hud', disabled: !(f.consumables.canister > 0), count: f.consumables.canister || undefined, label: t('hud.canister') });
  hudButton(app, kit, L, 'repair', B.repair, { icon: 'repair', variant: 'hud', disabled: !(f.consumables.repair > 0), count: f.consumables.repair || undefined, label: t('hud.repair') });

  // перелёт
  if (f.canTransfer) {
    const pulse = app.settings.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(app.time * 7);
    ctx.globalAlpha = pulse;
    hudButton(app, kit, L, 'transfer', B.transfer, { icon: 'transfer', variant: 'good', label: t('hud.transfer'), wide: true });
    ctx.globalAlpha = 1;
  }

  if (!touch) return;

  // диск наклона
  const D = hud.disc;
  const tm = app.input.touch;
  app.hudTargets['flight-tilt'] = { x: D.cx - D.r, y: D.cy - D.r, w: D.r * 2, h: D.r * 2 };
  let finger = null;
  for (const p of tm.pointers.values()) if (p.role === 'disc') finger = p;
  ctx.fillStyle = 'rgba(8,13,26,0.55)';
  ctx.beginPath();
  ctx.arc(D.cx, D.cy, D.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = finger ? c.amber : c.line;
  ctx.lineWidth = Math.max(3, L.px * 1.5);
  ctx.stroke();
  kit.icon('back', D.cx - D.r * 0.66, D.cy, Math.round(D.r * 0.3), c.textDim);
  kit.icon('arrow', D.cx + D.r * 0.66, D.cy, Math.round(D.r * 0.3), c.textDim);
  kit.rect(D.cx - 1, D.cy - D.r * 0.5, 2, D.r, 'rgba(138,151,181,0.35)');
  const knobX = D.cx + (finger ? clamp((finger.x - D.cx) / (D.r * 0.78), -1, 1) : 0) * D.r * 0.78;
  const kr = D.r * 0.34;
  kit.nine(finger ? 'primary' : 'btn', knobX - kr, D.cy - kr, kr * 2, kr * 2, Math.max(1, Math.round(L.px * 0.75)));
  kit.drawText(t('hud.tilt'), D.cx, D.cy + D.r * 0.72, { size: kit.fs(10), color: c.textMute, align: 'center' });

  // рычаг тяги
  const V = hud.lever;
  app.hudTargets['flight-thrust'] = V;
  const lv = tm.leverState(mode);
  const cell = Math.max(1, Math.round(L.px * 0.75));
  hudPanel(kit, V);
  const track = { x: V.x + V.w * 0.36, y: V.y + 14 * L.ui, w: V.w * 0.28, h: V.h - 28 * L.ui };
  kit.meter(track, { value: f.throttle, color: f.boost?.active ? c.red : c.amber, bg: c.inset });
  for (let i = 0; i <= 4; i++) kit.rect(V.x + V.w * 0.2, track.y + (track.h * i) / 4 - 1, V.w * 0.12, 2, c.textMute);
  const thumbH = Math.round(30 * L.ui);
  const ty = V.y + 10 * L.ui + (1 - lv.value) * (V.h - 20 * L.ui - thumbH);
  kit.nine(lv.touched ? 'primary' : 'btn', V.x + L.px, ty, V.w - L.px * 2, thumbH, cell);
  kit.drawText(mode === 'arcade' ? t('hud.hold') : `${Math.round(lv.value * 100)}%`, V.x + V.w / 2, ty + thumbH / 2, { size: kit.fs(10), color: lv.touched ? c.textDark : c.text, align: 'center', weight: 900, dynamic: true });
  kit.drawText(t('hud.thrust'), V.x + V.w / 2, V.y - kit.fs(8), { size: kit.fs(10), color: c.textMute, align: 'center' });
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
  const parts = KEY_LEGEND.map((e) => {
    const label = t(e.label);
    const w = e.keys.reduce((sum, k) => sum + Math.max(capH, kit.text.measure(k, size) + 10) + 3, 0) + kit.text.measure(label, size) + 14;
    total += w;
    return { e, label, w };
  });
  let x = L.area.x + (L.area.w - total) / 2;
  const y = L.area.y + L.area.h - L.gap - capH - 2;
  for (const p of parts) {
    for (const k of p.e.keys) {
      const w = Math.max(capH, kit.text.measure(k, size) + 10);
      kit.nine('btn', x, y, w, capH, Math.max(1, Math.round(L.px * 0.6)));
      kit.drawText(k, x + w / 2, y + capH / 2, { size, color: c.text, align: 'center', weight: 900 });
      x += w + 3;
    }
    x += 3;
    x += kit.drawText(p.label, x, y + capH / 2, { size, color: c.textDim, shadow: 'rgba(0,0,0,0.9)' }).w + 11;
  }
  ctx.globalAlpha = 1;
  void hud;
}

// ---------- пауза ----------

function drawPause(app, kit, L) {
  const st = app.ui.flightHud;
  const ctx = kit.S.ctx;
  kit.withLayer(100, () => {
    ctx.fillStyle = 'rgba(4,7,14,0.7)';
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
