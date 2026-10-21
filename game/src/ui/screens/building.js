// Щиток постройки: общий для хаба (тап по зданию) и режима строительства. Покупка запускает стройку на острове.

import { t } from '../../i18n/index.js';
import {
  infoCallout, deltaRows, isFundsReason, buildingIcon, buildingShort,
} from './common.js';

/** Рамка здания на экране (CSS px) для прикрепления выноски или null, если оно не нарисовано. */
export function worldTarget(app, key) {
  const hub = app.renderer.hub;
  try {
    const list = hub.screenRects?.(key);
    if (list && list.length) {
      const q = list[0];
      return { x: q.x0, y: q.y0, w: q.x1 - q.x0, h: q.y1 - q.y0 };
    }
    const pos = hub.screenPos?.(key);
    if (pos) return { x: pos.x - 12, y: pos.y - 12, w: 24, h: 24 };
  } catch {
    /* рендер необязателен */
  }
  return null;
}

/**
 * Рисует щиток постройки key. o: target (рамка объекта) или anchor, bounds, side, goto(buildingKey), onBought(key).
 * Возвращает состояние постройки.
 */
export function drawBuildingCallout(app, kit, key, o = {}) {
  const p = app.profile;
  const st = app.rules.getBuildingState(p, key);
  const infos = app.data.BUILDINGS?.[key]?.effectInfo || [];
  const rows = st.next ? deltaRows(infos, st.effects, st.next.effects).filter((r) => r.changed) : [];
  const power = st.next?.power;
  const c = kit.c;
  const hasPower = !!(power && (power.supply || power.use));
  infoCallout(app, kit, {
    id: `bld-${key}`,
    target: o.target,
    anchor: o.anchor,
    bounds: o.bounds,
    side: o.side,
    name: buildingShort(app, key),
    iconName: buildingIcon(key, st.level || 1),
    iconAlpha: st.level ? 1 : 0.6,
    level: st.level,
    max: st.max,
    cap: st.cap,
    rows,
    locks: st.locked,
    goto: o.goto,
    next: st.next ? true : false,
    cost: st.next ? { coins: st.next.cost, data: st.next.data } : null,
    canBuy: st.next && st.locked.length === 0,
    buyLabel: st.level === 0 ? t('card.build') : t('card.upgrade'),
    buyId: `build-${key}`,
    extraH: hasPower ? (uu) => Math.round(26 * uu) : 0,
    extra: hasPower
      ? (r, uu) => {
        const good = !!power.supply;
        kit.icon('bolt', r.x + Math.round(10 * uu), r.y + Math.round(13 * uu), Math.round(18 * uu), good ? c.green : c.amber);
        kit.drawText(good ? `+${power.supply}` : `−${power.use}`, r.x + Math.round(26 * uu), r.y + Math.round(13 * uu), { size: kit.fs(13), color: good ? c.green : c.amber });
        return Math.round(26 * uu);
      }
      : undefined,
    onBuy: () => {
      const res = app.buyBuilding(key);
      if (!res.ok) {
        kit.toast(t('card.cannot'), { kind: 'bad' });
        return;
      }
      kit.toast(t('card.built', { name: buildingShort(app, key) }), { kind: 'good', icon: buildingIcon(key, 1) });
      try {
        app.renderer.hub.playBuild?.(key);
        app.renderer.hub.focus?.(key);
      } catch {
        /* анимация необязательна */
      }
      o.onBought?.(key);
    },
  });
  void isFundsReason;
  return st;
}
