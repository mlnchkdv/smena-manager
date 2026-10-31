export function webCapture(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid capture');
  const url = new URL(value.url);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Invalid URL');
  return { url: url.toString(), title: String(value.title || url.hostname).slice(0, 250), excerpt: String(value.excerpt || '').slice(0, 8000) };
}
export function bookmarkUrlKey(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}
