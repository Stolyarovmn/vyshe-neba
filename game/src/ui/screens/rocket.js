// Сборка ракеты: схема с девятью горячими точками-модулями, панель выбранного модуля
// («было → станет», стоимость, требования базы, причина блокировки) и «стенд» двигателя.

import { t } from '../../i18n/index.js';
import { screenFrame, rocketLayout } from '../layout.js';
import { drawAssembly, MODULE_VIEW } from '../../render/rocket-view.js';
import { clamp, lerp } from '../format.js';
import { drawHeader, drawReasons, isFundsReason, levelPips, partIcon, partName, partDesc, deltaRows, partShort, PART_KEYS } from './common.js';

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

let stationLayer = null;

/** Занятые подписями, кнопками и ракетой области схемы: станции мастерской под ними не рисуются. */
function occupiedBoxes(app, kit, L, G) {
  const pad = Math.round(6 * L.ui);
  const grow = (b) => ({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 });
  const boxes = [grow(G.rocket), grow(G.stand)];
  for (const id of PART_KEYS) {
    const r = G.spots[id];
    if (!r) continue;
    boxes.push(grow(r));
    if (G.compact) continue;
    const lb = labelLayout(app, kit, L, G, id);
    boxes.push(grow(lb.box));
  }
  return boxes;
}

/** Фоновые станции эпохи: рисуются в слой, вырезаются под занятые области, приглушаются и кладутся с прозрачностью ≈ 0,55. */
function drawStations(app, kit, L, G) {
  const dpr = L.dpr;
  const sc = G.schematic;
  const w = Math.ceil(sc.w * dpr);
  const h = Math.ceil(sc.h * dpr);
  if (!stationLayer || stationLayer.width !== w || stationLayer.height !== h) {
    stationLayer = document.createElement('canvas');
    stationLayer.width = w;
    stationLayer.height = h;
  }
  const og = stationLayer.getContext('2d');
  og.setTransform(1, 0, 0, 1, 0, 0);
  og.globalCompositeOperation = 'source-over';
  og.clearRect(0, 0, w, h);
  og.setTransform(dpr, 0, 0, dpr, -sc.x * dpr, -sc.y * dpr);
  try {
    app.renderer.workshop.drawStations(og, { era: app.profile.era, rect: sc, time: app.time });
  } catch (err) {
    console.warn('[rocket] drawStations:', err);
    return;
  }
  og.setTransform(1, 0, 0, 1, 0, 0);
  og.globalCompositeOperation = 'source-atop';
  og.fillStyle = 'rgba(8,14,28,0.32)';
  og.fillRect(0, 0, w, h);
  og.globalCompositeOperation = 'destination-out';
  og.fillStyle = '#000';
  for (const b of occupiedBoxes(app, kit, L, G)) og.fillRect(Math.round((b.x - sc.x) * dpr), Math.round((b.y - sc.y) * dpr), Math.round(b.w * dpr), Math.round(b.h * dpr));
  og.globalCompositeOperation = 'source-over';
  const ctx = kit.S.ctx;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.drawImage(stationLayer, sc.x, sc.y, sc.w, sc.h);
  ctx.restore();
}

/** Раскладка подписи модуля у горячей точки: строки, размер шрифта, привязка и охватывающая рамка. */
function labelLayout(app, kit, L, G, id) {
  const r = G.spots[id];
  const ps = app.rules.getPartState(app.profile, id);
  const lx = r.side < 0 ? r.x - L.gap : r.x + r.w + L.gap;
  const align = r.side < 0 ? 'right' : 'left';
  const maxW = r.side < 0 ? lx - G.schematic.x - L.gap * 0.5 : G.schematic.x + G.schematic.w - lx - L.gap * 0.5;
  const shortName = partShort(app, id);
  const nsize = kit.text.fitWords(shortName, maxW, kit.fs(12));
  const lines = kit.text.wrap(shortName, maxW, nsize).slice(0, 2);
  const lh = nsize * 1.15;
  const levelText = ps.level ? t('rocket.lvl', { n: ps.level }) : t('rocket.none');
  const blockH = lines.length * lh + kit.fs(11) * 1.2;
  const w = Math.min(maxW, Math.max(...lines.map((ln) => kit.text.measure(ln, nsize)), kit.text.measure(levelText, kit.fs(11))));
  return { lx, align, maxW, nsize, lines, lh, levelText, blockH, ps, box: { x: r.side < 0 ? lx - w : lx, y: r.y + (r.h - blockH) / 2, w, h: blockH } };
}

