// Локализация: t('ключ', { параметры }). Структура готова к добавлению en: достаточно положить en.js и зарегистрировать.
import ru from './ru.js';

const LANGS = { ru };
let current = 'ru';

export function setLang(code) {
  if (LANGS[code]) current = code;
}

export const getLang = () => current;
export const languages = () => Object.keys(LANGS);

/** Подставляет {name} из params. Неизвестный ключ возвращается как есть (видно в интерфейсе и ловится тестом). */
export function t(key, params) {
  const dict = LANGS[current] || ru;
  let s = dict[key];
  if (s === undefined) s = ru[key];
  if (s === undefined) return key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

export const hasKey = (key) => key in ru;

/** Склонение по ключу вида 'plural.coin' = 'монета|монеты|монет'. */
export function plural(n, key) {
  const forms = t(key).split('|');
  const a = Math.abs(Math.round(n)) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2] ?? forms[0];
  if (b > 1 && b < 5) return forms[1] ?? forms[0];
  if (b === 1) return forms[0];
  return forms[2] ?? forms[0];
}
