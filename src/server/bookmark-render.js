import { fork } from 'node:child_process';
import { tmpdir } from 'node:os';
import { pageUrl, pageError, fetchPublicRenderResource } from './web-page-fetch.js';

let active = 0;
export function renderPublicPage(value, { fetchResource = fetchPublicRenderResource } = {}) {
  const url = pageUrl(value).href;
  if (active >= 1) throw pageError('PAGE_RENDER_BUSY', 429);
  active++;
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(
      ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'PLAYWRIGHT_BROWSERS_PATH'].filter(key => process.env[key]).map(key => [key, process.env[key]]),
    );
    const child = fork(new URL('./bookmark-render-worker.js', import.meta.url), [], {
      env,
      cwd: tmpdir(),
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
    });
    let bytes = 0,
      requests = 0,
      finished = false;
    const signal = AbortSignal.timeout(35000);
    const finish = (error, result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      child.kill();
      active--;
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(pageError('PAGE_RENDER_UNAVAILABLE')), 40000);
    child.on('error', () => finish(pageError('PAGE_RENDER_UNAVAILABLE')));
    child.on('exit', () => {
      if (!finished) finish(pageError('PAGE_RENDER_UNAVAILABLE'));
    });
    child.on('message', async message => {
      if (message.type === 'fetch') {
        try {
          if (++requests > 120) throw pageError('PAGE_TOO_LARGE', 413);
          // No request headers, credentials, cookies or arbitrary methods cross
          // the broker. DNS and every redirect are checked and address-pinned.
          const resource = await fetchResource(message.url, { signal });
          bytes += resource.body.length;
          if (bytes > 12 * 1024 * 1024) throw pageError('PAGE_TOO_LARGE', 413);
          if (child.connected) child.send({ type: 'resource', id: message.id, body: resource.body.toString('base64'), contentType: resource.contentType });
        } catch {
          if (child.connected) child.send({ type: 'resource', id: message.id });
        }
      } else if (message.type === 'result') {
        try {
          pageUrl(message.page.url);
          finish(null, message.page);
        } catch {
          finish(pageError('PAGE_RENDER_UNAVAILABLE'));
        }
      } else if (message.type === 'error') finish(pageError('PAGE_RENDER_UNAVAILABLE'));
    });
    child.send({ type: 'capture', url });
  });
}
