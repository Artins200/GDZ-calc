/* Минимальный статический сервер без зависимостей (для локального запуска / превью).
 * Границы: только файлы внутри каталога проекта (симлинки разрешаются и проверяются),
 * только GET/HEAD, без Range. Для прод-раздачи нужен нормальный веб-сервер. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.PORT || 4173);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
    return;
  }
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const rel = urlPath.replace(/^\/+/, '');
  const full = path.resolve(ROOT, rel);
  if (!full.startsWith(ROOT + path.sep) && full !== ROOT) { res.writeHead(403).end('Forbidden'); return; }
  // симлинки: разрешённый файл должен оставаться внутри ROOT
  fs.realpath(full, (rerr, real) => {
    if (rerr) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not found'); return; }
    if (real !== ROOT && !real.startsWith(ROOT + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('403 Forbidden');
      return;
    }
    fs.readFile(real, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not found'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(real).toLowerCase()] || 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      });
      if (req.method === 'HEAD') res.end(); else res.end(data);
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`GDZ-calc: http://0.0.0.0:${PORT}  (root: ${ROOT})`);
});
