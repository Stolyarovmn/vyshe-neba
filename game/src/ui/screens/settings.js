// Настройки: щиток управления из металлических секций с заклёпками. Громкость — рычажки в пазах со светодиодной шкалой,
// переключатели — тумблеры с лампами. Звук, управление, доступность, сохранение, язык.

import { t } from '../../i18n/index.js';
import { settingsLayout } from '../layout.js';
import { clamp } from '../format.js';
import { downloadText, copyText, pickTextFile, readClipboard } from '../dom.js';
import { drawChrome } from './common.js';
import { savePrefs } from '../bridge.js';

function state(app) {
  return ((app.ui ||= {}).settings ||= { confirmReset: false, note: '' });
}

export default {
  id: 'settings',
  background: 'hubdim',
  enter(app) {
    const st = state(app);
    st.confirmReset = false;
    st.note = '';
  },
  draw(app, kit, L) {
    const st = state(app);
    const c = kit.c;
    const G = settingsLayout(L);
    drawChrome(app, kit, { back: true });
    kit.hit('settings-bg', G.card, {});
    const area = G.card;
    const s = app.settings;
    const cc = kit.cell();
    const rowH = L.touch(54);
    const sectionPad = Math.round(L.pad * 0.8);
    const headH = Math.round(30 * L.ui);

    // секции: заголовок и строки (подпись слева, управление справа)
    const half = (r, i) => {
      const w = (r.w - L.gap * 0.5) / 2;
      return { x: r.x + i * (w + L.gap * 0.5), y: r.y, w, h: r.h };
    };
    const sections = [
      {
        title: t('settings.sound'), icon: 'sound',
        rows: [
          ...[['master', 'settings.master'], ['music', 'settings.music'], ['sfx', 'settings.sfx']].map(([key, label]) => ({
            label: t(label),
            draw: (r) => {
              const v = kit.slider(`set-${key}`, r, s[key], { step: 0.05 });
              if (Math.abs(v - s[key]) > 1e-6) app.setSetting(key, Math.round(v * 100) / 100);
            },
          })),
          { label: t('settings.mute'), draw: (r) => { if (kit.toggle('set-mute', r, !!app.prefs.muted) !== !!app.prefs.muted) app.toggleMute(); } },
        ],
      },
      {
        title: t('settings.controls'), icon: 'gear',
        rows: [
          {
            label: t('settings.mode'),
            draw: (r) => {
              for (const [i, mode] of ['arcade', 'pilot'].entries()) {
                if (kit.button(`set-mode-${mode}`, half(r, i), { label: t(`mode.${mode}`), variant: s.controlMode === mode ? 'primary' : 'btn', size: kit.fs(13), lamp: s.controlMode === mode ? c.green : false })) app.setSetting('controlMode', mode);
              }
            },
          },
          { note: t(`mode.${s.controlMode}.desc`) },
          {
            label: t('settings.layout'),
            draw: (r) => {
              for (const [i, lay] of ['right', 'left'].entries()) {
                if (kit.button(`set-layout-${lay}`, half(r, i), { label: t(`layout.${lay}`), variant: s.touchLayout === lay ? 'primary' : 'btn', size: kit.fs(13), lamp: s.touchLayout === lay ? c.green : false })) app.setSetting('touchLayout', lay);
              }
            },
          },
          {
            label: t('settings.sens'),
            draw: (r) => {
              const cur = app.prefs.sensitivity ?? 1;
              const v = kit.slider('set-sens', r, clamp((cur - 0.5) / 1.0, 0, 1), { step: 0.05 });
              const next = Math.round((0.5 + v) * 20) / 20;
              if (Math.abs(next - cur) > 1e-6) {
                app.prefs.sensitivity = next;
                savePrefs(app.prefs);
                app.applySettings();
              }
            },
          },
          {
            label: t('settings.touchControls'), minW: L.touch(48) * 3 + L.gap,
            draw: (r) => {
              const w3 = (r.w - L.gap) / 3;
              ['auto', 'on', 'off'].forEach((o, i) => {
                if (kit.button(`set-touch-${o}`, { x: r.x + i * (w3 + L.gap * 0.5), y: r.y, w: w3, h: r.h }, { label: t(`touch.${o}`), variant: app.prefs.touchControls === o ? 'primary' : 'btn', size: kit.fs(11), lamp: app.prefs.touchControls === o ? c.green : false })) {
                  app.prefs.touchControls = o;
                  savePrefs(app.prefs);
                }
              });
            },
          },
          { label: t('settings.help'), draw: (r) => { if (kit.button('set-help', r, { label: t('settings.helpShow'), icon: 'info', variant: 'btn', size: kit.fs(13) })) app.queueCard('help', true); } },
        ],
      },
      {
        title: t('settings.access'), icon: 'eye',
        rows: [
          { label: t('settings.reduceMotion'), draw: (r) => { if (kit.toggle('set-motion', r, !!s.reduceMotion) !== !!s.reduceMotion) app.setSetting('reduceMotion', !s.reduceMotion); } },
          { label: t('settings.colorblind'), draw: (r) => { if (kit.toggle('set-cb', r, !!s.colorblind) !== !!s.colorblind) app.setSetting('colorblind', !s.colorblind); } },
          {
            label: t('settings.vibrate'),
            draw: (r) => {
              if (kit.toggle('set-vib', r, !!s.vibrate) !== !!s.vibrate) {
                app.setSetting('vibrate', !s.vibrate);
                if (!s.vibrate) app.haptic(30);
              }
            },
          },
          {
            label: t('settings.textScale'),
            draw: (r) => {
              const bw = Math.max(L.touch(48), Math.round(r.w * 0.28));
              if (kit.button('set-text-minus', { x: r.x, y: r.y, w: bw, h: r.h }, { label: 'A-', variant: 'btn', size: kit.fs(14), disabled: s.textScale <= 0.8 })) app.setSetting('textScale', Math.max(0.8, Math.round((s.textScale - 0.1) * 10) / 10));
              kit.drawText(`${Math.round(s.textScale * 100)}%`, r.x + r.w / 2, r.y + r.h / 2, { size: kit.fs(14), color: c.text, align: 'center' });
              if (kit.button('set-text-plus', { x: r.x + r.w - bw, y: r.y, w: bw, h: r.h }, { label: 'A+', variant: 'btn', size: kit.fs(14), disabled: s.textScale >= 1.6 })) app.setSetting('textScale', Math.min(1.6, Math.round((s.textScale + 0.1) * 10) / 10));
            },
          },
        ],
      },
      {
        title: t('settings.save'), icon: 'export',
        rows: [
          {
            wide: true,
            draw: (r) => {
              const third = (r.w - L.gap * 2) / 3;
              if (kit.button('set-export', { x: r.x, y: r.y, w: third, h: r.h }, { label: t('settings.export'), icon: 'export', variant: 'btn', size: kit.fs(12) })) exportSave(app, st);
              if (kit.button('set-import', { x: r.x + third + L.gap, y: r.y, w: third, h: r.h }, { label: t('settings.import'), icon: 'import', variant: 'btn', size: kit.fs(12) })) importSave(app, st, 'file');
              if (kit.button('set-paste', { x: r.x + (third + L.gap) * 2, y: r.y, w: third, h: r.h }, { label: t('settings.paste'), icon: 'import', variant: 'btn', size: kit.fs(12) })) importSave(app, st, 'clipboard');
            },
          },
          ...(st.note ? [{ note: st.note, color: st.noteKind === 'bad' ? c.red : c.green }] : []),
          {
            wide: true,
            draw: (r) => {
              if (kit.button('set-reset', r, { label: st.confirmReset ? t('settings.resetConfirm') : t('settings.reset'), icon: 'close', variant: 'danger', size: kit.fs(13) })) {
                if (st.confirmReset) {
                  app.resetProgress();
                  st.confirmReset = false;
                } else st.confirmReset = true;
              }
            },
          },
        ],
      },
      {
        title: t('settings.language'), icon: 'info',
        rows: [
          {
            label: t('settings.language.name'),
            draw: (r) => {
              kit.button('set-lang-ru', half(r, 0), { label: 'RU', variant: 'primary', size: kit.fs(13), lamp: c.green });
              kit.button('set-lang-en', half(r, 1), { label: 'EN', variant: 'btn', size: kit.fs(13), disabled: true });
            },
          },
        ],
      },
    ];

    kit.scrollArea('settings-scroll', area, undefined, (top) => {
      let y = top + cc * 2;
      const x0 = area.x + cc * 2;
      const w = area.w - cc * 8;
      const innerW = w - sectionPad * 2;
      const controlW = Math.round(innerW * (L.portrait ? 0.52 : 0.46));
      for (const sec of sections) {
        const noteH = (row) => Math.round(kit.text.blockHeight(row.note, innerW, kit.fs(11), 1.3)) + L.gap * 0.5;
        const heights = sec.rows.map((row) => (row.note ? noteH(row) : rowH + L.gap * 0.4));
        const total = headH + cc * 3 + sectionPad * 2 + heights.reduce((a, b) => a + b, 0);
        kit.nine('raised', x0, y, w, total);
        // шапка секции: приборное стекло с иконкой и названием
        kit.nine('screen', x0 + cc * 3, y + cc * 3, w - cc * 6, headH);
        kit.icon(sec.icon, x0 + cc * 3 + headH * 0.55, y + cc * 3 + headH / 2, Math.round(headH * 0.6), c.amber);
        kit.drawText(sec.title, x0 + cc * 3 + headH * 1.1, y + cc * 3 + headH / 2, { size: kit.fs(13), color: c.amberLight, maxWidth: w - headH * 1.6 });
        let ry = y + cc * 3 + headH + sectionPad;
        sec.rows.forEach((row, i) => {
          const rx = x0 + sectionPad;
          if (row.note) {
            kit.paragraph(row.note, rx, ry, innerW, { size: kit.fs(11), color: row.color || c.textDim, lineHeight: 1.3 });
          } else if (row.wide) {
            row.draw({ x: rx, y: ry + (rowH - Math.min(rowH, L.touch(50))) / 2, w: innerW, h: Math.min(rowH, L.touch(50)) });
          } else {
            const cw = Math.min(innerW - L.gap, Math.max(controlW, row.minW || 0));
            kit.drawText(row.label, rx, ry + rowH / 2, { size: kit.fs(13), color: c.text, maxWidth: innerW - cw - L.gap });
            row.draw({ x: rx + innerW - cw, y: ry + (rowH - Math.min(rowH, L.touch(48))) / 2, w: cw, h: Math.min(rowH, L.touch(48)) });
          }
          ry += heights[i];
        });
        y += total + L.gap;
      }
      return y - top + L.gap;
    });
  },
};

async function exportSave(app, st) {
  const text = app.store.exportText(app.profile);
  const copied = await copyText(text);
  const saved = downloadText('vyshe-neba-save.json', text);
  st.note = copied || saved ? t('settings.exported') : t('settings.exportFail');
  st.noteKind = copied || saved ? 'good' : 'bad';
}

async function importSave(app, st, source) {
  const text = source === 'file' ? await pickTextFile() : await readClipboard();
  if (!text) {
    st.note = t('settings.importEmpty');
    st.noteKind = 'bad';
    return;
  }
  const res = app.store.importText(text);
  if (!res.ok) {
    st.note = `${t('settings.importFail')} ${res.issues?.[0] || ''}`.trim();
    st.noteKind = 'bad';
    return;
  }
  app.replaceProfile(res.profile);
  st.note = t('settings.imported');
  st.noteKind = 'good';
}
