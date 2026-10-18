import { pathToFileURL } from 'node:url';

export function smokeOrigin(input) {
  const url = new URL(input.includes('://') ? input : `https://${input}`);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    (local ? !['http:', 'https:'].includes(url.protocol) : url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app'))
  )
    throw new Error('Use an HTTPS Vercel origin or a local test origin, without credentials, path, query or fragment.');
  return url.origin;
}

async function boundedText(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) throw new Error('Unexpectedly large smoke-check response.');
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function smokeDeployment(input, options = {}) {
  const origin = smokeOrigin(input);
  const request = options.fetch || fetch;
  const results = [];
  for (const path of ['/', '/api/health', '/api/auth/config', '/api/workspace']) {
    const response = await request(`${origin}${path}`, {
      method: 'GET',
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const expected = path === '/api/workspace' ? 401 : 200;
    if (response.status !== expected) {
      await response.body?.cancel().catch(() => {});
      throw new Error(`${path}: expected HTTP ${expected}, received ${response.status}.`);
    }
    if (path === '/api/workspace') await response.body?.cancel().catch(() => {});
    else {
      const text = await boundedText(response);
      if (path === '/') {
        if (!response.headers.get('content-type')?.includes('text/html') || !/<script\b[^>]*\btype=["']module["']/iu.test(text))
          throw new Error('The frontend entry is missing or is not HTML.');
      } else {
        if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`${path}: expected JSON, not a fallback page.`);
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`${path}: invalid JSON.`);
        }
        if (path === '/api/health' && (data.status !== 'ok' || data.service !== 'smena-manager')) throw new Error('API liveness failed.');
        if (path === '/api/auth/config' && (data.deploymentReady !== true || !(data.googleAuthEnabled === true || data.accessIdEnabled === true)))
          throw new Error('Sign-in configuration is not ready.');
      }
    }
    results.push({ path, status: response.status });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await smokeDeployment(process.argv[2] || process.env.DEPLOYMENT_URL || 'https://smena-manager.vercel.app');
    for (const item of results) console.log(`PASS ${item.path} HTTP ${item.status}`);
  } catch (error) {
    console.error(`Deployment smoke failed: ${error.message}`);
    process.exitCode = 1;
  }
}
