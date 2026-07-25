const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function getContentType(filePath) {
  return MIME_TYPES[path.extname(filePath)] || 'application/octet-stream';
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    sendJson(res, 200, { ok: true, message: 'Backend is running.' });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/gemini') {
    let body = '';

    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');

        if (!GEMINI_API_KEY) {
          sendJson(res, 500, {
            error: {
              code: 500,
              message: 'GEMINI_API_KEY is not set on the server. Configure it before making requests.'
            }
          });
          return;
        }

        const upstreamBody = payload.mode === 'chat'
          ? {
              systemInstruction: {
                parts: [{ text: payload.systemInstruction || '' }]
              },
              contents: payload.contents || []
            }
          : {
              contents: [{ role: 'user', parts: [{ text: payload.promptText || '' }] }]
            };

        const upstreamResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(upstreamBody)
          }
        );

        const data = await upstreamResponse.json();
        sendJson(res, upstreamResponse.status, data);
      } catch (error) {
        sendJson(res, 500, {
          error: {
            code: 500,
            message: error.message || 'Unable to process request.'
          }
        });
      }
    });

    return;
  }

  const filePath = pathname === '/' ? '/index.html' : pathname;
  const absolutePath = path.join(ROOT_DIR, filePath);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    sendJson(res, 403, { error: { message: 'Forbidden' } });
    return;
  }

  fs.readFile(absolutePath, (error, data) => {
    if (error) {
      sendJson(res, 404, { error: { message: 'Not found' } });
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(absolutePath) });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
  console.log('Set GEMINI_API_KEY in your shell before starting the app.');
});
