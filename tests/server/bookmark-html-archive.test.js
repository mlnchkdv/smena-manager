import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveBookmarkHtml, safeArchiveDocument, ARCHIVE_CSP } from '../../src/server/bookmark-html-archive.js';
import { saveBookmarkSnapshot, readBookmarkSnapshot, bookmarkPageSummary } from '../../src/server/bookmark-snapshots.js';
import { Readable } from 'node:stream';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB3sAAAAASUVORK5CYII=', 'base64');
const page = {
  url: 'https://example.com/article',
  html: '<!doctype html><html lang="ru"><head><title>Archive / Архив</title><link rel="stylesheet" href="/styles/main.css"></head><body class="original"><main class="hero"><h1>Original appearance / Исходный вид</h1><img src="/cover.png" alt="Cover" onerror="bad()"><p>Version one</p></main><script>document.body.replaceChildren()</script></body></html>',
};
const assets = {
  'https://example.com/styles/main.css': [
    'text/css',
    '@import "theme.css" screen; .hero{background:#123456 url(../cover.png);padding:24px;color:white} @font-face{font-family:Archive;src:url(/font.woff2)}',
  ],
  'https://example.com/styles/theme.css': ['text/css', 'body.original{margin:0;font-family:Archive,sans-serif}'],
  'https://example.com/cover.png': ['image/png', png],
  'https://example.com/font.woff2': ['font/woff2', Buffer.from('wOF2synthetic')],
};
async function fetchAsset(url) {
  const item = assets[url];
  if (!item) throw new Error('Unavailable');
  return { url, contentType: item[0], body: Buffer.from(item[1]) };
}

test('HTML archive preserves source layout, CSS imports, images and fonts independently of the source', async () => {
  const archive = await archiveBookmarkHtml(page, { fetchAsset });
  assert.equal(archive.format, 'html');
  assert.match(archive.document, /<body class="original">/);
  assert.match(archive.document, /background:#123456/);
  assert.match(archive.document, /@media screen/);
  assert.match(archive.document, /data:image\/png;base64/);
  assert.match(archive.document, /data:font\/woff2;base64/);
  assert.doesNotMatch(archive.document, /<script|onerror|<link|src="https?:/);
  assert.equal(archive.capture.missing, 0);
  assert.equal(archive.capture.assets, 4);
  assert.equal(archive.capture.scriptsDisabled, true);
  assert.match(archive.document, /Content-Security-Policy/);
  assert.match(ARCHIVE_CSP, /script-src 'none'/);
  const changed = await archiveBookmarkHtml({ ...page, html: page.html.replace('Version one', 'Version two') }, { fetchAsset });
  assert.match(archive.document, /Version one/);
  assert.doesNotMatch(archive.document, /Version two/);
  assert.match(changed.document, /Version two/);
});

test('missing archive resources are reported; scripts, navigation and live embeds cannot reach the app', async () => {
  const archive = await archiveBookmarkHtml(
    {
      ...page,
      html:
        page.html +
        '<iframe src="http://127.0.0.1/admin"></iframe><a href="javascript:bad()">Link</a><form action="https://evil.test"><input type="password" value="secret"></form>',
    },
    {
      fetchAsset: async () => {
        throw new Error('Blocked');
      },
    },
  );
  assert.ok(archive.capture.missing >= 2);
  assert.doesNotMatch(archive.document, /<iframe|<script|href=|action=|value="secret"|onerror/);
  assert.match(archive.document, /script-src 'none'/);
  assert.match(safeArchiveDocument('<h1 style="color:red">Saved</h1><script>bad()</script>'), /style="color:red"/);
});

test('HTML archive storage retains document bytes and legacy reader copies remain readable', async () => {
  const blobs = new Map();
  const storage = {
    async uploadFile(name, body) {
      blobs.set(name, body);
      return { filename: name };
    },
    async openDownloadStream(name) {
      return { stream: Readable.from([blobs.get(name)]) };
    },
  };
  const archive = await archiveBookmarkHtml(page, { fetchAsset });
  const bookmark = { id: 'test', url: page.url };
  const reference = await saveBookmarkSnapshot(storage, 'default', bookmark, archive);
  bookmark.pageSnapshots = [reference];
  const read = await readBookmarkSnapshot(storage, 'default', bookmark, reference.id);
  assert.equal(read.format, 'html');
  assert.match(read.document, /background:#123456/);
  assert.equal(bookmarkPageSummary(read).document, undefined);
  const legacy = await saveBookmarkSnapshot(storage, 'default', bookmark, {
    html: '<h1>Legacy reader</h1>',
    url: page.url,
    capturedAt: new Date().toISOString(),
  });
  bookmark.pageSnapshots.push(legacy);
  assert.match((await readBookmarkSnapshot(storage, 'default', bookmark, legacy.id)).html, /Legacy reader/);
});
