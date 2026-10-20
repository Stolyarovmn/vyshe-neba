// Настройки: звук, управление (Аркада/Пилот, раскладка касаний, чувствительность), доступность,
// сохранение (экспорт/импорт), язык.

import { t } from '../../i18n/index.js';
import { screenFrame, settingsLayout } from '../layout.js';
import { clamp } from '../format.js';
import { downloadText, copyText, pickTextFile, readClipboard } from '../dom.js';
import { drawHeader } from './common.js';
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
    const F = screenFrame(L, { header: true });
    const G = settingsLayout(L);
    drawHeader(app, kit, F.header, { back: true, title: t('settings.title') });
    kit.nine('panel', G.card.x, G.card.y, G.card.w, G.card.h);
    kit.hit('settings-bg', G.card, {});
    const area = { x: G.card.x + L.px * 2, y: G.card.y + L.px * 2, w: G.card.w - L.px * 4, h: G.card.h - L.px * 4 };
    const s = app.settings;
    const rowH = L.touch(54);

    kit.scrollArea('settings-scroll', area, undefined, (top) => {
      let y = top;
      const w = area.w - L.px * 4;
      const x = area.x + L.pad * 0.5;
      const innerW = w - L.pad;
      const section = (title, icon) => {
        y += L.gap;
        kit.icon(icon, x + kit.fs(8), y + kit.fs(10), kit.fs(16), c.amber);
        kit.drawText(title, x + kit.fs(24), y + kit.fs(10), { size: kit.fs(14), color: c.amber });
        kit.rect(x, y + kit.fs(22), innerW, Math.max(1, L.px / 2), c.line);
        y += kit.fs(30);
      };
      const controlW = Math.round(innerW * (L.portrait ? 0.5 : 0.44));
      const row = (label, draw, h = rowH) => {
        kit.drawText(label, x, y + h / 2, { size: kit.fs(14), color: c.text, maxWidth: innerW - controlW - L.gap });
        draw({ x: x + innerW - controlW, y: y + (h - Math.min(h, L.touch(48))) / 2, w: controlW, h: Math.min(h, L.touch(48)) });
        y += h + L.gap * 0.4;
      };

      section(t('settings.sound'), 'sound');
      for (const [key, label] of [['master', 'settings.master'], ['music', 'settings.music'], ['sfx', 'settings.sfx']]) {
        row(t(label), (r) => {
          const v = kit.slider(`set-${key}`, r, s[key], { step: 0.05 });
          if (Math.abs(v - s[key]) > 1e-6) app.setSetting(key, Math.round(v * 100) / 100);
        });
      }
      row(t('settings.mute'), (r) => {
        if (kit.toggle('set-mute', r, !!app.prefs.muted) !== !!app.prefs.muted) app.toggleMute();
      });

      section(t('settings.controls'), 'gear');
      row(t('settings.mode'), (r) => {
        const half = (r.w - L.gap * 0.5) / 2;
        for (const [i, mode] of ['arcade', 'pilot'].entries()) {
          if (kit.button(`set-mode-${mode}`, { x: r.x + i * (half + L.gap * 0.5), y: r.y, w: half, h: r.h }, { label: t(`mode.${mode}`), variant: s.controlMode === mode ? 'primary' : 'btn', size: kit.fs(13) })) app.setSetting('controlMode', mode);
        }
      });
      kit.paragraph(t(`mode.${s.controlMode}.desc`), x, y, innerW, { size: kit.fs(11), color: c.textMute });
      y += kit.text.blockHeight(t(`mode.${s.controlMode}.desc`), innerW, kit.fs(11), 1.25) + L.gap;
      row(t('settings.layout'), (r) => {
        const half = (r.w - L.gap * 0.5) / 2;
        for (const [i, lay] of ['right', 'left'].entries()) {
          if (kit.button(`set-layout-${lay}`, { x: r.x + i * (half + L.gap * 0.5), y: r.y, w: half, h: r.h }, { label: t(`layout.${lay}`), variant: s.touchLayout === lay ? 'primary' : 'btn', size: kit.fs(13) })) app.setSetting('touchLayout', lay);
        }
      });
      row(t('settings.sens'), (r) => {
        const cur = app.prefs.sensitivity ?? 1;
        const v = kit.slider('set-sens', r, clamp((cur - 0.5) / 1.0, 0, 1), { step: 0.05 });
        const next = Math.round((0.5 + v) * 20) / 20;
        if (Math.abs(next - cur) > 1e-6) {
          app.prefs.sensitivity = next;
          savePrefs(app.prefs);
          app.applySettings();
        }
      });
      row(t('settings.touchControls'), (r) => {
        const opts = ['auto', 'on', 'off'];
        const w3 = (r.w - L.gap) / 3;
        opts.forEach((o, i) => {
          if (kit.button(`set-touch-${o}`, { x: r.x + i * (w3 + L.gap * 0.5), y: r.y, w: w3, h: r.h }, { label: t(`touch.${o}`), variant: app.prefs.touchControls === o ? 'primary' : 'btn', size: kit.fs(11) })) {
            app.prefs.touchControls = o;
            savePrefs(app.prefs);
          }
        });
      });
      row(t('settings.help'), (r) => {
        if (kit.button('set-help', r, { label: t('settings.helpShow'), icon: 'info', variant: 'btn', size: kit.fs(13) })) app.queueCard('help', true);
      });

      section(t('settings.access'), 'eye');
      row(t('settings.reduceMotion'), (r) => {
        if (kit.toggle('set-motion', r, !!s.reduceMotion) !== !!s.reduceMotion) app.setSetting('reduceMotion', !s.reduceMotion);
      });
      row(t('settings.colorblind'), (r) => {
        if (kit.toggle('set-cb', r, !!s.colorblind) !== !!s.colorblind) app.setSetting('colorblind', !s.colorblind);
      });
      row(t('settings.vibrate'), (r) => {
        if (kit.toggle('set-vib', r, !!s.vibrate) !== !!s.vibrate) {
          app.setSetting('vibrate', !s.vibrate);
          if (!s.vibrate) app.haptic(30);
        }
      });
      row(t('settings.textScale'), (r) => {
        const bw = Math.round(r.w * 0.28);
        if (kit.button('set-text-minus', { x: r.x, y: r.y, w: bw, h: r.h }, { label: 'A−', variant: 'btn', size: kit.fs(14), disabled: s.textScale <= 0.8 })) app.setSetting('textScale', Math.max(0.8, Math.round((s.textScale - 0.1) * 10) / 10));
        kit.drawText(`${Math.round(s.textScale * 100)}%`, r.x + r.w / 2, r.y + r.h / 2, { size: kit.fs(14), color: c.text, align: 'center', dynamic: true });
        if (kit.button('set-text-plus', { x: r.x + r.w - bw, y: r.y, w: bw, h: r.h }, { label: 'A+', variant: 'btn', size: kit.fs(14), disabled: s.textScale >= 1.6 })) app.setSetting('textScale', Math.min(1.6, Math.round((s.textScale + 0.1) * 10) / 10));
      });

      section(t('settings.save'), 'export');
      const third = (innerW - L.gap * 2) / 3;
      const brow = { y, h: L.touch(50) };
      if (kit.button('set-export', { x, y: brow.y, w: third, h: brow.h }, { label: t('settings.export'), icon: 'export', variant: 'btn', size: kit.fs(12) })) exportSave(app, st);
      if (kit.button('set-import', { x: x + third + L.gap, y: brow.y, w: third, h: brow.h }, { label: t('settings.import'), icon: 'import', variant: 'btn', size: kit.fs(12) })) importSave(app, st, 'file');
      if (kit.button('set-paste', { x: x + (third + L.gap) * 2, y: brow.y, w: third, h: brow.h }, { label: t('settings.paste'), icon: 'import', variant: 'btn', size: kit.fs(12) })) importSave(app, st, 'clipboard');
      y += brow.h + L.gap;
      if (st.note) {
        y += kit.paragraph(st.note, x, y, innerW, { size: kit.fs(12), color: st.noteKind === 'bad' ? c.red : c.green }) + L.gap;
      }
      if (kit.button('set-reset', { x, y, w: innerW, h: L.touch(50) }, { label: st.confirmReset ? t('settings.resetConfirm') : t('settings.reset'), icon: 'close', variant: 'danger', size: kit.fs(13) })) {
        if (st.confirmReset) {
          app.resetProgress();
          st.confirmReset = false;
        } else st.confirmReset = true;
      }
      y += L.touch(50) + L.gap;

      section(t('settings.language'), 'info');
      row(t('settings.language.name'), (r) => {
        const half = (r.w - L.gap * 0.5) / 2;
        kit.button('set-lang-ru', { x: r.x, y: r.y, w: half, h: r.h }, { label: 'RU', variant: 'primary', size: kit.fs(13) });
        kit.button('set-lang-en', { x: r.x + half + L.gap * 0.5, y: r.y, w: half, h: r.h }, { label: 'EN', variant: 'btn', size: kit.fs(13), disabled: true });
      });
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
