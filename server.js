const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || '';

function saveToGoogleSheets(payload) {
  if (!GOOGLE_SCRIPT_URL) return Promise.resolve(false);

  return fetch(GOOGLE_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  })
    .then(response => response.ok)
    .catch(error => {
      console.error('Google Sheets save failed:', error.message);
      return false;
    });
}

function serveStaticFile(filePath, res) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server Error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg'
    };

    res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === '/api/rsvp' && req.method === 'OPTIONS') {
    applyCors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (requestUrl.pathname === '/api/rsvp' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', async () => {
      applyCors(res);
      let entry;
      const contentType = String(req.headers['content-type'] || '');

      try {
        entry = /application\/json/i.test(contentType)
          ? JSON.parse(body || '{}')
          : Object.fromEntries(new URLSearchParams(body || ''));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Invalid RSVP payload' }));
        return;
      }

      const payload = {
        fullName: String(entry.fullName || '').trim(),
        email: String(entry.email || '').trim(),
        attendance: String(entry.attendance || '').trim(),
        guests: String(entry.guests || '1'),
        guest2Name: String(entry.guest2Name || '').trim(),
        submittedAt: entry.submittedAt || new Date().toISOString()
      };

        if (!payload.fullName || !payload.email) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Full name and email are required.' }));
        return;
      }

      let sheets = 'skipped';
      if (GOOGLE_SCRIPT_URL) {
        sheets = (await saveToGoogleSheets(payload)) ? 'ok' : 'failed';
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, saved: payload, googleSheets: sheets }));
    });

    return;
  }

  if (requestUrl.pathname === '/api/rsvp' && req.method === 'GET') {
    applyCors(res);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ entries: [] }));
    return;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestUrl.pathname);
  } catch (error) {
    decodedPath = requestUrl.pathname;
  }

  let filePath = decodedPath === '/' ? path.join(ROOT, 'index.html') : path.join(ROOT, decodedPath.replace(/^\//, ''));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!error && stats && stats.isFile()) {
      serveStaticFile(filePath, res);
      return;
    }

    serveStaticFile(path.join(ROOT, 'index.html'), res);
  });
});

server.listen(PORT, () => {
  console.log(`Wedding RSVP server running at http://localhost:${PORT}`);
  console.log(`Google Sheets sync: ${GOOGLE_SCRIPT_URL ? 'enabled' : 'disabled'}`);
});
