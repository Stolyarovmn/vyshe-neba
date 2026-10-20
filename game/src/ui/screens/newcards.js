// Модальные карточки: «Новое» (первое открытие постройки или эпохи) и справка по управлению.

import { t } from '../../i18n/index.js';
import { buildingIcon, buildingName, buildingDesc, eraName, eraDesc, ERA_YEARS } from './common.js';

const KEY_ROWS = [
  [['W', '↑'], 'help.k.thrust'],
  [['A', 'D'], 'help.k.tilt'],
  [['Q', 'E', 'S'], 'help.k.stab'],
  [['_'], 'help.k.boost'],
  [['X'], 'help.k.chute'],
  [['F', 'R'], 'help.k.items'],
  [['T'], 'help.k.transfer'],
  [['P', 'Esc'], 'help.k.pause'],
];
const TOUCH_ROWS = [
  [['<>'], 'help.t.disc'],
  [['↑↓'], 'help.t.lever'],
  [['2×'], 'help.t.stab'],
  [['F'], 'help.t.boost'],
  [['P'], 'help.t.items'],
  [['II'], 'help.t.pause'],
];

/** Рисует карточку с идентификатором id; возвращает true, когда её закрыли. */
export function drawNewCard(app, kit, id) {
  const L = kit.L;
  if (id === 'help') {
    const rows = app.touchUi ? TOUCH_ROWS : KEY_ROWS;
    const cols = L.portrait ? 1 : 2;
    const rowH = Math.round(24 * L.ui);
    const lines = Math.ceil(rows.length / cols);
    return kit.modal('help', {
      title: t('help.title'),
      kicker: t(app.touchUi ? 'help.touch' : 'help.keys'),
      icon: 'info',
      body: '',
      extraH: lines * rowH + L.gap * 2,
      extra: (r) => drawHelpRows(kit, L, r, rows, cols, rowH),
      button: t('common.ok'),
    });
  }
  const [kind, key] = id.split(':');
  if (kind === 'building') {
    return kit.modal(id, {
      kicker: t('new.kicker'),
      title: buildingName(app, key),
      icon: buildingIcon(key),
      body: buildingDesc(app, key),
      button: t('common.ok'),
    });
  }
  if (kind === 'era') {
    const n = Number(key);
    return kit.modal(id, {
      kicker: t('new.era'),
      title: `${ERA_YEARS[n]} · ${eraName(app, n)}`,
      icon: 'era',
      body: eraDesc(app, n),
      button: t('common.ok'),
    });
  }
  return true;
}

function drawHelpRows(kit, L, r, rows, cols, rowH) {
  const c = kit.c;
  const colW = (r.w - L.gap * (cols - 1)) / cols;
  const size = kit.fs(12);
  rows.forEach(([keys, label], i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x0 = r.x + col * (colW + L.gap);
    const y = r.y + row * rowH + rowH / 2;
    let x = x0;
    for (const k of keys) {
      const w = Math.max(rowH * 0.9, kit.text.measure(k, size) + 10);
      kit.nine('btn', x, y - rowH * 0.4, w, rowH * 0.8, Math.max(1, Math.round(L.px * 0.5)));
      kit.drawText(k, x + w / 2, y, { size, color: c.text, align: 'center', weight: 900 });
      x += w + 3;
    }
    kit.drawText(t(label), x + L.gap, y, { size, color: c.textDim, maxWidth: x0 + colW - x - L.gap });
  });
  return rows.length ? Math.ceil(rows.length / cols) * rowH + L.gap : 0;
}
