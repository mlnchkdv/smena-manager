import assert from 'node:assert/strict';
import test from 'node:test';
import { filePreviewPolicy } from '../../src/shared/file-preview-policy.js';

test('previews allow bounded raster images and plain text but never active formats', () => {
  const file = { storageName: 'trusted', bytes: 100 };
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'image/png' }).kind, 'image');
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/plain' }).kind, 'text');
  for (const mimeType of ['image/svg+xml', 'text/html', 'application/javascript', 'application/pdf']) {
    assert.equal(filePreviewPolicy({ ...file, mimeType }).kind, null);
  }
  assert.equal(filePreviewPolicy({ ...file, mimeType: 'text/plain', bytes: 2 * 1024 * 1024 }).kind, null);
  assert.equal(filePreviewPolicy({ mimeType: 'image/png' }).kind, null);
});
