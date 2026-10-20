// Сборка ракеты: схема с девятью горячими точками-модулями, панель выбранного модуля
// («было → станет», стоимость, требования базы, причина блокировки) и «стенд» двигателя.

import { t } from '../../i18n/index.js';
import { screenFrame, rocketLayout, ROCKET_SPOTS } from '../layout.js';
import { clamp, lerp } from '../format.js';
import { drawHeader, drawReasons, isFundsReason, levelPips, partIcon, partName, partDesc, deltaRows, partShort, PART_KEYS } from './common.js';

const ERA_PALETTES = [
  { body: '#d9d2bd', shade: '#a8a08a', accent: '#c0392b', glass: '#6fb5d6' },
  { body: '#cfd6dc', shade: '#9aa5ae', accent: '#e8892b', glass: '#6fc1e0' },
  { body: '#e9edf2', shade: '#aeb8c4', accent: '#2f7fd0', glass: '#7fd0f0' },
  { body: '#f2f4f6', shade: '#b9c2cc', accent: '#2b2f3a', glass: '#52d8ff' },
  { body: '#dfeee9', shade: '#9bbdb4', accent: '#1fb89a', glass: '#7ff0e0' },
  { body: '#f6e6b8', shade: '#c9ae6a', accent: '#8a5be0', glass: '#c9a8ff' },
];

const STAND = { ramp: 0.5, hold: 1.4, fall: 0.7 };

function state(app) {
  return ((app.ui ||= {}).rocket ||= { selected: 'engine', stand: -1, flash: 0, lastLevels: null });
}

/** Показатели «было → станет» для следующего уровня модуля: описание — data.PARTS[id].statInfo. */
export function statRows(app, id) {
  const ps = app.rules.getPartState(app.profile, id);
  const infos = app.data.PARTS?.[id]?.statInfo;
  if (!ps.next || !infos) return [];
  return deltaRows(infos, ps.current, ps.next.stats).filter((r) => r.changed);
}

export default {
  id: 'rocket',
  background: 'blueprint',
  enter(app, params) {
    const st = state(app);
    st.stand = -1;
    if (params?.select) st.selected = params.select;
    else if (!PART_KEYS.includes(st.selected)) st.selected = 'engine';
  },
  leave(app) {
    app.standFrame = null;
  },
  draw(app, kit, L, dt) {
    const st = state(app);
    const c = kit.c;
    const F = screenFrame(L, { header: true });
    const G = rocketLayout(L);
    drawHeader(app, kit, F.header, { back: true, title: t('rocket.title') });

    // изменение уровней → вспышка на схеме
    const levels = PART_KEYS.map((k) => app.profile.parts[k]).join(',');
    if (st.lastLevels !== null && st.lastLevels !== levels) st.flash = 1;
    st.lastLevels = levels;
    st.flash = Math.max(0, st.flash - dt * 2);

    // стенд
    let thr = 0;
    if (st.stand >= 0) {
      st.stand += dt;
      const { ramp, hold, fall } = STAND;
      const s = st.stand;
      thr = s < ramp ? s / ramp : s < ramp + hold ? 1 : clamp(1 - (s - ramp - hold) / fall, 0, 1);
      if (s > ramp + hold + fall) st.stand = -1;
    }
    app.standFrame = st.stand >= 0 ? { throttle: thr } : null;

    drawSchematic(app, kit, L, G, st, thr);
    drawSpots(app, kit, L, G, st);
    drawPanel(app, kit, L, G, st);

    const standOn = st.stand >= 0;
    if (kit.button('stand', G.stand, { label: t('rocket.stand'), icon: 'stand', variant: standOn ? 'good' : 'btn', size: kit.fs(13), tip: t('rocket.stand.tip') }) && !standOn) st.stand = 0;
  },
};

// ---------- схема ----------

