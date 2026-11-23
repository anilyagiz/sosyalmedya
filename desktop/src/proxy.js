'use strict';
// Does what nginx does in the Postiz Docker image:
//   /api/*      -> backend (prefix stripped)
//   /uploads/*  -> files from the uploads folder
//   everything  -> Next.js frontend
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { PORTS } = require('./config');

const UPLOAD_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

function target(url) {
  if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) {
    const rest = url.slice(4) || '/';
    return { port: PORTS.backend, path: rest.startsWith('/') ? rest : '/' + rest };
  }
  return { port: PORTS.frontend, path: url };
}

function forwardHeaders(req) {
  const headers = { ...req.headers };
  headers['x-real-ip'] = req.socket.remoteAddress || '127.0.0.1';
  headers['x-forwarded-for'] = headers['x-real-ip'];
  headers['x-forwarded-proto'] = 'http';
  return headers;
}

function serveUpload(uploadsDir, req, res) {
  let rel;
  try {
    rel = decodeURIComponent(req.url.split('?')[0].slice('/uploads/'.length));
  } catch {
    res.writeHead(400).end();
    return;
  }
  const base = path.resolve(uploadsDir);
  const file = path.resolve(base, rel);
  if (!file.startsWith(base + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404).end();
      return;
    }
    const type =
      UPLOAD_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const common = {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'none'; script-src 'none'; frame-ancestors 'none'; sandbox",
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=86400',
    };
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      let start = range[1] === '' ? stat.size - Number(range[2]) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : stat.size - 1;
      if (start < 0) start = 0;
      if (end >= stat.size) end = stat.size - 1;
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        ...common,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...common, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

function createProxy(uploadsDir) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/uploads/') && (req.method === 'GET' || req.method === 'HEAD')) {
      serveUpload(uploadsDir, req, res);
      return;
    }
    const t = target(req.url);
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: t.port,
        method: req.method,
        path: t.path,
        headers: forwardHeaders(req),
      },
      (up) => {
        res.writeHead(up.statusCode || 502, up.rawHeaders);
        up.pipe(res);
      }
    );
    upstream.setTimeout(15 * 60 * 1000);
    upstream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(
          '<meta http-equiv="refresh" content="3"><body style="font-family:sans-serif;padding:40px">sosyalmedya hâlâ açılıyor, birkaç saniye içinde sayfa yenilenecek…</body>'
        );
      } else {
        res.destroy();
      }
    });
    req.pipe(upstream);
  });

  // WebSocket / upgrade passthrough.
  server.on('upgrade', (req, socket, head) => {
    const t = target(req.url);
    const up = net.connect(t.port, '127.0.0.1', () => {
      const lines = [`${req.method} ${t.path} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      up.write(lines.join('\r\n') + '\r\n\r\n');
      if (head && head.length) up.write(head);
      up.pipe(socket);
      socket.pipe(up);
    });
    up.on('error', () => socket.destroy());
    socket.on('error', () => up.destroy());
  });

  server.requestTimeout = 0;
  server.headersTimeout = 120000;
  return server;
}

// Listens on IPv4 and IPv6 loopback so "localhost" works whichever the
// browser picks. Fails only if IPv4 cannot be bound.
function listen(uploadsDir) {
  return new Promise((resolve, reject) => {
    const v4 = createProxy(uploadsDir);
    v4.once('error', (err) => {
      reject(
        err.code === 'EADDRINUSE'
          ? new Error(
              `${PORTS.public} numaralı port başka bir program tarafından kullanılıyor. sosyalmedya zaten açık olabilir.`
            )
          : err
      );
    });
    v4.listen(PORTS.public, '127.0.0.1', () => {
      const v6 = createProxy(uploadsDir);
      v6.once('error', () => resolve([v4]));
      v6.listen(PORTS.public, '::1', () => resolve([v4, v6]));
    });
  });
}

module.exports = { listen };
