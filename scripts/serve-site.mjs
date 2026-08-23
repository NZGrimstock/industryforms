// Minimal static file server for previewing the marketing site locally.
//
// The repo root is a static site with no build step (see CLAUDE.md), so there
// is nothing to `npm run dev`. This exists so the site can be opened through
// the normal preview flow rather than file://, which breaks root-relative
// asset paths like /Logo/favicon.png.
//
//   node scripts/serve-site.mjs [port]
//
// Referenced by .claude/launch.json as the "marketing-site" configuration.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8088;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // normalize() collapses any ../ before we join, so a crafted path cannot
    // escape ROOT. Local dev tool, but there is no reason to leave it open.
    let rel = normalize(url).replace(/^([/\\])+/, '');
    if (rel === '' || rel.endsWith('/')) rel = join(rel, 'index.html');

    let target = join(ROOT, rel);
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    // Allow extension-less URLs to resolve to their .html file.
    try {
      const s = await stat(target);
      if (s.isDirectory()) target = join(target, 'index.html');
    } catch {
      if (!extname(target)) target += '.html';
    }

    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1>');
  }
}).listen(PORT, () => {
  console.log(`Marketing site on http://localhost:${PORT}`);
});
