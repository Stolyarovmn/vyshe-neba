// Интерфейс по эпохам (game/docs/UI_LANGUAGE.md, «Интерфейс по эпохам»). Пиксельный шрифт, пиксельные рамки и тяжёлые выпуклые кнопки
// остаются во всех эпохах; меняется «железо» вокруг игрока: материал панелей, цвет и форма подсветки, экраны и приборы.
// Этот модуль — только таблицы токенов; рисуют их theme.js, kit.js, crt.js и instruments.js.
//
// palette  — замены цветов палитры (ключи PALETTE; mat0..mat2 — три тона материала корпуса);
// frames   — замены рамок: hi/mid/lo/edge — ключи палитры, rivets — вид заклёпок (brass | screw | none),
//            tex — текстура тела (wear | brushed | carbon | glass), dither — «стекло» шашечным узором;
// labels   — цвет подписи на кнопке по её варианту (если материал светлый — тёмная подпись);
// crt      — экран: цвет люминофора, кривизна стекла, строки, виньетка, свечение, мерцание, послесвечение;
// lamp     — форма подсветки кнопок и ламп: bulb | led | bar | line | dot;
// hud      — цвет цифр приборов (digit), фон под ними (bg) и его непрозрачность (bgAlpha): тест проверяет контраст ≥ 4,5;
// instr    — вид приборов HUD: analog | led | digital | flat | projection | holo;
// report   — носитель отчёта о полёте (экран итогов): kind — perf | thermal | plastic | flat | projection | holo;
//            bg/bg2 — тон подложки (у перфобумаги — две полосы), alpha — её непрозрачность, ink/dim/good/bad/amber/cyan —
//            цвета текста и значков на этой подложке (тест проверяет контраст >= 4,5 по худшему случаю).