function drawSchematic(app, kit, L, G, st, thr) {
  const ctx = kit.S.ctx;
  const p = app.profile;
  const pal = ERA_PALETTES[p.era] || ERA_PALETTES[0];
  const r = G.rocket;
  const q = Math.max(2, Math.floor(r.h / 46));
  const rows = Math.floor(r.h / q);
  const cx = Math.round(r.x + r.w / 2);
  const shake = thr > 0 && !app.settings.reduceMotion ? Math.round((Math.sin(app.time * 90) * thr) * (q / 2)) : 0;
  const flash = st.flash;

  // площадка под схемой
  kit.nine('inset', G.schematic.x, G.schematic.y, G.schematic.w, G.schematic.h);

  const fill = (y, halfCells, color, off = 0) => {
    ctx.fillStyle = color;
    ctx.fillRect(cx - halfCells * q + off + shake, r.y + y * q, halfCells * 2 * q, q);
  };
  const lvl = p.parts;
  const bodyHalf = 5;
  const noseRows = Math.round(rows * 0.2);
  const bodyEnd = Math.round(rows * 0.8);
  const boosterStart = Math.round(rows * 0.58);

  // «призраки» пустых слотов
  if (!lvl.booster) {
    ctx.strokeStyle = 'rgba(82,216,255,0.35)';
    ctx.setLineDash([q, q]);
    ctx.strokeRect(cx - (bodyHalf + 1) * q + 0.5, r.y + boosterStart * q + 0.5, (bodyHalf + 1) * 2 * q, (bodyEnd - boosterStart) * q);
    ctx.setLineDash([]);
  }

  // опоры и стабилизаторы
  const legs = Math.max(1, lvl.legs);
  {
    ctx.fillStyle = lvl.legs ? pal.shade : '#6d7380';
    const spread = 2 + Math.min(4, Math.ceil(legs / 4));
    for (let i = 0; i < 4; i++) {
      for (const side of [-1, 1]) {
        ctx.fillRect(cx + side * (bodyHalf + 1 + i * (spread / 4)) * q - (side > 0 ? 0 : q) + shake, r.y + (bodyEnd - 2 + i) * q, q, q);
      }
    }
    fill(bodyEnd + 2, bodyHalf + spread / 2, pal.shade);
  }
  {
    const size = 2 + Math.min(4, Math.ceil(Math.max(1, lvl.fins) / 4));
    for (let i = 0; i < size * 2; i++) {
      const w = Math.round(((size * 2 - i) / (size * 2)) * size);
      ctx.fillStyle = lvl.fins ? pal.accent : '#7a2f2a';
      ctx.fillRect(cx - (bodyHalf + w) * q + shake, r.y + (bodyEnd - size * 2 + i + 1) * q, w * q, q);
      ctx.fillRect(cx + bodyHalf * q + shake, r.y + (bodyEnd - size * 2 + i + 1) * q, w * q, q);
    }
  }

  // корпус
  for (let y = 0; y < bodyEnd; y++) {
    let half;
    if (y < noseRows) half = Math.max(1, Math.round(lerp(1, bodyHalf, Math.sin((y / noseRows) * Math.PI * 0.5))));
    else half = y >= boosterStart && lvl.booster ? bodyHalf + 1 : bodyHalf;
    const stage = y >= boosterStart && lvl.booster;
    fill(y, half, y < noseRows * 0.85 ? pal.accent : stage ? '#c7c0aa' : pal.body);
    fill(y, 1, pal.shade, half * q - q * 1.2 + (half - 1) * 0); // тень справа
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(cx - half * q + shake, r.y + y * q, q, q); // блик слева
  }
  // полоса ступеней и обшивка
  const plates = Math.min(6, 1 + Math.floor((lvl.hull || 0) / 3));
  for (let i = 0; i < plates; i++) {
    const yy = Math.round(rows * 0.3) + i * 2;
    ctx.fillStyle = pal.accent;
    ctx.fillRect(cx - bodyHalf * q + shake, r.y + yy * q, bodyHalf * 2 * q, Math.max(1, q / 2));
  }
  // капсульное остекление
  ctx.fillStyle = pal.glass;
  ctx.fillRect(cx - q + shake, r.y + Math.round(noseRows * 0.9) * q, q * 2, q * 2);
  // парашют (колпак) и антенна
  if (lvl.parachute) {
    ctx.fillStyle = pal.accent;
    ctx.fillRect(cx - q + shake, r.y - q * 2, q * 2, q * 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - q + shake, r.y - q * 2, q * 2, Math.max(1, q / 2));
  }
  if (lvl.avionics) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx + 2 * q + shake, r.y + Math.round(noseRows * 0.2) * q - q * 3, Math.max(1, q / 2), q * 3);
    ctx.fillStyle = kit.c.green;
    ctx.fillRect(cx + 2 * q + shake - 1, r.y + Math.round(noseRows * 0.2) * q - q * 3 - 2, 4, 3);
  }
  // сопло
  const nozzle = 2 + Math.min(3, Math.ceil((lvl.engine || 0) / 5));
  for (let i = 0; i < 4; i++) fill(bodyEnd + i, Math.round(lerp(nozzle - 1, nozzle + 1, i / 3)), i < 1 ? '#555b66' : '#3b4049');
  // пламя
  if (thr > 0.02) {
    const fl = Math.round((6 + (lvl.engine || 0) * 0.4) * thr);
    for (let i = 0; i < fl; i++) {
      const half = Math.max(1, Math.round(nozzle * (1 - i / (fl + 1)) * (0.8 + 0.2 * Math.sin(app.time * 40 + i))));
      fill(bodyEnd + 4 + i, half, i < fl * 0.35 ? '#fff3c4' : i < fl * 0.7 ? '#ffb627' : '#e8602b');
    }
    ctx.globalAlpha = 0.18 * thr;
    ctx.fillStyle = '#ffb627';
    ctx.beginPath();
    ctx.arc(cx, r.y + (bodyEnd + 6) * q, q * 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // вспышка улучшения
  if (flash > 0) {
    ctx.globalAlpha = flash * 0.6;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - (bodyHalf + 2) * q, r.y, (bodyHalf + 2) * 2 * q, rows * q);
    ctx.globalAlpha = 1;
  }
  // подпись эпохи
  kit.drawText(String(app.rules.eraYear?.(p.era) ?? [1978, 1986, 1998, 2015, 2035, 2060][p.era]), G.schematic.x + G.schematic.w / 2, G.schematic.y + G.schematic.h - kit.fs(14), { size: kit.fs(12), color: kit.c.textMute, align: 'center' });
}

