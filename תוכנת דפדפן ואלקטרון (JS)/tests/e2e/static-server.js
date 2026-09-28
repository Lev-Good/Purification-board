/**
 * Minimal static file server for the E2E suite - the app has no build step
 * (plain HTML/CSS/ES modules), so a real dev server is unnecessary; this
 * just serves the repo root over HTTP so the browser's module loader treats
 * everything as same-origin (unlike opening index.html directly via file://).
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT) || 4173;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const relPath = urlPath === '/' ? '/index.html' : urlPath;
    const filePath = path.join(ROOT, relPath);

    // Never serve anything outside the repo root.
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`E2E static server listening on http://localhost:${PORT}`);
});
