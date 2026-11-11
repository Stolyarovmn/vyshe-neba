// Загружает локальные модули игры без поиска package.json и node_modules в родительских каталогах.
// Это позволяет собирать изолированное runtime-дерево в среде с ограниченным доступом к файловой системе.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));

export function runtimeSourcePlugin() {
  return {
    name: 'runtime-source',
    setup(build) {
      build.onResolve({ filter: /.*/ }, ({ path: specifier, importer }) => {
        if (importer && !specifier.startsWith('.')) {
          throw new Error(`Ожидался относительный импорт игры: ${specifier}`);
        }
        const file = path.resolve(importer ? path.dirname(importer) : build.initialOptions.absWorkingDir || process.cwd(), specifier);
        const relative = path.relative(sourceRoot, file);
        if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
          throw new Error(`Модуль находится вне game/src: ${specifier}`);
        }
        return { path: file, namespace: 'runtime-source' };
      });
      build.onLoad({ filter: /.*/, namespace: 'runtime-source' }, async ({ path: file }) => ({
        contents: await readFile(file, 'utf8'),
        loader: 'js',
        watchFiles: [file],
      }));
    },
  };
}
