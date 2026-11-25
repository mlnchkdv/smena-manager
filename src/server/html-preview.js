import { parseDocument } from 'htmlparser2';
import { findAll } from 'domutils';
import sanitizeHtml from '../../.generated/sanitizer.mjs';

export const HTML_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;
export const HTML_PREVIEW_CSP =
  "sandbox; default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

// Both the response and the embedding iframe enforce an opaque origin.
export const INTERACTIVE_HTML_PREVIEW_CSP =
  "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export function decodeHtml(buffer, mimeType = '') {
  const declared = /charset\s*=\s*["']?([^\s;"'/>]+)/i.exec(mimeType + ' ' + buffer.subarray(0, 4096).toString('latin1'))?.[1];
  const charset = buffer[0] === 255 && buffer[1] === 254 ? 'utf-16le' : buffer[0] === 254 && buffer[1] === 255 ? 'utf-16be' : declared || 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
}

// This document is served only inside an opaque-origin, scriptless sandbox.
// Original CSS is useful for exported reports; external resources, forms,
// frames, links and active markup cannot reach the network or the parent app.
export function htmlPreviewDocument(source) {
  const ids = new Set(findAll(node => !!node.attribs.id, parseDocument(String(source)).children).map(node => node.attribs.id));
  const content = sanitizeHtml(String(source), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'style', 'img', 'hr', 'section', 'article', 'header', 'footer', 'main', 'figure', 'figcaption'],
    allowedAttributes: {
      '*': ['style', 'class', 'id', 'lang', 'dir'],
      a: ['href'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan'],
    },
    transformTags: {
      a(tagName, attrs) {
        const href = attrs.href || '';
        if (href.startsWith('#') && href.length > 1) {
          try {
            if (ids.has(decodeURIComponent(href.slice(1)))) return { tagName, attribs: attrs };
          } catch {
            /* Invalid fragment encoding. */
          }
        }
        return { tagName: 'span', attribs: attrs.id ? { id: attrs.id } : {} };
      },
    },
    allowedSchemes: ['data'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
    allowVulnerableTags: true,
    parseStyleAttributes: false,
    nonTextTags: ['script', 'textarea', 'option', 'noscript', 'iframe', 'object', 'svg', 'math', 'template'],
  });
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><style>html{overflow-wrap:anywhere}body{margin:20px}img{max-width:100%;height:auto}pre,table{max-width:100%;overflow:auto}pre{white-space:pre-wrap}</style></head><body>${content}</body></html>`;
}
