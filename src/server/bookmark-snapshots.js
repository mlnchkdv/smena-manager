import { createHash, randomUUID } from 'node:crypto';
import sanitizeHtml from '../../.generated/sanitizer.mjs';
import { pageError, pageMetadata } from './web-page-fetch.js';
import { safeArchiveDocument } from './bookmark-html-archive.js';

export const SNAPSHOT_LIMIT = 10;
export const SNAPSHOT_MAX_BYTES = 20 * 1024 * 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
export function bookmarkReaderPage(page) {
  const html = sanitizeHtml(page.html, {
    allowedTags: [
      'p',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'b',
      'strong',
      'i',
      'em',
      's',
      'u',
      'table',
      'caption',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'article',
      'section',
      'figure',
      'figcaption',
      'details',
      'summary',
      'a',
    ],
    allowedAttributes: { td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    nonTextTags: ['head', 'title', 'script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'svg', 'math', 'template', 'nav', 'footer', 'form'],
  });
  if (!sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim()) throw pageError('PAGE_EMPTY');
  return { ...pageMetadata(page.html, page.url), html, capturedAt: new Date().toISOString() };
}
export async function saveBookmarkSnapshot(storage, workspace, bookmark, page, snapshotId = randomUUID()) {
  const content = JSON.stringify({ kind: 'smena-bookmark-page-v1', workspace, bookmarkId: bookmark.id, ...page });
  const bytes = Buffer.byteLength(content);
  if (bytes > SNAPSHOT_MAX_BYTES) throw pageError('PAGE_TOO_LARGE', 413);
  const id = snapshotId;
  const stored = await storage.uploadFile(`bookmark-page-${id}.json`, Buffer.from(content), 'application/json');
  return {
    id,
    capturedAt: page.capturedAt,
    sourceUrl: bookmark.url,
    finalUrl: page.url,
    title: page.title,
    format: page.format || 'text',
    capture: page.capture,
    sha256: hash(content),
    storageName: stored.filename,
    storageFileId: stored.fileId,
    bytes,
    mimeType: 'application/json',
  };
}
export async function readBookmarkSnapshot(storage, workspace, bookmark, id) {
  const ref = bookmark.pageSnapshots?.find(row => row.id === id);
  if (
    !ref ||
    !/^(?:bookmark-page-[a-f0-9-]{36}\.json|recovered-[a-f0-9-]{36}\.bin)$/.test(ref.storageName || '') ||
    !/^[a-f0-9]{64}$/.test(ref.sha256 || '') ||
    ref.bytes > SNAPSHOT_MAX_BYTES
  )
    throw pageError('PAGE_SNAPSHOT_UNAVAILABLE', 404);
  const result = await storage.openDownloadStream(ref.storageName, ref.storageFileId);
  if (!result) throw pageError('PAGE_SNAPSHOT_UNAVAILABLE', 404);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of result.stream) {
    bytes += chunk.length;
    if (bytes > SNAPSHOT_MAX_BYTES) {
      result.stream.destroy();
      throw pageError('PAGE_SNAPSHOT_UNAVAILABLE', 404);
    }
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks).toString('utf8');
  if (bytes !== ref.bytes || hash(content) !== ref.sha256) throw pageError('PAGE_SNAPSHOT_UNAVAILABLE', 404);
  let page;
  try {
    page = JSON.parse(content);
  } catch {
    throw pageError('PAGE_SNAPSHOT_UNAVAILABLE', 404);
  }
  if (page.kind !== 'smena-bookmark-page-v1' || page.workspace !== workspace || page.bookmarkId !== bookmark.id || typeof page.html !== 'string')
    throw pageError('PAGE_SNAPSHOT_UNAVAILABLE', 404);
  // Treat restored/legacy blobs as untrusted even after integrity validation.
  return {
    ...page,
    html: bookmarkReaderPage({ html: page.html, url: page.url }).html,
    ...(page.format === 'html' && typeof page.document === 'string' ? { document: safeArchiveDocument(page.document) } : {}),
  };
}

export function bookmarkPageSummary(page) {
  const result = { ...page };
  delete result.document;
  delete result.screenshot;
  return result;
}
