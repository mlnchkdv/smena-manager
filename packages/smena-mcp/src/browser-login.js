import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

// Local-only, short-lived credential entry. The token is never included in a URL,
// response, log or plaintext file. Host + Origin checks prevent DNS rebinding/CSRF.
export async function startBrowserLogin({ save, timeoutMs = 300000 }) {
  const nonce = randomBytes(32).toString('hex');
  let origin,
    busy = false,
    finished = false,
    timer;
  let resolveDone, rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const finish = error => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    server.close();
    if (error) rejectDone(error);
    else resolveDone();
  };
  const server = http.createServer(async (req, res) => {
    const send = (status, text, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'same-origin',
      });
      res.end(text);
    };
    if (req.headers.host !== new URL(origin).host || req.url !== '/' + nonce || finished) return send(404, 'Not found');
    if (req.method === 'GET')
      return send(
        200,
        '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Smena MCP setup</title><main><h1>Connect Smena / Подключить Смену</h1><p>Paste your integration token. It will be verified and stored in the system credential store.</p><p>Вставьте токен интеграции: он будет проверен и сохранён в системном хранилище.</p><form method="post"><input type="hidden" name="nonce" value="' +
          nonce +
          '"><label for="token">Integration token / Токен интеграции</label><p><input id="token" name="token" type="password" required autocomplete="off" size="30" maxlength="160"></p><button type="submit">Connect / Подключить</button></form></main></html>',
        'text/html; charset=utf-8',
      );
    if (req.method !== 'POST' || req.headers.origin !== origin) return send(403, 'Request origin refused');
    if (
      String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim() !== 'application/x-www-form-urlencoded'
    )
      return send(403, 'Request content type refused');
    if (busy) return send(409, 'Setup is in progress');
    busy = true;
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString('utf8');
        if (Buffer.byteLength(body) > 1024) {
          send(413, 'Request too large');
          return;
        }
      }
      const fields = new URLSearchParams(body),
        candidate = fields.get('nonce') || '';
      if (candidate.length !== nonce.length || !timingSafeEqual(Buffer.from(candidate), Buffer.from(nonce))) return send(403, 'Request refused');
      const token = (fields.get('token') || '').trim();
      if (!/^smena_int_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)) return send(400, 'Invalid integration token / Неверный токен интеграции');
      await save(token);
      send(200, 'Connected. You can close this tab. / Подключено. Можно закрыть вкладку.');
      finish();
    } catch {
      send(400, 'Could not connect. Check the token and try again. / Не удалось подключиться. Проверьте токен и повторите.');
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = 'http://127.0.0.1:' + server.address().port;
  timer = setTimeout(() => finish(new Error('Local credential setup expired.')), timeoutMs);
  return { url: origin + '/' + nonce, done, close: () => finish(new Error('Local credential setup cancelled.')) };
}