export const ERA_SKINS = [
  {
    id: 'e0',
    hud: { digit: 'white', bg: 'ink', bgAlpha: 1 },
    year: 1978,
    title: 'Крашеная сталь и лампы',
    // Материал по референсам E0 (materials-construction, controls-displays): сине-серая крашеная сталь, оливковая краска,
    // ржавчина по кромкам (rust: три тона вне палитры, чтобы не трогать пробку и бумагу), чёрный ЭЛТ-экран с зелёным люминофором.
    rust: ['#6b3a17', '#b4652a', '#d68c3e'],
    palette: {
      white: '#d8ffdf', steel0: '#2f3a40', steel1: '#56646c', steel2: '#8796a0', steel3: '#bac7cc',
      navy0: '#050b07', navy1: '#0e1810', navy2: '#16231a', ink: '#040704',
      mat0: '#454a24', mat1: '#80854a', mat2: '#aeb262',
      amber0: '#7a4306', amber1: '#ffb02e', amber2: '#ffe08a',
      green1: '#5dff7a', green2: '#b6ffc6', green0: '#1c6a32',
    },
    frames: {
      // щиток под экран: тёмное стекло в крашеной стальной рамке
      panel: { hi: 'steel2', mid: 'navy2', lo: 'steel0', rivets: 'screw', tex: 'rust' },
      // большие панели и рамки приборов: крашеная сталь потемнее; таблички (эпоха, счётчики) — оливковая краска (plateTag)
      raised: { hi: 'steel2', mid: 'steel1', lo: 'steel0', rivets: 'screw', tex: 'rust' },
      plateTag: { hi: 'mat2', mid: 'mat1', lo: 'mat0', rivets: 'screw', tex: 'rust' },
      // кнопки: крашеная сталь с гравировкой тёмной краской
      btn: { hi: 'steel3', mid: 'steel2', lo: 'steel1', rivets: 'none', tex: 'rust' },
      btnHover: { hi: 'white', mid: 'steel3', lo: 'steel1', rivets: 'none', tex: 'rust' },
      btnPress: { hi: 'steel1', mid: 'steel2', lo: 'steel3' },
      card: { hi: 'steel1', mid: 'steel0', lo: 'navy1' },
      cardOn: { hi: 'amber2', mid: 'steel0', lo: 'amber0' },
      // «ПУСК»: тёмная эмалевая табличка, красный грибок-кнопка слева
      launch: { hi: 'steel1', mid: 'steel0', lo: 'ink', rivets: 'screw', tex: 'rust' },
      launchHover: { hi: 'steel2', mid: 'steel1', lo: 'ink', rivets: 'screw', tex: 'rust' },
      launchPress: { hi: 'ink', mid: 'steel0', lo: 'steel1' },
      primary: { hi: 'steel1', mid: 'steel0', lo: 'ink', rivets: 'screw', tex: 'rust' },
      primaryHover: { hi: 'steel2', mid: 'steel1', lo: 'ink', rivets: 'screw', tex: 'rust' },
      primaryPress: { hi: 'ink', mid: 'steel0', lo: 'steel1' },
    },
    labels: { btn: 'ink', btnHover: 'ink', btnPress: 'ink', plateTag: 'ink', launch: 'white', launchHover: 'white', launchPress: 'white', primary: 'white', primaryHover: 'white', primaryPress: 'white' },
    // гравировка: светлая тень на 1 пиксель под тёмной подписью (ключ палитры по варианту)
    engrave: { btn: 'steel3', btnHover: 'white', btnPress: 'steel3', plateTag: 'mat2', launch: 'ink', launchHover: 'ink', launchPress: 'ink', primary: 'ink', primaryHover: 'ink', primaryPress: 'ink' },
    crt: { kind: 'green', tint: '#6dff8a', curve: 0.45, scan: 0.5, vignette: 0.72, glow: 0.66, flicker: 0.08, persist: 0.5, grain: 0.07 },
    lamp: 'bulb',
    instr: 'analog',
    report: { kind: 'perf', bg: '#dcf0d2', bg2: '#c2e3b9', alpha: 1, ink: '#10241a', dim: '#365a3c', good: '#0e5a26', bad: '#8c1a1a', amber: '#6a4604', cyan: '#0a4a60' },
  },
  {
    id: 'e1',
    hud: { digit: 'amber', bg: 'ink', bgAlpha: 1 },
    year: 1986,
    title: 'Слоновая кость и янтарь',
    palette: {
      white: '#fff1d0', steel0: '#5f5849', steel1: '#9d957e', steel2: '#cbc3a8', steel3: '#ece5cc',
      navy0: '#0c0803', navy1: '#181006', navy2: '#241a0a', ink: '#0a0703',
      mat0: '#8d846e', mat1: '#d2c9ac', mat2: '#f0e9d2',
      amber0: '#7a4306', amber1: '#ffb62e', amber2: '#ffe29a',
      green1: '#7aff7a', green2: '#c6ffc6',
    },
    frames: {
      panel: { hi: 'mat1', mid: 'navy2', lo: 'mat0', rivets: 'screw' },
      raised: { hi: 'mat2', mid: 'mat1', lo: 'mat0', rivets: 'screw' },
      btn: { hi: 'mat2', mid: 'mat1', lo: 'mat0', rivets: 'screw' },
      btnHover: { hi: 'white', mid: 'mat2', lo: 'mat0', rivets: 'screw' },
      btnPress: { hi: 'mat0', mid: 'steel2', lo: 'mat2' },
      card: { hi: 'mat1', mid: 'steel1', lo: 'steel0' },
      cardOn: { hi: 'amber2', mid: 'steel1', lo: 'amber0' },
    },
    labels: { btn: 'ink', btnHover: 'ink', btnPress: 'ink', raised: 'ink', cardOn: 'ink' },
    crt: { kind: 'amber', tint: '#ffbf3a', curve: 0.85, scan: 0.36, vignette: 0.5, glow: 0.5, flicker: 0.03, persist: 0.35 },
    lamp: 'led',
    instr: 'led',
    report: { kind: 'thermal', bg: '#f0ead7', bg2: '#f0ead7', alpha: 1, ink: '#2a2823', dim: '#575142', good: '#1e5a2a', bad: '#8a2814', amber: '#6a4608', cyan: '#14505e' },
  },
  {
    id: 'e2',
    hud: { digit: 'greenLight', bg: 'navy1', bgAlpha: 1 },
    year: 1998,
    title: 'Серый пластик',
    palette: {
      white: '#eef3ff', steel0: '#454b57', steel1: '#626a7b', steel2: '#a6aebd', steel3: '#d7dce6',
      navy0: '#070a13', navy1: '#0f1525', navy2: '#192137', ink: '#04060c',
      mat0: '#575c68', mat1: '#8c929e', mat2: '#bcc1cc',
    },
    frames: {
      panel: { hi: 'mat2', mid: 'navy2', lo: 'mat0', rivets: 'screw' },
      raised: { hi: 'mat2', mid: 'mat1', lo: 'mat0', rivets: 'screw' },
      btn: { hi: 'mat2', mid: 'steel1', lo: 'steel0', rivets: 'screw' },
    },
    labels: { btn: 'white', raised: 'ink' },
    crt: { kind: 'color', tint: '#ffffff', curve: 0.45, scan: 0.22, vignette: 0.3, glow: 0.25, flicker: 0, persist: 0.15 },
    lamp: 'led',
    instr: 'digital',
    report: { kind: 'plastic', bg: '#050912', bg2: '#050912', alpha: 1, ink: '#eef3ff', dim: '#a6b4d2', good: '#7dff9a', bad: '#ff8070', amber: '#ffc94a', cyan: '#6ad8ff' },
  },
  {
    id: 'e3',
    hud: { digit: 'white', bg: 'navy0', bgAlpha: 1 },
    year: 2015,
    title: 'Анодированный алюминий',
    palette: {
      white: '#f4f8fc', steel0: '#4a5560', steel1: '#7f8c99', steel2: '#b4bec8', steel3: '#e2e8ee',
      navy0: '#090e15', navy1: '#121a26', navy2: '#1b2536', ink: '#04070c',
      mat0: '#6d7884', mat1: '#a3adb8', mat2: '#d0d7de',
    },
    frames: {
      panel: { hi: 'mat2', mid: 'navy2', lo: 'mat0', rivets: 'none', tex: 'brushed' },
      raised: { hi: 'mat2', mid: 'mat1', lo: 'mat0', rivets: 'none', tex: 'brushed' },
      btn: { hi: 'mat2', mid: 'steel1', lo: 'steel0', rivets: 'none', tex: 'brushed' },
    },
    labels: { btn: 'ink', btnHover: 'ink', raised: 'ink' },
    crt: { kind: 'flat', tint: '#ffffff', curve: 0, scan: 0, vignette: 0.12, glow: 0, flicker: 0, persist: 0 },
    lamp: 'line',
    instr: 'flat',
    report: { kind: 'flat', bg: '#0b1119', bg2: '#0b1119', alpha: 1, ink: '#f4f8fc', dim: '#b4bec8', good: '#7dffa8', bad: '#ff8a7a', amber: '#ffd060', cyan: '#7ad8ff' },
  },
  {
    id: 'e4',
    hud: { digit: 'cyan', bg: 'ink', bgAlpha: 0.92 },
    year: 2035,
    title: 'Тёмный карбон',
    palette: {
      white: '#e4f7ff', steel0: '#262b34', steel1: '#3e4553', steel2: '#7f899b', steel3: '#c3ccda',
      navy0: '#03050a', navy1: '#090d17', navy2: '#101624', ink: '#020308',
      mat0: '#13161c', mat1: '#232832', mat2: '#3a4150',
      cyan1: '#4ae6ff',
    },
    frames: {
      panel: { hi: 'mat2', mid: 'navy2', lo: 'ink', rivets: 'none', tex: 'carbon' },
      raised: { hi: 'mat2', mid: 'mat1', lo: 'mat0', rivets: 'none', tex: 'carbon' },
      btn: { hi: 'steel2', mid: 'mat1', lo: 'mat0', rivets: 'none', tex: 'carbon' },
      btnHover: { hi: 'cyan1', mid: 'mat1', lo: 'mat0', rivets: 'none', tex: 'carbon' },
      btnPress: { hi: 'ink', mid: 'mat0', lo: 'mat2' },
      card: { hi: 'steel1', mid: 'mat1', lo: 'navy1' },
      cardOn: { hi: 'cyan1', mid: 'mat1', lo: 'cyan0' },
    },
    labels: { btn: 'white' },
    crt: { kind: 'projection', tint: '#4ae6ff', curve: 0, scan: 0, vignette: 0, glow: 0.7, flicker: 0, persist: 0 },
    lamp: 'bar',
    instr: 'projection',
    report: { kind: 'projection', bg: '#020308', bg2: '#020308', alpha: 0.92, ink: '#e4f7ff', dim: '#9fb4c8', good: '#7dffb8', bad: '#ff8a80', amber: '#ffd36a', cyan: '#4ae6ff' },
  },
  {
    id: 'e5',
    hud: { digit: 'cyan', bg: 'navy0', bgAlpha: 0.86 },
    year: 2060,
    title: 'Умные материалы',
    palette: {
      white: '#f6fbff', steel0: '#2f3b4f', steel1: '#51668a', steel2: '#9bb4d8', steel3: '#d8e6fb',
      navy0: '#050913', navy1: '#0a1323', navy2: '#12203a', ink: '#03050c',
      mat0: '#3a5070', mat1: '#6a8cb8', mat2: '#aac8ee',
      cyan1: '#7af0ff',
    },
    frames: {
      panel: { hi: 'mat2', mid: 'navy2', lo: 'mat0', rivets: 'none', tex: 'glass' },
      raised: { hi: 'mat2', mid: 'mat0', lo: 'navy1', rivets: 'none', tex: 'glass' },
      btn: { hi: 'mat2', mid: 'mat0', lo: 'navy1', rivets: 'none', tex: 'glass' },
      btnHover: { hi: 'white', mid: 'mat1', lo: 'navy1', rivets: 'none', tex: 'glass' },
      card: { hi: 'mat1', mid: 'steel0', lo: 'navy1' },
    },
    labels: { btn: 'white', btnHover: 'ink' },
    crt: { kind: 'holo', tint: '#7af0ff', curve: 0, scan: 0.12, vignette: 0, glow: 0.8, flicker: 0.02, persist: 0.2 },
    lamp: 'dot',
    instr: 'holo',
    report: { kind: 'holo', bg: '#050913', bg2: '#050913', alpha: 0.86, ink: '#f6fbff', dim: '#a8c0e0', good: '#8affc0', bad: '#ff9a90', amber: '#ffd88a', cyan: '#7af0ff' },
  },
];

export const ERA_COUNT = ERA_SKINS.length;

/** Скин для эпохи профиля 0–5 (за пределами — ближайший). */
export function skinFor(era) {
  const i = Math.max(0, Math.min(ERA_COUNT - 1, Math.round(Number(era) || 0)));
  return ERA_SKINS[i];
}
