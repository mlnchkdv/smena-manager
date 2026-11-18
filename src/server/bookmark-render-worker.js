// Ephemeral, credential-free browser. Only the parent process fetches resources.
import { chromium } from 'playwright';
let browser;
const replies = new Map();
process.on('message', async message => {
  if (message.type === 'resource') {
    replies.get(message.id)?.(message);
    replies.delete(message.id);
    return;
  }
  if (message.type !== 'capture') return;
  try {
    browser = await chromium.launch({
      headless: true,
      chromiumSandbox: process.platform !== 'win32',
      args: [
        '--proxy-server=http://127.0.0.1:9',
        '--disable-background-networking',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: false });
    await context.routeWebSocket('**/*', socket => socket.close());
    let sequence = 0,
      requests = 0;
    await context.route('**/*', async route => {
      if (route.request().method() !== 'GET' || ++requests > 120 || !/^https?:/u.test(route.request().url())) return route.abort();
      const id = ++sequence;
      const response = await new Promise(resolve => {
        replies.set(id, resolve);
        process.send({ type: 'fetch', id, url: route.request().url() });
      });
      if (!response.body) return route.abort();
      await route.fulfill({
        status: 200,
        contentType: response.contentType,
        body: Buffer.from(response.body, 'base64'),
        headers: { 'Content-Security-Policy': "worker-src 'none'; frame-src 'none'; object-src 'none'" },
      });
    });
    const page = await context.newPage();
    await page.goto(message.url, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    const html = await page.content();
    if (Buffer.byteLength(html) > 4 * 1024 * 1024) throw new Error('Large DOM');
    const screenshot = (await page.screenshot({ type: 'jpeg', quality: 72, animations: 'disabled' })).toString('base64');
    process.send({ type: 'result', page: { html, url: page.url(), screenshot } });
  } catch {
    process.send({ type: 'error' });
  } finally {
    await browser?.close();
    process.disconnect();
  }
});
