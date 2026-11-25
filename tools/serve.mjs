// Static file server with no dependencies, for local play and for trying a sub-path deployment.
//   node tools/serve.mjs                      http://localhost:8000/
//   node tools/serve.mjs --base /moran/      http://localhost:8000/moran/   (like a GitHub Pages project site)
//   node tools/serve.mjs --dir dist/moran-demo --port 9000
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i < 0 ? def : args[i + 1]; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(root, opt('dir', 'src'));
const port = Number(opt('port', 8000));
let base = opt('base', '/');
if (!base.startsWith('/')) base = '/' + base;
if (!base.endsWith('/')) base += '/';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url + '/' === base) { res.writeHead(301, { Location: base }); res.end(); return; }
  if (!url.startsWith(base)) { res.writeHead(404); res.end('404: the game is served under ' + base); return; }
  let file = path.join(dir, url.slice(base.length));
  if (!file.startsWith(dir)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(port, () => console.log('serving ' + path.relative(root, dir) + '/ at http://localhost:' + port + base));
