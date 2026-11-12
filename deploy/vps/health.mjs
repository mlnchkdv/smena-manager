import https from 'node:https';
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
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
          headers: { Host: expected.hostname, ...(options.headers?.['Accept-Encoding'] ? { 'Accept-Encoding': options.headers['Accept-Encoding'] } : {}) },
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
  await verifyStaticCompression(domain, { fetcher });
}

async function boundedBytes(response) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > 8 * 1024 * 1024) throw Error('Static compression probe exceeds its limit.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
export async function verifyStaticCompression(domain, { fetcher = localTlsFetch(`https://${domain}`) } = {}) {
  const origin = `https://${domain}`;
  const page = await fetcher(origin + '/', { signal: AbortSignal.timeout(10000) });
  const html = (await boundedBytes(page)).toString('utf8');
  const asset = html.match(/src=["'](\/assets\/[a-zA-Z0-9_.-]+\.js)["']/)?.[1];
  if (!page.ok || !asset) throw Error('No static JavaScript asset for compression verification.');
  const plain = await fetcher(origin + asset, { headers: { 'Accept-Encoding': 'identity' }, signal: AbortSignal.timeout(10000) });
  const expected = await boundedBytes(plain);
  if (!plain.ok || expected.length < 1024) throw Error('Static compression probe requires a real built asset.');
  const compressed = await fetcher(origin + asset, { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(10000) });
  if (!compressed.ok || compressed.headers.get('content-encoding') !== 'gzip' || !/accept-encoding/i.test(compressed.headers.get('vary') || ''))
    throw Error('Static gzip encoding/Vary is missing.');
  const decoded = gunzipSync(await boundedBytes(compressed), { maxOutputLength: 8 * 1024 * 1024 });
  if (!decoded.equals(expected)) throw Error('Compressed static bytes differ from identity.');
  return { encoding: 'gzip', verified: true };
}
