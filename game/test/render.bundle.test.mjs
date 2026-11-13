import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { runtimeSourcePlugin } from './runtime-source-plugin.mjs';
import { ASSET_FILES } from '../src/render/manifest.js';
import { repoRoot } from './render-helpers.mjs';

test('модуль render собирается esbuild в IIFE (без top-level await и отсутствующих файлов)', async () => {
  const result = await build({
    plugins: [runtimeSourcePlugin()],
    entryPoints: [path.join(repoRoot, 'game', 'src', 'render', 'index.js')],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: 'RenderModule',
    target: ['es2022'],
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text;
  assert.ok(code.length > 20000);
  const api = new Function(`${code}; return RenderModule;`)();
  for (const name of ['createRenderer', 'loadAssets', 'manifest', 'computeLayout']) assert.ok(api[name], name);
  assert.ok(api.manifest.ASSET_FILES.core_1978);
});

test('ассеты в сборку берутся только из каталога манифеста; суммарный вес в разумных пределах', () => {
  let bytes = 0;
  const files = new Set(Object.values(ASSET_FILES)
    .filter((spec) => !(spec.optional && !fs.existsSync(path.join(repoRoot, spec.file))))
    .map(spec => typeof spec === 'string' ? spec : spec.file));
  for (const file of files) {
    bytes += fs.statSync(path.join(repoRoot, file)).size;
  }
  // Предупреждение для сборки: base64 увеличивает вес на треть.
  // Срез E0 добавил Blender-рельеф базы (2,5 МБ), изометрические спрайты и 8 кадров подъёма камеры (2 МБ): порог 18 МБ.
  // 2026-11-13 спрайты базы запечены в 3 раза плотнее (решение владельца, +1,8 МБ): порог 20 МБ.
  assert.ok(bytes < 20 * 1024 * 1024, `ассеты весят ${(bytes / 1048576).toFixed(1)} МБ`);
});
