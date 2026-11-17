import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import sanitizeHtml from '../../.generated/sanitizer.mjs';
import { decodeHtml } from './html-preview.js';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
])
  blocked.addSubnet(address, prefix, 'ipv4');
const publicV6 = new BlockList();
publicV6.addSubnet('2000::', 3, 'ipv6');
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
])
  blocked.addSubnet(address, prefix, 'ipv6');
export const pageError = (code = 'PAGE_UNAVAILABLE', statusCode = 422) => Object.assign(new Error(code), { code, statusCode });
export function publicPageAddress(address) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4') : family === 6 && publicV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
export function pageUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw pageError('PAGE_INVALID_URL');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port)))
    throw pageError('PAGE_INVALID_URL');
  url.hash = '';
  return url;
}

// DNS is resolved and validated before each hop; connect to that exact address,
// retaining the original Host and TLS hostname. No cookies or auth are forwarded.
async function fetchPublicResource(value, { resolve = lookup, transport, signal, image = false, asset = false } = {}) {
  let url = pageUrl(value);
  signal ||= AbortSignal.timeout(15000);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const records = await Promise.race([
      resolve(hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => {
        if (signal.aborted) reject(pageError());
        else signal.addEventListener('abort', () => reject(pageError()), { once: true });
      }),
    ]);
    if (!records.length || records.some(row => !publicPageAddress(row.address))) throw pageError('PAGE_BLOCKED_ADDRESS');
    const address = records[0];
    const result = await new Promise((resolveResult, reject) => {
      const request = (transport || (url.protocol === 'https:' ? https : http)).get(
        url,
        {
          signal,
          lookup: (_host, options, callback) => (options.all ? callback(null, [address]) : callback(null, address.address, address.family)),
          headers: {
            'User-Agent': 'Smena-PagePreview/1.0',
            Accept: asset ? 'text/css,image/*,font/*;q=0.9' : image ? 'image/png,image/jpeg,image/webp' : 'text/html,application/xhtml+xml',
            'Accept-Encoding': 'identity',
          },
        },
        async response => {
          try {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
              response.destroy();
              return resolveResult({ redirect: response.headers.location });
            }
            if (
              response.statusCode !== 200 ||
              !(
                asset
                  ? /^(text\/css|image\/(png|jpeg|webp|gif|svg\+xml)|font\/[a-z0-9.-]+|application\/(font-woff|x-font-ttf|x-font-opentype|vnd.ms-fontobject|octet-stream))\b/i
                  : image
                    ? /^image\/(png|jpeg|webp)\b/i
                    : /^(text\/html|application\/xhtml\+xml)\b/i
              ).test(response.headers['content-type'] || '') ||
              (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
            )
              throw pageError();
            const chunks = [];
            let bytes = 0;
            for await (const chunk of response) {
              bytes += chunk.length;
              if (bytes > 2 * 1024 * 1024) throw pageError('PAGE_TOO_LARGE', 413);
              chunks.push(chunk);
            }
            const body = Buffer.concat(chunks);
            if (image || asset) resolveResult({ body, contentType: response.headers['content-type'].split(';')[0].toLowerCase(), url: url.href });
            else resolveResult({ html: decodeHtml(body, response.headers['content-type']), url: url.href });
          } catch (error) {
            response.destroy();
            reject(error);
          }
        },
      );
      request.on('error', () => reject(pageError()));
    });
    if (!Object.hasOwn(result, 'redirect')) return result;
    if (!result.redirect) throw pageError();
    url = pageUrl(new URL(result.redirect, url).href);
  }
  throw pageError('PAGE_REDIRECT_LIMIT');
}

export const fetchPublicPage = (value, options) => fetchPublicResource(value, options);
export const fetchPublicAsset = (value, options) => fetchPublicResource(value, { ...options, asset: true });
export async function fetchPublicImage(value, options = {}) {
  const result = await fetchPublicResource(value, { ...options, image: true });
  const body = result.body;
  const type = body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'image/png'
    : body[0] === 255 && body[1] === 216 && body[2] === 255
      ? 'image/jpeg'
      : body.subarray(0, 4).toString() === 'RIFF' && body.subarray(8, 12).toString() === 'WEBP'
        ? 'image/webp'
        : '';
  if (!type || type !== result.contentType) throw pageError('PAGE_IMAGE_UNAVAILABLE');
  return result;
}

export function pageMetadata(html, url) {
  const meta = {};
  let title = '',
    inTitle = false;
  sanitizeHtml(html, {
    allowedTags: ['title'],
    allowedAttributes: {},
    onOpenTag: (name, attributes) => {
      if (name === 'title') inTitle = true;
      if (name === 'meta') {
        const key = String(attributes.property || attributes.name || '').toLowerCase();
        if (!meta[key] && attributes.content) meta[key] = attributes.content;
      }
    },
    onCloseTag: name => {
      if (name === 'title') inTitle = false;
    },
    textFilter: text => {
      if (inTitle) title += text;
      return text;
    },
  });
  const clean = (text, max) =>
    sanitizeHtml(String(text || ''), { allowedTags: [], allowedAttributes: {} })
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  // Decode HTML entities without inserting remote markup in the app.
  const decode = text => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[key]);
  let imageUrl = '';
  try {
    const value = meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'];
    if (value) imageUrl = pageUrl(new URL(decode(value), url).href).href;
  } catch {
    /* An invalid optional image must not prevent title autofill. */
  }
  return {
    url,
    title: decode(clean(meta['og:title'] || meta['twitter:title'] || title, 250)),
    description: decode(clean(meta.description || meta['og:description'] || meta['twitter:description'], 2000)),
    siteName: clean(meta['og:site_name'], 120) || new URL(url).hostname,
    imageUrl,
  };
}
