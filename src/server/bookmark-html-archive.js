import { parseDocument } from 'htmlparser2';
import serialize from 'dom-serializer';
import { removeElement, replaceElement } from 'domutils';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import sanitizeHtml from '../../.generated/sanitizer.mjs';
import { fetchPublicAsset, pageUrl } from './web-page-fetch.js';
import { bookmarkReaderPage } from './bookmark-snapshots.js';

export const ARCHIVE_CSP =
  "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";
const MAX_ASSETS = 80;
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const walk = root => {
  const result = [];
  function visit(node) {
    if (node.type === 'tag' || node.type === 'style' || node.type === 'script') result.push(node);
    for (const child of node.children || []) visit(child);
  }
  visit(root);
  return result;
};
const svgTags = [
  'svg',
  'g',
  'path',
  'circle',
  'ellipse',
  'rect',
  'line',
  'polyline',
  'polygon',
  'defs',
  'use',
  'symbol',
  'clippath',
  'mask',
  'lineargradient',
  'radialgradient',
  'stop',
  'text',
  'tspan',
  'title',
  'desc',
];
const allowedTags = [
  ...new Set([
    ...sanitizeHtml.defaults.allowedTags,
    'html',
    'head',
    'body',
    'meta',
    'title',
    'style',
    'img',
    'picture',
    'source',
    'header',
    'footer',
    'main',
    'section',
    'article',
    'figure',
    'figcaption',
    'nav',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'option',
    'label',
    'details',
    'summary',
    ...svgTags,
  ]),
];

