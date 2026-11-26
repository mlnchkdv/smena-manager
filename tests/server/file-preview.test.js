import assert from 'node:assert/strict';
import test from 'node:test';
import { filePreviewPolicy, canLoadThumbnail } from '../../src/shared/file-preview-policy.js';

test('previews allow bounded raster images and plain text but never active formats', () => {
  const file = { storageName: 'trusted', bytes: 100 };
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'image/png' }).kind, 'image');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/plain' }).kind, 'text');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'application/pdf' }).kind, 'pdf');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'application/pdf', bytes: 21 * 1024 * 1024 }).kind, null);
  for (const mimeType of ['image/svg+xml', 'application/javascript']) {
    assert.equal(filePreviewPolicy({ ...file, mimeType }).kind, null);
  }
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/plain', bytes: 2 * 1024 * 1024 }).kind, null);
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/html' }).kind, 'html');
  assert.equal(filePreviewPolicy({ ...file, name: 'report.htm', mimeType: 'application/octet-stream' }).kind, 'html');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/html', bytes: 6 * 1024 ** 2 }).kind, null);
  assert.equal(filePreviewPolicy({ mimeType: 'image/png' }).kind, null);
  assert.equal(canLoadThumbnail({ ...file, mimeType: 'image/png' }), true);
  assert.equal(canLoadThumbnail({ ...file, mimeType: 'image/gif' }), false);
  assert.equal(canLoadThumbnail({ ...file, mimeType: 'IMAGE/GIF; charset=binary' }), false);
  assert.equal(canLoadThumbnail({ ...file, mimeType: 'image/png', bytes: 300 * 1024 }), false);
});

test('reads bounded text exports with generic storage metadata', () => {
  const file = { storageName: 'stored', bytes: 120 };
  for (const name of ['data.TSV', 'results.jsonl', 'README.md', 'run.log']) {
    assert.equal(filePreviewPolicy({ ...file, name, mimeType: 'application/octet-stream' }).kind, 'text');
  }
  assert.equal(filePreviewPolicy({ ...file, name: 'notes.TXT' }).kind, 'text');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/tab-separated-values; charset=utf-8' }).kind, 'text');
  assert.equal(filePreviewPolicy({ ...file, name: 'big.log', bytes: 1024 ** 2 + 1 }).kind, null);
  assert.equal(filePreviewPolicy({ ...file, name: 'document.txt', mimeType: 'application/zip' }).kind, null);
  assert.equal(filePreviewPolicy({ ...file, name: 'data.csv.exe' }).kind, null);
});
