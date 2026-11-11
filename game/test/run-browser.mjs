// Явно запускает браузерные проверки отдельно от юнит-тестов; новые *.browser.cjs подхватываются автоматически.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = new URL('./', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.browser.cjs') || name === 'browser.cjs').sort();
if (!files.length) throw new Error('Не найдены браузерные проверки');

let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(file, directory))], { stdio: 'inherit' });
  if (result.error) console.error(`${file}: ${result.error.message}`);
  if (result.error || result.status !== 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
