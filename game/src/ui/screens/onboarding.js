// Обучение первого полёта: цепочка подсказок прямо в сцене (не модальные). Шаг хранится в
// profile.settings.tutorial.step, выполненное обучение — в .done. Ничего не блокирует управление.

import { t } from '../../i18n/index.js';

const STEPS = [
  { id: 'thrust', icon: 'boost', target: 'thrust', when: (f) => f.phase === 'pad', done: (f) => f.liftedOff },
  { id: 'tilt', icon: 'back', target: 'tilt', when: (f) => f.liftedOff && f.alt > 20, done: (f, ctx) => ctx.tiltSeen || f.alt > 220 },
  // упёрся в предел наклона: объясняем, что угол растёт с прокачкой стабилизаторов (маневровых)
  {
    id: 'fins', icon: 'fins', target: null,
    when: (f, ctx) => ctx.limitHit && f.liftedOff,
    done: (f, ctx) => ctx.noLimit || f.alt > 300 || (ctx.finsAt !== undefined && f.time - ctx.finsAt > 4),
  },
  { id: 'fuel', icon: 'fuel', target: null, when: (f) => f.alt > 200 || f.fuel01 < 0.8, done: (f) => f.vy > 0 || f.alt > 600 },
  { id: 'descent', icon: 'down', target: 'thrust', when: (f) => f.vy > 3 && f.alt < 700, done: (f) => f.alt < 130 },
  { id: 'land', icon: 'target', target: 'tilt', when: (f) => f.vy > 0 && f.alt < 160, done: (f) => f.ended },
];

export const TUTORIAL_STEPS = STEPS.length;

/** Обновляет шаг обучения и возвращает подсказку { text, icon, target } или null. */
export function tutorialHint(app, s) {
  const tut = app.settings.tutorial;
  if (!tut || tut.done) return null;
  const f = s.flight;
  const ctx = (s.tutorial ||= { tiltSeen: false });
  if (Math.abs(s.lastInput?.tilt || 0) > 0.3) ctx.tiltSeen = true;
  const lim = f.cfg?.fins?.maxTilt;
  ctx.noLimit = !(typeof lim === 'number' && lim < 3);
  if (!ctx.noLimit && Math.abs(f.angle) >= lim * 0.85) ctx.limitHit = true;
  let step = tut.step;
  while (step < STEPS.length && STEPS[step].done(f, ctx)) step++;
  if (step !== tut.step) app.setSetting('tutorial', { done: false, step });
  const cur = STEPS[step];
  if (!cur || !cur.when(f, ctx)) return null;
  if (cur.id === 'fins' && ctx.finsAt === undefined) ctx.finsAt = f.time;
  const touch = app.touchUi;
  const key = `tut.${cur.id}${touch ? '.touch' : '.key'}`;
  const text = t(key);
  return { text: text === key ? t(`tut.${cur.id}`) : text, icon: cur.icon, target: cur.target };
}

/** Указатель-стрелка над нужным элементом управления (касание) — подсказка «куда нажимать». */
export function drawTutorialPointer(app, kit, L, hint) {
  if (!hint?.target || !app.touchUi) return;
  const hud = L.hud;
  const c = kit.c;
  const bob = app.settings.reduceMotion ? 0 : Math.sin(app.time * 6) * 4;
  let x;
  let y;
  if (hint.target === 'thrust') {
    x = hud.lever.x + hud.lever.w / 2;
    y = hud.lever.y - L.gap * 2 + bob;
  } else {
    x = hud.disc.cx;
    y = hud.disc.cy - hud.disc.r - L.gap * 2 + bob;
  }
  kit.icon('down', x, y, Math.round(24 * L.ui), c.amber);
}
