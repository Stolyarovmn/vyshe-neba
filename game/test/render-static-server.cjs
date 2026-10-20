// Мини-сервер статики для браузерных проверок рендера: раздаёт корень репозитория.
// Нужен, потому что превью использует ES-модули и ассеты по абсолютным адресам (/outputs/..., /art/...).
// Запуск вручную: node game/test/render-static-server.cjs [порт]  (по умолчанию 8803).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.css': 'text/css',
};

function createStaticServer(root) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(data);
    });
  });
}

/** Запускает сервер на свободном порту (port = 0) и возвращает { server, url }. */
function startStaticServer(root, port = 0) {
  const server = createStaticServer(root);
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

module.exports = { createStaticServer, startStaticServer };

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..');
  startStaticServer(root, Number(process.argv[2]) || 8803).then(({ url }) => console.log(`serving ${root} at ${url}`));
}
