// Настройки: щиток управления из металлических секций с заклёпками. Громкость — рычажки в пазах со светодиодной шкалой,
// переключатели — тумблеры с лампами. Звук, управление, доступность, сохранение, язык.
//
// Правила разметки (см. UI_LANGUAGE.md, «Отступы и текст»): у всех кнопок одной группы один масштаб шрифта; слово не влезает —
// подпись переносится на отдельную строку над органом управления, а группа получает всю ширину, шрифт не уменьшается;
// индикатор-точка в углу кнопки имеет своё место в поле кнопки и не заходит на буквы.

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
    const labelSize = kit.fs(13);
    const btnSize = kit.fs(13);
    // секции лежат на корпусе эпохи: у светлого материала (слоновая кость, серый пластик, алюминий) подписи тёмные
    const rawMid = kit.frameMid('raised');
    const inkText = kit.readable(c.text, rawMid);
    const inkDim = kit.readable(c.textDim, rawMid);

    /** Ряд кнопок-вариантов: общий масштаб шрифта, активная горит лампой. */
    const options = (id, opts) => ({
      options: opts.map((o) => ({ ...o })),
      draw: (r) => {
        const n = opts.length;
        const w = (r.w - L.gap * 0.5 * (n - 1)) / n;
        opts.forEach((o, i) => {
          if (kit.button(o.id, { x: r.x + i * (w + L.gap * 0.5), y: r.y, w, h: r.h }, { label: o.label, variant: o.active ? 'primary' : 'btn', size: btnSize, fixedScale: true, lamp: o.active ? c.green : false, disabled: o.disabled })) o.onClick?.();
        });
      },
      id,
    });

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
            ...options('mode', ['arcade', 'pilot'].map((m) => ({ id: `set-mode-${m}`, label: t(`mode.${m}`), active: s.controlMode === m, onClick: () => app.setSetting('controlMode', m) }))),
          },
          { note: t(`mode.${s.controlMode}.desc`) },
          {
            label: t('settings.layout'),
            ...options('layout', ['right', 'left'].map((m) => ({ id: `set-layout-${m}`, label: t(`layout.${m}`), active: s.touchLayout === m, onClick: () => app.setSetting('touchLayout', m) }))),
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
            label: t('settings.touchControls'),
            ...options('touch', ['auto', 'on', 'off'].map((m) => ({
              id: `set-touch-${m}`, label: t(`touch.${m}`), active: app.prefs.touchControls === m,
              onClick: () => {
                app.prefs.touchControls = m;
                savePrefs(app.prefs);
              },
            }))),
          },
          { label: t('settings.help'), draw: (r) => { if (kit.button('set-help', r, { label: t('settings.helpShow'), icon: 'info', variant: 'btn', size: btnSize })) app.queueCard('help', true); } },
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
              if (kit.button('set-text-minus', { x: r.x, y: r.y, w: bw, h: r.h }, { label: 'A-', variant: 'btn', size: btnSize, fixedScale: true, disabled: s.textScale <= 0.8 })) app.setSetting('textScale', Math.max(0.8, Math.round((s.textScale - 0.1) * 10) / 10));
              kit.drawText(`${Math.round(s.textScale * 100)}%`, r.x + r.w / 2, r.y + r.h / 2, { size: btnSize, color: inkText, align: 'center' });
              if (kit.button('set-text-plus', { x: r.x + r.w - bw, y: r.y, w: bw, h: r.h }, { label: 'A+', variant: 'btn', size: btnSize, fixedScale: true, disabled: s.textScale >= 1.6 })) app.setSetting('textScale', Math.min(1.6, Math.round((s.textScale + 0.1) * 10) / 10));
            },
          },
        ],
      },
      {
        title: t('settings.save'), icon: 'export',
        rows: [
          {
            // три действия с сохранением: в ряд со значками; не помещаются — без значков; и так тесно — по одному в строке
            group: [
              { id: 'set-export', label: t('settings.export'), icon: 'export', onClick: () => exportSave(app, st) },
              { id: 'set-import', label: t('settings.import'), icon: 'import', onClick: () => importSave(app, st, 'file') },
              { id: 'set-paste', label: t('settings.paste'), icon: 'import', onClick: () => importSave(app, st, 'clipboard') },
            ],
          },
          ...(st.note ? [{ note: st.note, color: st.noteKind === 'bad' ? c.red : c.green }] : []),
          {
            wide: true,
            draw: (r) => {
              if (kit.button('set-reset', r, { label: st.confirmReset ? t('settings.resetConfirm') : t('settings.reset'), icon: 'close', variant: 'danger', size: btnSize })) {
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
            ...options('lang', [
              { id: 'set-lang-ru', label: 'RU', active: true },
              { id: 'set-lang-en', label: 'EN', active: false, disabled: true },
            ]),
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
      const ctrlH = Math.min(rowH, L.touch(48));
      const labelH = Math.round(kit.fs(13) * 1.9);

      /** План строки: высота, стоит ли подпись над органом управления, ширина органа управления. */
      const plan = (row) => {
        if (row.note) return { h: Math.round(kit.text.blockHeight(row.note, innerW, kit.fs(11), 1.3)) + Math.round(L.gap * 0.5), note: true };
        if (row.wide) return { h: rowH + Math.round(L.gap * 0.4), wide: true };
        if (row.group) {
          const size = kit.fs(12);
          const sum = (icon) => row.group.reduce((a, b) => a + kit.buttonNeed(b.label, size, { icon: icon ? b.icon : undefined }), L.gap * (row.group.length - 1));
          const mode = sum(true) <= innerW ? 'icons' : sum(false) <= innerW ? 'plain' : 'column';
          const n = row.group.length;
          const h = mode === 'column' ? n * ctrlH + (n - 1) * Math.round(L.gap * 0.5) + Math.round(L.gap * 0.6) : rowH + Math.round(L.gap * 0.4);
          return { h, group: mode, size };
        }
        let cw = Math.min(innerW - L.gap, Math.max(controlW, row.minW || 0));
        let stacked = kit.text.measure(row.label, labelSize) > innerW - cw - L.gap;
        if (row.options) {
          const need = Math.max(...row.options.map((o) => kit.buttonNeed(o.label, btnSize, { lamp: true })));
          const fits = (ww) => (ww - L.gap * 0.5 * (row.options.length - 1)) / row.options.length >= need;
          if (!fits(cw)) stacked = true;
        }
        if (stacked) cw = innerW;
        return { h: stacked ? labelH + ctrlH + Math.round(L.gap * 0.8) : rowH + Math.round(L.gap * 0.4), stacked, cw };
      };

      for (const sec of sections) {
        const plans = sec.rows.map(plan);
        const total = headH + cc * 3 + sectionPad * 2 + plans.reduce((a, p) => a + p.h, 0);
        kit.nine('raised', x0, y, w, total);
        // шапка секции: приборное стекло с иконкой и названием
        kit.nine('screen', x0 + cc * 3, y + cc * 3, w - cc * 6, headH);
        kit.icon(sec.icon, x0 + cc * 3 + headH * 0.55, y + cc * 3 + headH / 2, Math.round(headH * 0.6), c.amber);
        kit.drawText(sec.title, x0 + cc * 3 + headH * 1.1, y + cc * 3 + headH / 2, { size: kit.fs(13), color: c.amberLight, maxWidth: w - headH * 1.6 });
        let ry = y + cc * 3 + headH + sectionPad;
        sec.rows.forEach((row, i) => {
          const rx = x0 + sectionPad;
          const p = plans[i];
          if (p.note) {
            kit.paragraph(row.note, rx, ry, innerW, { size: kit.fs(11), color: kit.readable(row.color || c.textDim, rawMid), lineHeight: 1.3 });
          } else if (p.wide) {
            row.draw({ x: rx, y: ry + (rowH - ctrlH) / 2, w: innerW, h: ctrlH });
          } else if (p.group) {
            const n = row.group.length;
            const bw = (innerW - L.gap * (n - 1)) / n;
            const step = ctrlH + Math.round(L.gap * 0.5);
            row.group.forEach((b, j) => {
              const rect = p.group === 'column' ? { x: rx, y: ry + j * step, w: innerW, h: ctrlH } : { x: rx + j * (bw + L.gap), y: ry + (rowH - ctrlH) / 2, w: bw, h: ctrlH };
              if (kit.button(b.id, rect, { label: b.label, icon: p.group === 'plain' ? undefined : b.icon, variant: 'btn', size: p.size, fixedScale: true })) b.onClick();
            });
          } else if (p.stacked) {
            kit.drawText(row.label, rx, ry + labelH / 2, { size: labelSize, color: inkText, maxWidth: innerW });
            row.draw({ x: rx, y: ry + labelH, w: innerW, h: ctrlH });
          } else {
            kit.drawText(row.label, rx, ry + rowH / 2, { size: labelSize, color: inkText, maxWidth: innerW - p.cw - L.gap });
            row.draw({ x: rx + innerW - p.cw, y: ry + (rowH - ctrlH) / 2, w: p.cw, h: ctrlH });
          }
          ry += p.h;
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
