// «Что дальше»: следующие шаги прогресса для подсказок интерфейса (хаб, итоги, мастерская, база).
//
// Источник — rules.getNextSteps(profile, limit) -> [{ kind, id, cost, affordable, reasons, text, ... }]:
//   kind 'buy-part' | 'buy-building' (id — ключ, cost — монеты, data — данные, level — покупаемый уровень),
//   'era' (переход в следующую эпоху, reasons — чего не хватает), 'fly' (нужен полёт: goal), 'wait' (в этой эпохе всё сделано).
// Остальные флаги интерфейса (есть ли доступная покупка, упёрлись ли в потолок эпохи, близок ли переход) считаются здесь же
// по полному списку шагов: они не зависят от лимита, с которым список показывается.

import { t } from '../i18n/index.js';
import { fmtInt } from './format.js';

/** Форма слова «монет» после числа n: 1 монета, 2 монеты, 5 монет (ключи unit.coin.*). */
function coinWord(n) {
  const a = Math.abs(Math.round(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return t('unit.coin.many');
  if (b === 1) return t('unit.coin.one');
  if (b > 1 && b < 5) return t('unit.coin.few');
  return t('unit.coin.many');
}

/** Человекочитаемая причина блокировки целиком: «Нужна эпоха 1986», «Не хватает 120 монет», «Нужна башня обслуживания ур. 1». */
export function reasonFull(app, r) {
  if (typeof r === 'string') return r;
  switch (r.kind) {
    case 'era':
      return t('reason.era', { year: app.data.ERAS?.[r.era]?.year ?? r.era });
    case 'coins': {
      const n = Math.max(0, r.need - r.have);
      return t('reason.coins', { n: fmtInt(n), unit: coinWord(n) });
    }
    case 'data':
      return t('reason.data', { n: fmtInt(Math.max(0, r.need - r.have)) });
    default:
      return r.text || '';
  }
}

/** Доля уже выполненного в условиях эпохи (0..1): денежные и по постройкам — по заполненности, остальные — выполнено или нет. */
function eraProgress(es) {
  const cs = es?.conditions || [];
  if (!cs.length) return 0;
  let sum = 0;
  for (const c of cs) {
    if (c.ok) sum += 1;
    else if ((c.kind === 'coins' || c.kind === 'data' || c.kind === 'buildings') && c.need > 0) sum += Math.min(1, c.have / c.need);
  }
  return sum / cs.length;
}

/** Первая буква строчная: причина эры встаёт в середину фразы. */
const lower = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/**
 * Сводка для интерфейса по профилю app.profile (кэшируется по объекту профиля):
 *   steps   — первые limit шагов (rules.getNextSteps),
 *   part / building — есть ли сейчас доступная покупка модуля / постройки (для отметки «!» на кнопках),
 *   era     — { ok, near, year, missing[], text } или null в последней эпохе,
 *   capped  — упёрлись в потолок эпохи: покупать нечего (всё закрыто эпохой или куплено до максимума).
 */
export function nextSummary(app, limit = 4) {
  const p = app.profile;
  const cache = (app.nextCache ||= {});
  if (cache.profile === p && cache.limit === limit) return cache.value;
  const rules = app.rules;
  const steps = (rules.getNextSteps ? rules.getNextSteps(p, limit) : []) || [];
  const all = (rules.getNextSteps ? rules.getNextSteps(p, 99) : []) || [];
  const eraStep = all.find((s) => s.kind === 'era') || null;
  let era = null;
  if (eraStep) {
    const es = rules.getEraState(p);
    era = {
      ok: !!eraStep.affordable,
      near: !eraStep.affordable && eraProgress(es) >= 0.7,
      year: app.data.ERAS?.[p.era + 1]?.year,
      missing: (eraStep.reasons || []).map((r) => lower(r.text)),
      text: eraStep.text,
    };
  }
  const buys = all.filter((s) => s.kind === 'buy-part' || s.kind === 'buy-building');
  const value = {
    steps,
    part: all.some((s) => s.kind === 'buy-part' && s.affordable),
    building: all.some((s) => s.kind === 'buy-building' && s.affordable),
    era,
    capped: !!era && buys.length === 0,
  };
  cache.profile = p;
  cache.limit = limit;
  cache.value = value;
  return value;
}
