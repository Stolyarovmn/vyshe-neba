import { open, stat, mkdir, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { ASSET_FILES, E0_BUILDING_SIZES, BUILDING_ANCHORS, ERA_SPRITE_SIZES, E0_BUILDING_CLIPS, worldSpriteFile, eraFolder } from '../src/render/manifest.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const out = resolve(root, 'game/tools/_out/MANIFEST_CHECK.md');
const rows = [];
const counts = { paths: 0, optional: 0, dimensions: 0, clips: 0 };
const memo = new Map();
// Читаем только сигнатуру и первый IHDR, без декодирования пикселей и сторонних пакетов.
async function pngSize(file) {
  if (memo.has(file)) return memo.get(file);
  const task = (async () => {
    const handle = await open(resolve(root, file), 'r');
    try {
      const header = Buffer.alloc(33);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (bytesRead !== 33 || !header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || header.readUInt32BE(8) !== 13 || header.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Некорректный заголовок PNG/IHDR');
      const size = [header.readUInt32BE(16), header.readUInt32BE(20)];
      if (!size.every((n) => n > 0)) throw new Error('Нулевой размер PNG');
      return size;
    } finally { await handle.close(); }
  })();
  memo.set(file, task);
  return task;
}
const fmt = (size) => size?.join('×') ?? 'нет значения';
async function compare(group, name, file, expected) {
  counts.dimensions++;
  try {
    const actual = await pngSize(file);
    if (!expected || actual.some((n, i) => n !== expected[i])) rows.push([group, name, file, fmt(expected), fmt(actual)]);
  } catch (error) { rows.push([group, name, file, fmt(expected), error.code || error.message]); }
}
for (const [name, spec] of Object.entries(ASSET_FILES)) {
  counts.paths++;
  const file = typeof spec === 'string' ? spec : spec.file;
  try {
    if (!(await stat(resolve(root, file))).isFile()) throw new Error('Путь не является файлом');
  } catch (error) {
    if (spec.optional && error.code === 'ENOENT') counts.optional++;
    else rows.push(['Путь', name, file, 'существующий файл', error.code || error.message]);
  }
}
for (const [key, anchor] of Object.entries(BUILDING_ANCHORS)) {
  const file = `${eraFolder(0)}base/${key === 'weather' ? 'weather-complex' : key}.png`;
  if (key in E0_BUILDING_SIZES) await compare('E0_BUILDING_SIZES', key, file, E0_BUILDING_SIZES[key]);
  await compare('e0.size', key, file, anchor.e0?.size);
}
for (const [key, sizes] of Object.entries(ERA_SPRITE_SIZES)) {
  const name = `${key}_1978`;
  // В E0 площадки используют отдельные early-файлы; годовых версий нет по ERA_RANGE.
  const file = worldSpriteFile(key === 'pad_moon' || key === 'pad_mars' ? `${key}_early` : name);
  await compare('ERA_SPRITE_SIZES[0]', name, file, sizes[0]);
}
// ON-кадры есть только у изометрии (iso/anim/, необязательные); кадры вида сверху сняты 2026-11-11.
// Сверяются только существующие кадры: каждый обязан совпадать по размеру с iso/<ключ>.png.
const animDir = `${eraFolder(0)}iso/anim/`;
let frameFiles = [];
try {
  frameFiles = (await readdir(resolve(root, animDir))).filter((name) => /^[a-z]+_on\d+\.png$/.test(name));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const name of frameFiles.sort()) {
  const key = name.split('_on')[0];
  if (!E0_BUILDING_CLIPS[key]) { rows.push(['ON-кадр', name, animDir + name, 'клип в E0_BUILDING_CLIPS', 'нет клипа']); continue; }
  counts.clips++;
  let base;
  try { base = await pngSize(`${eraFolder(0)}iso/${key}.png`); } catch { /* ошибка будет в таблице */ }
  await compare('ON-кадр', name, animDir + name, base);
}
const stacks = [];
for (const key of ['stack_booster', 'stack_core', 'stack_capsule']) {
  const file = worldSpriteFile(`${key}_1978`);
  try { stacks.push([key, file, await pngSize(file)]); }
  catch (error) { rows.push(['Стек', key, file, 'PNG для сравнения ширин', error.code || error.message]); }
}
for (const [key, file, size] of stacks) if (size[0] !== stacks[0][2][0]) rows.push(['Стек', key, file, `ширина ${stacks[0][2][0]}`, `ширина ${size[0]}`]);
const table = rows.length ? ['| Проверка | Имя | Путь | Ожидается | Фактически |', '|---|---|---|---|---|', ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n') : 'Расхождений нет.';
const report = `# Проверка манифеста\n\nКоманда: \`node game/tools/check-manifest.mjs\`. Только чтение манифеста и файлов assets; исходники и PNG не изменяются.\n\nПроверено путей: ${counts.paths}; отсутствующих необязательных: ${counts.optional} (допустимы); сравнений размеров: ${counts.dimensions}, из них ON-кадров: ${counts.clips}. Расхождений: ${rows.length}.\n\nПлощадки pad_moon/pad_mars в E0 сопоставлены с фактически используемыми early-PNG, поскольку годовые файлы 1978 исключены манифестом. Отсутствие E0_BUILDING_SIZES для placeable-построек допустимо, их e0.size проверяется отдельно. Несовпадение полного холста beacons и его e0.size может быть намеренным масштабированием; это наблюдение, а не разрешение исправлять картинку.\n\n${table}\n\nШирины стека: ${stacks.map(([key, , size]) => `${key}: ${fmt(size)}`).join('; ')}.\n`;
await mkdir(dirname(out), { recursive: true });
await writeFile(out, report, 'utf8');
console.log(table);
console.log(`Отчёт: ${out}; расхождений: ${rows.length}; допустимых отсутствующих optional: ${counts.optional}.`);
// Расхождения отражены в отчёте; ненулевой код удобен для автоматической проверки.
if (rows.length) process.exitCode = 1;
