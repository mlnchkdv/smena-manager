import assert from 'node:assert/strict';
import test from 'node:test';
import { filePreviewPolicy, canLoadThumbnail } from '../../src/shared/file-preview-policy.js';

test('previews allow bounded raster images and plain text but never active formats', () => {
  const file = { storageName: 'trusted', bytes: 100 };
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'image/png' }).kind, 'image');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/plain' }).kind, 'text');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'application/pdf' }).kind, 'pdf');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'application/pdf', bytes: 21 * 1024 * 1024 }).kind, null);
  for (const mimeType of ['image/svg+xml', 'text/html', 'application/javascript']) {
    assert.equal(filePreviewPolicy({ ...file, mimeType }).kind, null);
  }
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/plain', bytes: 2 * 1024 * 1024 }).kind, null);
  assert.equal(filePreviewPolicy({ mimeType: 'image/png' }).kind, null);
  assert.equal(canLoadThumbnail({ ...file, mimeType: 'image/png' }), true);
  assert.equal(canLoadThumbnail({ ...file, mimeType: 'image/gif' }), false);
  assert.equal(canLoadThumbnail({ ...file, mimeType: 'IMAGE/GIF; charset=binary' }), false);
  assert.equal(canLoadThumbnail({ ...file, mimeType: 'image/png', bytes: 300 * 1024 }), false);
});
