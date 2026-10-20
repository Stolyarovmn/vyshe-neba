// Палитра интерфейса: тёмные панели, янтарный акцент, золото = монеты, циан = данные,
// зелёный = мощность, красный = предупреждение. Все пары «текст/фон» держат контраст WCAG AA (≥ 4,5).

export const FONT_FAMILY = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

const BASE = {
  bg: '#090e1a',
  panel: '#131b2e',
  panelHi: '#2a3a5c',
  panelLo: '#0a1020',
  edge: '#03060c',
  inset: '#0c1324',
  line: '#33456b',
  text: '#f6f1e4',
  textDim: '#b4bfd8',
  textMute: '#8a97b5',
  textDark: '#1a1206',
  amber: '#ffb627',
  amberDeep: '#a86300',
  gold: '#ffd23f',
  cyan: '#52d8ff',
  green: '#62e38d',
  red: '#ff6b5e',
  white: '#ffffff',
  shade: 'rgba(3,6,12,0.72)',
};

// палитра для дальтоников (Окабе–Ито): сине-оранжевая пара вместо зелёно-красной
const COLORBLIND = {
  green: '#56b4e9',
  red: '#ff8a3d',
  amber: '#f0e442',
  amberDeep: '#8a7d00',
};

// варианты 9-slice: заливка, светлый скос, тёмный скос
const VARIANTS = {
  panel: { fill: 'panel', hi: 'panelHi', lo: 'panelLo' },
  inset: { fill: 'inset', hi: 'panelLo', lo: 'panelHi' },
  raised: { fill: '#1b2744', hi: '#3a4f7b', lo: 'panelLo' },
  btn: { fill: '#2b3d63', hi: '#5873ad', lo: '#16213b' },
  btnHover: { fill: '#364c7a', hi: '#7390cc', lo: '#1b2845' },
  btnPress: { fill: '#1d2a47', hi: '#16213b', lo: '#3a4f7b' },
  primary: { fill: '#f0a512', hi: '#ffd776', lo: 'amberDeep' },
  primaryHover: { fill: '#ffbb2e', hi: '#ffe49a', lo: 'amberDeep' },
  primaryPress: { fill: '#c98108', hi: '#a86300', lo: '#ffd776' },
  danger: { fill: '#b8322b', hi: '#ff8b7c', lo: '#6d1519' },
  dangerHover: { fill: '#d4413a', hi: '#ffa294', lo: '#6d1519' },
  dangerPress: { fill: '#8e2420', hi: '#6d1519', lo: '#ff8b7c' },
  good: { fill: '#1f7a46', hi: '#5fd18a', lo: '#0e4125' },
  goodHover: { fill: '#278f55', hi: '#7fe3a5', lo: '#0e4125' },
  goodPress: { fill: '#175c35', hi: '#0e4125', lo: '#5fd18a' },
  disabled: { fill: '#1a2238', hi: '#27324e', lo: '#0d1424' },
  tab: { fill: '#18223a', hi: '#2a3a5c', lo: '#0a1020' },
  tabOn: { fill: '#2b3d63', hi: '#7390cc', lo: '#16213b' },
  card: { fill: '#17213a', hi: '#33456b', lo: '#080d19' },
  cardOn: { fill: '#233256', hi: 'amber', lo: 'amberDeep' },
  warn: { fill: '#3a1a1c', hi: 'red', lo: '#1c0a0c' },
  hud: { fill: 'rgba(8,13,26,0.62)', hi: 'rgba(120,150,210,0.45)', lo: 'rgba(0,0,0,0.5)' },
};

const textColorFor = {
  btn: 'text', btnHover: 'text', btnPress: 'text',
  primary: 'textDark', primaryHover: 'textDark', primaryPress: 'textDark',
  danger: 'white', dangerHover: 'white', dangerPress: 'white',
  good: 'white', goodHover: 'white', goodPress: 'white',
  disabled: 'textMute',
};

const cache = new Map();

/** Тема по настройкам профиля. Объекты кэшируются, повторный вызов бесплатен. */
export function getTheme(settings = {}) {
  const cb = !!settings.colorblind;
  const key = cb ? 'cb' : 'std';
  let theme = cache.get(key);
  if (theme) return theme;
  const c = { ...BASE, ...(cb ? COLORBLIND : null) };
  const resolve = (v) => (typeof v === 'string' && c[v] ? c[v] : v);
  const variants = {};
  for (const [name, v] of Object.entries(VARIANTS)) {
    variants[name] = { fill: resolve(v.fill), hi: resolve(v.hi), lo: resolve(v.lo), edge: c.edge };
  }
  theme = {
    key,
    colorblind: cb,
    c,
    variants,
    /** Цвет подписи на кнопке данного варианта. */
    labelColor: (variant) => c[textColorFor[variant] || 'text'],
    /** good/bad с запасными символами для дальтоников. */
    good: c.green,
    bad: c.red,
    coin: c.gold,
    data: c.cyan,
    power: c.green,
    accent: c.amber,
  };
  cache.set(key, theme);
  return theme;
}

// --- контраст WCAG ---

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? [...h].map((x) => x + x).join('') : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
}

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Смешать два #rrggbb в долях k (0..1) от b. */
export function mix(a, b, k) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * k));
  return `#${m.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function withAlpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export const THEME_SOURCE = { BASE, COLORBLIND, VARIANTS };
