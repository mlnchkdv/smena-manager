import https from 'node:https';
import { Readable } from 'node:stream';
import { smokeDeployment } from '../../scripts/smoke-deployment.js';

// Check this machine's actual TLS vhost, with normal certificate verification
// and SNI. Never turn off TLS validation or probe an old DNS destination.
export function localTlsFetch(origin) {
  const expected = new URL(origin);
  return (input, options = {}) =>
    new Promise((resolve, reject) => {
      const url = new URL(input);
      if (url.origin !== expected.origin || expected.protocol !== 'https:') return reject(new Error('Unexpected health origin.'));
      const request = https.request(
        {
          hostname: '127.0.0.1',
          port: 443,
          servername: expected.hostname,
          path: url.pathname + url.search,
          method: 'GET',
          headers: { Host: expected.hostname },
          signal: options.signal,
        },
        response => {
          const headers = new Headers();
          for (const [key, value] of Object.entries(response.headers)) if (value != null) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
          resolve(new Response([204, 205, 304].includes(response.statusCode) ? null : Readable.toWeb(response), { status: response.statusCode, headers }));
        },
      );
      request.on('error', reject);
      request.end();
    });
}
export async function verifyBackend(commit, { fetcher = fetch } = {}) {
  const response = await fetcher('http://127.0.0.1:3001/api/health', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Backend health failed.');
  const data = await response.json();
  if (data.status !== 'ok' || data.service !== 'smena-manager' || data.release !== commit) throw new Error('Backend release does not match.');
}
export async function verifyVhost(domain, commit, { fetcher = localTlsFetch(`https://${domain}`) } = {}) {
  const origin = `https://${domain}`;
  await smokeDeployment(origin, { allowCustomOrigin: true, fetch: fetcher });
  for (const target of ['/api/health', '/app-version.json']) {
    const response = await fetcher(origin + target, { signal: AbortSignal.timeout(10000) });
    const data = await response.json();
    if (!response.ok || (target === '/api/health' ? data.release : data.version) !== commit) throw new Error('Frontend/backend release mismatch.');
  }
}
