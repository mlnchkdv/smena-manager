export class SmenaApiClient {
  constructor({ origin = 'https://smena.team', token, fetch = globalThis.fetch } = {}) {
    const url = new URL(origin);
    if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))))
      throw new Error('Use an HTTPS origin, or an explicit local development origin.');
    this.origin = origin;
    this.token = token;
    this.fetch = fetch;
  }
  async call(method, path, { query, body, etag, operationId, signal } = {}) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path.');
    const url = new URL('/api/v1' + path, this.origin);
    for (const [key, value] of Object.entries(query || {})) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers = { Accept: 'application/json', Authorization: 'Bearer ' + this.token };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (etag) headers['If-Match'] = etag;
    if (operationId) headers['Idempotency-Key'] = operationId;
    let response;
    try {
      response = await this.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
      });
    } catch {
      throw Object.assign(new Error('Connection failed. For an uncertain write, check its operation ID before retrying the same payload.'), {
        code: 'NETWORK_ERROR',
      });
    }
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 512 * 1024) {
        await reader.cancel();
        throw Object.assign(new Error('Response exceeds the MCP limit. Request a smaller page.'), { code: 'RESPONSE_TOO_LARGE' });
      }
      parts.push(part.value);
    }
    let value;
    try {
      value = JSON.parse(Buffer.concat(parts).toString('utf8'));
    } catch {
      throw Object.assign(new Error('The server returned an invalid response.'), { code: 'INVALID_RESPONSE' });
    }
    if (!response.ok)
      throw Object.assign(new Error(value.message || 'Request failed.'), {
        code: value.code || 'API_ERROR',
        status: response.status,
        request_id: value.request_id,
      });
    return value;
  }
}
