import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = resolve(root, 'game/tools/_out/TECH_DEBT.md');
const slash = (s) => s.replaceAll('\\', '/');
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(resolve(root, dir), { withFileTypes: true })) {
    if (entry.isDirectory() && !['node_modules', '.git', 'assets', 'dist'].includes(entry.name)) files.push(...await walk(`${dir}/${entry.name}`));
    else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(`${dir}/${entry.name}`);
  }
  return files;
}
const all = await walk('game');
const checked = all.filter((f) => f.startsWith('game/src/') && f.endsWith('.js') || /^game\/tools\/[^/]+\.mjs$/.test(f)).sort();
const syntaxErrors = [];
for (const file of checked) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) syntaxErrors.push([file, result.stderr || result.error?.message || `Код ${result.status}`]);
}
const diff = spawnSync('git', ['diff', '--check'], { cwd: root, encoding: 'utf8' });
const names = execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim().split(/\r?\n/).map(slash);
const changed = names.filter((f) => /\.(?:js|mjs)$/.test(f));
const contents = new Map(await Promise.all(all.map(async (f) => [f, await readFile(resolve(root, f), 'utf8')])));
const candidates = [], dead = [];
for (const file of changed) {
  const source = contents.get(file);
  if (!source) continue;
  const exports = [...source.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+(\w+)/g)];
  for (const match of exports) {
    const name = match[1];
    const occurrences = [];
    for (const [consumer, text] of contents) {
      if (consumer === file) continue;
      const pattern = new RegExp(`\\b${name}\\b`, 'g');
      for (const hit of text.matchAll(pattern)) occurrences.push(`${consumer}:${text.slice(0, hit.index).split('\n').length}`);
    }
    if (!occurrences.length) candidates.push([file, source.slice(0, match.index).split('\n').length, name]);
  }
  // Консервативная проверка простых объявлений верхнего уровня. Деструктуризация не анализируется.
  for (const match of source.matchAll(/^(?:export\s+)?const\s+(\w+)\s*=/gm)) {
    const name = match[1];
    const hits = [...source.matchAll(new RegExp(`\\b${name}\\b`, 'g'))];
    if (hits.length === 1 && !exports.some((e) => e[1] === name)) dead.push([file, source.slice(0, match.index).split('\n').length, name]);
  }
}
const rows = (list) => list.length ? ['| Файл | Строка | Имя |', '|---|---|---|', ...list.map((r) => `| ${r.join(' | ')} |`)].join('\n') : 'Не обнаружены этим консервативным поиском.';
const report = [
  '# Технический долг без изменения изображения',
  'Команда: `node game/tools/check-tech-debt.mjs`. Проверяет все game/src/**/*.js и только верхний уровень game/tools/*.mjs. Для поиска потребителей дополнительно читает JS/MJS/CJS в game/tools/_out. Отчёт не удаляет и не правит исходники.',
  `## Синтаксис\n\nПроверено файлов: ${checked.length}. Ошибок: ${syntaxErrors.length}.\n\n${syntaxErrors.length ? syntaxErrors.map(([f,e])=>`### ${f}\n\n\`\`\`text\n${e}\n\`\`\``).join('\n\n') : 'Все node --check завершились успешно.'}`,
  `## Пробелы и git diff\n\ngit diff --check: код ${diff.status}.\n\n\`\`\`text\n${(diff.stdout + diff.stderr).trim() || 'Ошибок нет.'}\n\`\`\``,
  `## Область поиска\n\nФайлы из git diff --name-only (${changed.length} файлов JS/MJS):\n\n${changed.map((f)=>`- ${f}`).join('\n')}`,
  'Незакоммиченные исходники уже были изменены до начала этой задачи. Их наличие в этом списке не означает, что они правились здесь. Новые неотслеживаемые файлы не входят в git diff --name-only, но потребителями считаются. Отчёты _out могут игнорироваться git; синтаксические проверки новых tools запускаются независимо от статуса git.',
  '## Экспорты без упоминаний за пределами своего модуля',
  rows(candidates),
  'Кандидаты получены поиском идентификаторов в исходниках и скриптах. Отсутствие упоминаний не доказывает, что экспорт мёртвый: есть namespace-импорты, доступ через globalThis, отладочная консоль и внешний потребитель API. Совпадающие имена, строки и комментарии, наоборот, могут скрывать лишний экспорт. Списки export { ... }, export * и деструктуризация не разбираются. Ничего не удалено; перед удалением нужен анализ API и вызовов.',
  '## Константы верхнего уровня с единственным упоминанием',
  rows(dead),
  'Проверяются простые const name = только в изменённых файлах; экспортированные имена исключены. Подсчёт по исходному тексту намеренно консервативный. Это список кандидатов для ручного чтения, а не полноценный анализ потока исполнения.',
  '## Наблюдения по текущим задачам',
  '- Исправлен порядок инициализации в ui/app.js: toastAnchor теперь вызывается после kit.begin. Прежний вызов мог падать ещё до try/catch отрисовки. Само наличие уведомления не является необходимым условием ошибки.',
  '- В render/manifest.js найдено 3 расхождения размеров; подробности в MANIFEST_CHECK.md. Для pad_moon/pad_mars годовая E0-версия исключена, early-PNG сравниваются с первой записью таблицы, поэтому это также долг согласования разных таблиц, а не автоматически сломанная отрисовка.',
  '- У shop канистры текст обещает 50 единиц, а sim использует CANISTER_SHARE=0.285 активного бака. Это расхождение описания и поведения; интерфейс и данные не изменены.',
  '- Комментарий main.js ссылается на game/test/browser.cjs, но каталога game/test в этой рабочей копии нет. Действующие проверки добавлены в game/tools.',
  '- Сборка в рамках этих задач не запускалась: предыдущий отчёт уже фиксирует отказ esbuild в доступе к родительским каталогам. Обходов и плагинов сборщика не добавлено. Браузерная проверка не выполнялась.',
];
await mkdir(resolve(root, 'game/tools/_out'), { recursive: true });
await writeFile(output, report.join('\n\n')+'\n', 'utf8');
console.log(`Синтаксис: ${checked.length}, ошибок: ${syntaxErrors.length}; diff: ${diff.status}; кандидатов экспортов: ${candidates.length}, констант: ${dead.length}. Отчёт: ${slash(relative(root, output))}`);
if (syntaxErrors.length || diff.status !== 0) process.exitCode = 1;