// ---------- горячие точки ----------

function drawSpots(app, kit, L, G, st) {
  const c = kit.c;
  const ctx = kit.S.ctx;
  const p = app.profile;
  const spotById = Object.fromEntries(ROCKET_SPOTS.map((s) => [s.id, s]));
  const cx = G.rocket.x + G.rocket.w / 2;
  for (const id of PART_KEYS) {
    const r = G.spots[id];
    if (!r) continue;
    const ps = app.rules.getPartState(p, id);
    const on = st.selected === id;
    const upgradable = ps.next && !ps.locked.length;
    const lockedReq = ps.next && ps.locked.some((x) => !isFundsReason(x));
    // линия-выноска к силуэту
    const mark = { x: cx, y: G.rocket.y + spotById[id].t * G.rocket.h };
    ctx.strokeStyle = on ? c.amber : 'rgba(138,151,181,0.55)';
    ctx.lineWidth = Math.max(1, Math.round(L.px / 2));
    ctx.setLineDash([L.px, L.px]);
    ctx.beginPath();
    ctx.moveTo(r.side < 0 ? r.x + r.w : r.x, r.y + r.h / 2);
    ctx.lineTo(mark.x, mark.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = on ? c.amber : c.textDim;
    const m = Math.max(3, L.px + 1);
    ctx.fillRect(Math.round(mark.x - m), Math.round(mark.y - m), m * 2, m * 2);

    const clicked = kit.button(`part-${id}`, r, { icon: partIcon(id), variant: on ? 'cardOn' : 'card', iconSize: Math.round(r.w * 0.52), tip: partName(app, id), badge: upgradable ? '!' : undefined, iconColor: ps.level ? c.text : c.textMute });
    if (clicked) st.selected = id;
    if (G.compact) {
      // тесная раскладка: без подписей, уровень цифрой в углу
      if (ps.level) kit.drawText(String(ps.level), r.x + L.px * 3, r.y + r.h - Math.round(8 * L.ui), { size: kit.fs(12), color: c.amber, weight: 900, shadow: 'rgba(0,0,0,0.9)' });
    } else {
      // подпись снаружи: название в одну-две строки и уровень
      const lx = r.side < 0 ? r.x - L.gap : r.x + r.w + L.gap;
      const align = r.side < 0 ? 'right' : 'left';
      const maxW = r.side < 0 ? lx - G.schematic.x - L.gap * 0.5 : G.schematic.x + G.schematic.w - lx - L.gap * 0.5;
      const nsize = kit.fs(12);
      const shortName = partShort(app, id);
      const fitted = shortName.includes(' ') ? null : kit.text.fit(shortName, maxW, nsize, 800, 0.6);
      const lines = fitted ? [fitted.str] : kit.text.wrap(shortName, maxW, nsize).slice(0, 2);
      const lh = nsize * 1.15;
      const blockH = lines.length * lh + kit.fs(11) * 1.2;
      let ty = r.y + (r.h - blockH) / 2 + lh / 2;
      for (const ln of lines) {
        kit.drawText(ln, lx, ty, { size: nsize, color: on ? c.amber : c.text, align, maxWidth: maxW });
        ty += lh;
      }
      kit.drawText(ps.level ? t('rocket.lvl', { n: ps.level }) : t('rocket.none'), lx, ty + kit.fs(2), { size: kit.fs(11), color: ps.level ? c.amber : c.textMute, align, maxWidth: maxW });
    }
    if (lockedReq) kit.icon('lock', r.side < 0 ? r.x + 8 * L.ui : r.x + r.w - 8 * L.ui, r.y + r.h - 8 * L.ui, Math.round(12 * L.ui), c.amber);
  }
}

// ---------- панель модуля ----------

function drawPanel(app, kit, L, G, st) {
  const c = kit.c;
  const p = app.profile;
  const id = st.selected;
  const ps = app.rules.getPartState(p, id);
  const inner = kit.panel(G.panel, { title: partName(app, id), titleIcon: partIcon(id), variant: 'panel' });
  const footerH = L.touch(56) + L.gap;
  const body = { x: inner.x, y: inner.y, w: inner.w, h: inner.h - footerH };
  const rows = statRows(app, id);
  const funds = ps.locked.filter(isFundsReason);
  const blocking = ps.locked.filter((x) => !isFundsReason(x));
  const size = kit.fs(13);

  kit.scrollArea(`rocket-panel-${id}`, body, undefined, (top) => {
    let y = top;
    kit.drawText(t('rocket.level', { n: ps.level, max: ps.max }), body.x, y + size * 0.7, { size: kit.fs(14), color: c.amber });
    y += size * 1.5;
    levelPips(kit, { x: body.x, y, w: body.w - L.px * 3, h: Math.round(L.ui * 7) }, ps.level, ps.max, ps.cap);
    y += Math.round(L.ui * 7) + L.gap;
    if (ps.next) {
      if (blocking.length) {
        y += L.gap * 0.5;
        y += drawReasons(app, kit, body.x, y, body.w - L.px * 3, blocking, { goto: (key) => app.go('base', { select: key }, { push: true }) });
      }
      if (rows.length) {
        kit.drawText(t('rocket.change'), body.x, y + size * 0.6, { size: kit.fs(12), color: c.textMute });
        y += size * 1.4;
        const rowH = Math.round(40 * L.ui);
        for (const row of rows.slice(0, 5)) {
          kit.statDelta({ x: body.x, y, w: body.w - L.px * 3, h: rowH }, row);
          y += rowH + L.gap * 0.5;
        }
      }
    } else {
      kit.drawText(t('rocket.maxed'), body.x, y + size * 0.7, { size: kit.fs(14), color: c.green });
      y += size * 1.8;
    }
    y += kit.paragraph(partDesc(app, id), body.x, y, body.w - L.px * 3, { size, color: c.textDim, lineHeight: 1.25 }) + L.gap;
    return y - top + L.gap;
  });

  const fy = inner.y + inner.h - footerH + L.gap;
  const have = { coins: p.coins, data: p.data };
  if (ps.next) {
    kit.costChip(inner.x, fy + L.touch(56) / 2, { coins: ps.next.cost, data: ps.next.data }, { have });
    const btnW = Math.round(inner.w * 0.5);
    const can = ps.locked.length === 0;
    const sub = funds.length && !blocking.length ? t('card.needFunds') : blocking.length ? t('card.locked') : undefined;
    if (kit.button(`buy-${id}`, { x: inner.x + inner.w - btnW, y: fy, w: btnW, h: L.touch(56) }, { label: ps.level ? t('card.upgrade') : t('card.install'), variant: 'primary', disabled: !can, sub, icon: 'plus', size: kit.fs(16) })) {
      const res = app.buyPart(id);
      if (res.ok) kit.toast(t('rocket.done', { name: partName(app, id) }), { kind: 'good', icon: partIcon(id) });
    }
  }
}
