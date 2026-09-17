#!/usr/bin/env node
/* Local preview server that behaves like GitHub Pages:
   files are served as-is; a missing path returns 404.html with status 404.
   Run:  node tools/dev-server.js                 → http://localhost:8080/
         PREFIX=/Website PORT=8081 node tools/dev-server.js → http://localhost:8081/Website/
   PREFIX mimics a GitHub Pages project site (username.github.io/Website/). */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;
const PREFIX = (process.env.PREFIX || '').replace(/\/+$/, '');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8'
};

function send404(res) {
  let html = fs.readFileSync(path.join(ROOT, '404.html'), 'utf8');
  // Locally there is no *.github.io host, so tell 404.html how many path parts to keep.
  if (PREFIX) {
    html = html.replace('var keep = ', 'var keep = 1 || ');
    // The edit changes the inline script, so its Content-Security-Policy hash no longer matches. Local only.
    html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n?/, '');
  }
  res.writeHead(404, { 'Content-Type': TYPES['.html'] });
  res.end(html);
}

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (PREFIX) {
    if (urlPath === PREFIX) { res.writeHead(301, { Location: PREFIX + '/' }); return res.end(); }
    if (!urlPath.startsWith(PREFIX + '/')) return send404(res);
    urlPath = urlPath.slice(PREFIX.length);
  }
  let file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html'; // GitHub Pages serves /x from x.html
  if (!fs.existsSync(file)) return send404(res);
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (PREFIX && file.endsWith(path.join('js', 'config.js'))) {
    // Same effect as the automatic *.github.io detection in router.js.
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    return res.end(fs.readFileSync(file, 'utf8') + "\nwindow.HW_CONFIG.basePath = '" + PREFIX + "/';\n");
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('Home Weavers preview: http://localhost:' + PORT + (PREFIX || '') + '/'));