/** Сборка настоящими спрайтами эпохи (render/rocket-view.js), подсветка выбранного модуля, вспышка при улучшении. */
function drawSchematic(app, kit, L, G, st, thr) {
  const ctx = kit.S.ctx;
  const c = kit.c;
  const p = app.profile;
  const r = G.rocket;
  // с фоном мастерской рамка стеклянная; станции — приглушённый фон, вырезанный под подписи и кнопки
  kit.nine(app.backdropOn ? 'glass' : 'inset', G.schematic.x, G.schematic.y, G.schematic.w, G.schematic.h);
  if (app.backdropOn && !L.portrait && G.schematic.w > 480 * L.ui && app.renderer.workshop?.drawStations) drawStations(app, kit, L, G);
  const shake = thr > 0 && !app.settings.reduceMotion ? Math.sin(app.time * 90) * thr * 1.2 : 0;
  const cx = r.x + r.w / 2 + shake;
  drawAssembly(ctx, app.renderer.painter, {
    era: p.era,
    parts: p.parts,
    skin: p.skin,
    cx,
    bottom: r.y + r.h,
    height: r.h,
    dpr: L.dpr,
    time: app.time,
    throttle: thr,
  });

  // подсветка выбранного модуля: уголки вокруг его области на сборке
  const view = MODULE_VIEW[st.selected];
  if (view) {
    const pulse = app.settings.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(app.time * 5);
    const pad = Math.round(4 * L.ui);
    const x0 = Math.round(r.x - pad);
    const x1 = Math.round(r.x + r.w + pad);
    const y0 = Math.round(r.y + view.region[0] * r.h - pad);
    const y1 = Math.round(r.y + view.region[1] * r.h + pad);
    const arm = Math.max(8, Math.round(Math.min(x1 - x0, y1 - y0) * 0.3));
    const t = Math.max(2, Math.round(L.px * 0.8));
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = c.amber;
    for (const [px, py, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      ctx.fillRect(sx > 0 ? px : px - arm, sy > 0 ? py : py - t, arm, t);
      ctx.fillRect(sx > 0 ? px : px - t, sy > 0 ? py : py - arm, t, arm);
    }
    ctx.restore();
  }
  // вспышка улучшения
  if (st.flash > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = st.flash * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(r.x - 4, r.y, r.w + 8, r.h);
    ctx.restore();
  }
}

// ---------- горячие точки ----------

function drawSpots(app, kit, L, G, st) {
  const c = kit.c;
  const ctx = kit.S.ctx;
  const p = app.profile;
  const cx = G.rocket.x + G.rocket.w / 2;
  for (const id of PART_KEYS) {
    const r = G.spots[id];
    if (!r) continue;
    const ps = app.rules.getPartState(p, id);
    const on = st.selected === id;
    const upgradable = ps.next && !ps.locked.length;
    const lockedReq = ps.next && ps.locked.some((x) => !isFundsReason(x));
    // линия-выноска к силуэту
    const mark = { x: cx + r.side * G.rocket.w * 0.3, y: G.rocket.y + MODULE_VIEW[id].tAnchor * G.rocket.h };
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

    const clicked = kit.button(`part-${id}`, r, { icon: partIcon(id), variant: on ? 'cardOn' : 'card', iconSize: Math.round(r.w * 0.66), tip: partName(app, id), badge: upgradable ? '!' : undefined, iconColor: ps.level ? c.text : c.textMute });
    if (clicked) st.selected = id;
    if (G.compact) {
      // тесная раскладка: без подписей, уровень цифрой в углу
      if (ps.level) kit.drawText(String(ps.level), r.x + L.px * 3, r.y + r.h - Math.round(8 * L.ui), { size: kit.fs(12), color: c.amber, weight: 900, shadow: 'rgba(0,0,0,0.9)' });
    } else {
      // подпись снаружи: название в одну-две строки и уровень
      const lb = labelLayout(app, kit, L, G, id);
      let ty = lb.box.y + lb.lh / 2;
      for (const ln of lb.lines) {
        kit.drawText(ln, lb.lx, ty, { size: lb.nsize, color: on ? c.amber : c.text, align: lb.align, maxWidth: lb.maxW, shadow: 'rgba(0,0,0,0.85)' });
        ty += lb.lh;
      }
      kit.drawText(lb.levelText, lb.lx, ty + kit.fs(2), { size: kit.fs(11), color: ps.level ? c.amber : c.textMute, align: lb.align, maxWidth: lb.maxW, shadow: 'rgba(0,0,0,0.85)' });
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
  const inner = kit.panel(G.panel, { title: partName(app, id), titleIcon: partIcon(id), variant: app.backdropOn ? 'panelGlass' : 'panel' });
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