// Applied both at capture and at read time. Archives never run scripts or fetch
// live resources, including restored/imported blobs whose hashes are valid.
export function safeArchiveDocument(source) {
  const content = sanitizeHtml(String(source), {
    allowedTags,
    allowVulnerableTags: true,
    parseStyleAttributes: false,
    allowedAttributes: {
      '*': ['id', 'class', 'style', 'lang', 'dir', 'role', 'aria-*', 'data-*', 'width', 'height', 'title', 'hidden'],
      img: ['src', 'alt', 'width', 'height'],
      source: ['src', 'type', 'media'],
      html: ['lang', 'dir', 'class', 'style'],
      meta: ['charset', 'name', 'content'],
      a: ['title'],
      input: ['type', 'value', 'checked', 'disabled', 'placeholder'],
      button: ['type', 'disabled'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
      style: ['media'],
      ...Object.fromEntries(
        svgTags.map(tag => [
          tag,
          [
            'viewbox',
            'xmlns',
            'x',
            'y',
            'x1',
            'x2',
            'y1',
            'y2',
            'cx',
            'cy',
            'r',
            'rx',
            'ry',
            'd',
            'points',
            'fill',
            'stroke',
            'stroke-width',
            'stroke-linecap',
            'stroke-linejoin',
            'fill-rule',
            'clip-rule',
            'transform',
            'opacity',
            'offset',
            'stop-color',
            'stop-opacity',
            'clip-path',
            'mask',
            'href',
            'preserveaspectratio',
          ],
        ]),
      ),
    },
    allowedSchemes: ['data'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
    nonTextTags: ['script', 'iframe', 'object', 'embed', 'noscript', 'template'],
    transformTags: {
      meta: (_tag, attrs) => ({
        tagName: 'meta',
        attribs: attrs.charset
          ? { charset: 'utf-8' }
          : attrs.name === 'viewport'
            ? { name: 'viewport', content: attrs.content || 'width=device-width,initial-scale=1' }
            : {},
      }),
      input: (_tag, attrs) => ({ tagName: 'input', attribs: { ...attrs, disabled: '', ...(attrs.type === 'password' ? { value: '' } : {}) } }),
      '*': (tag, attrs) => {
        const next = { ...attrs };
        for (const key of Object.keys(next))
          if (/^on/i.test(key) || ['srcset', 'action', 'formaction', 'ping', 'autofocus', 'contenteditable'].includes(key)) delete next[key];
        if (next.href && !next.href.startsWith('#')) delete next.href;
        if (next.src && !/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(next.src)) delete next.src;
        return { tagName: tag, attribs: next };
      },
    },
  });
  const policy = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${ARCHIVE_CSP}"><meta name="referrer" content="no-referrer">`;
  const freeze = '<style>*{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}</style>';
  if (/<html(?:\s|>)/i.test(content)) {
    const document = /<head(?:\s[^>]*)?>/i.test(content)
      ? content.replace(/<head(?:\s[^>]*)?>/i, match => match + policy)
      : content.replace(/<html(?:\s[^>]*)?>/i, match => match + '<head>' + policy + '</head>');
    return '<!doctype html>' + document.replace(/<\/head>/i, freeze + '</head>');
  }
  return '<!doctype html><html><head>' + policy + freeze + '</head><body>' + content + '</body></html>';
}

export async function archiveBookmarkHtml(page, { fetchAsset = fetchPublicAsset, signal = AbortSignal.timeout(30000) } = {}) {
  const root = parseDocument(page.html);
  const elements = walk(root);
  const sourceCandidate = value =>
    String(value || '')
      .split(',')
      .map(part => part.trim().split(/\s+/)[0])
      .filter(Boolean)
      .at(-1) || '';
  const pictureSources = new Map();
  for (const element of elements.filter(node => node.name === 'picture')) {
    const candidates = element.children
      .filter(node => node.name === 'source')
      .map(node => node.attribs.srcset)
      .filter(Boolean);
    for (const image of element.children.filter(node => node.name === 'img')) pictureSources.set(image, sourceCandidate(candidates[0]));
  }
  const pending = new Map();
  const failures = new Set();
  let total = 0,
    saved = 0,
    active = 0;
  const waiters = [];
  const baseTag = elements.find(e => e.name === 'base' && e.attribs.href);
  let base = page.url;
  try {
    if (baseTag) base = pageUrl(new URL(baseTag.attribs.href, page.url).href).href;
  } catch {
    /* Retain the fetched page address. */
  }
  const resolveUrl = (value, parent) => {
    if (!value) return '';
    try {
      return pageUrl(new URL(value, parent).href).href;
    } catch {
      return '';
    }
  };
  async function asset(value, parent) {
    const url = resolveUrl(value, parent);
    if (!url) {
      failures.add(String(value).slice(0, 200));
      return null;
    }
    if (pending.has(url)) return pending.get(url);
    if (pending.size >= MAX_ASSETS || signal.aborted) {
      failures.add(url);
      return null;
    }
    const work = Promise.resolve().then(async () => {
      if (active >= 4) await new Promise(resolve => waiters.push(resolve));
      else active++;
      try {
        if (signal.aborted || total >= MAX_ASSET_BYTES) throw new Error('Capture resource budget or deadline');
        const resource = await fetchAsset(url, { signal });
        total += resource.body.length;
        if (total > MAX_ASSET_BYTES) throw new Error('Capture resource budget');
        saved++;
        return resource;
      } catch {
        failures.add(url);
        return null;
      } finally {
        if (waiters.length) waiters.shift()();
        else active--;
      }
    });
    pending.set(url, work);
    return work;
  }
  async function dataUrl(value, parent) {
    if (/^data:(image\/|font\/|application\/(font|x-font|octet-stream))/i.test(value || '')) return value;
    if (String(value).startsWith('#')) return value;
    const result = await asset(value, parent);
    if (!result || result.contentType === 'text/css') return '';
    const kind = result.contentType;
    let body = result.body;
    if (kind === 'image/svg+xml')
      body = Buffer.from(
        sanitizeHtml(body.toString('utf8'), {
          allowedTags: svgTags,
          allowedAttributes: {
            '*': [
              'id',
              'class',
              'style',
              'xmlns',
              'viewbox',
              'width',
              'height',
              'x',
              'y',
              'x1',
              'x2',
              'y1',
              'y2',
              'cx',
              'cy',
              'r',
              'rx',
              'ry',
              'd',
              'points',
              'fill',
              'stroke',
              'stroke-width',
              'transform',
              'opacity',
              'offset',
              'stop-color',
              'stop-opacity',
            ],
          },
          nonTextTags: ['script', 'foreignobject', 'iframe', 'object', 'style'],
        }),
      );
    return `data:${kind};base64,${body.toString('base64')}`;
  }
  async function css(source, parent, seen = new Set()) {
    let tree;
    try {
      tree = postcss.parse(source);
    } catch {
      failures.add(parent + '#css');
      return '';
    }
    const imports = [];
    tree.walkAtRules('import', rule => imports.push(rule));
    await Promise.all(
      imports.map(async rule => {
        const params = valueParser(rule.params),
          first = params.nodes.find(n => n.type !== 'space');
        const value = first?.type === 'function' ? valueParser.stringify(first.nodes).replace(/^["']|["']$/g, '') : first?.value;
        const url = resolveUrl(value, parent);
        if (!url || seen.has(url) || seen.size >= 4) {
          failures.add(url || parent);
          rule.remove();
          return;
        }
        const resource = await asset(url, parent);
        if (!resource || resource.contentType !== 'text/css') {
          rule.remove();
          return;
        }
        const imported = await css(resource.body.toString('utf8'), resource.url, new Set([...seen, url]));
        const suffix = rule.params.slice(valueParser.stringify([first]).length).trim();
        if (suffix && /^(?:screen|print|all|\(|not\b|only\b)/i.test(suffix))
          rule.replaceWith(postcss.atRule({ name: 'media', params: suffix, nodes: postcss.parse(imported).nodes }));
        else {
          if (suffix) failures.add(parent + '#import-condition');
          rule.replaceWith(...postcss.parse(imported).nodes);
        }
      }),
    );
    const declarations = [];
    tree.walkDecls(decl => declarations.push(decl));
    await Promise.all(
      declarations.map(async decl => {
        const parsed = valueParser(decl.value),
          urls = [];
        parsed.walk(node => {
          if (node.type === 'function' && node.value.toLowerCase() === 'url') {
            urls.push(node);
            return false;
          }
        });
        await Promise.all(
          urls.map(async node => {
            const value = valueParser
              .stringify(node.nodes)
              .trim()
              .replace(/^["']|["']$/g, '');
            const result = await dataUrl(value, parent);
            node.nodes = [{ type: 'string', quote: '"', value: result }];
          }),
        );
        decl.value = parsed.toString();
      }),
    );
    tree.walkAtRules(rule => {
      if (['charset', 'document'].includes(rule.name.toLowerCase())) rule.remove();
    });
    return tree.toString().replace(/<\/style/gi, '<\\/style');
  }
  let scripts = 0;
  await Promise.all(
    elements.map(async element => {
      const attrs = element.attribs;
      if (element.name === 'script') {
        scripts++;
        removeElement(element);
        return;
      }
      if (['base', 'iframe', 'object', 'embed'].includes(element.name)) {
        if (element.name !== 'base') failures.add(page.url + '#embedded-content');
        removeElement(element);
        return;
      }
      if (element.name === 'link') {
        if ((attrs.rel || '').toLowerCase().split(/\s+/).includes('stylesheet')) {
          const resource = await asset(attrs.href, base);
          const value = resource?.contentType === 'text/css' ? await css(resource.body.toString('utf8'), resource.url, new Set([resource.url])) : '';
          const style = parseDocument('<style>' + value + '</style>').children[0];
          if (attrs.media) style.attribs.media = attrs.media;
          replaceElement(element, style);
        } else removeElement(element);
        return;
      }
      if (element.name === 'style') {
        const value = await css(element.children.map(n => n.data || '').join(''), base);
        element.children = parseDocument('<style>' + value + '</style>').children[0].children;
      }
      if (attrs.style) {
        const value = await css('x{' + attrs.style + '}', base);
        attrs.style = value.replace(/^x\s*\{|\}\s*$/g, '');
      }
      if (element.name === 'img') {
        const value = attrs['data-src'] || pictureSources.get(element) || attrs.src || sourceCandidate(attrs.srcset);
        if (value) attrs.src = await dataUrl(value, base);
        delete attrs.srcset;
      }
      if (element.name === 'source') removeElement(element);
      for (const key of ['background', 'poster'])
        if (attrs[key]) {
          attrs[key] = await dataUrl(attrs[key], base);
        }
    }),
  );
  return {
    ...bookmarkReaderPage(page),
    format: 'html',
    document: safeArchiveDocument(serialize(root)),
    capture: { mode: 'static-html', assets: saved, missing: failures.size, bytes: total, scriptsDisabled: scripts > 0 },
  };
}
