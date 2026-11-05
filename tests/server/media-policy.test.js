import test from 'node:test';
import assert from 'node:assert/strict';
import { safeMedia } from '../../src/shared/media-policy.js';
import { filePreviewPolicy } from '../../src/shared/file-preview-policy.js';
test('media previews require matching safe extension and MIME, without a whole-video blob budget', () => {
  const file = { name: 'clip.mp4', mimeType: 'video/mp4', bytes: 10 * 1024 ** 3, storageName: 'stored.mp4' };
  assert.equal(filePreviewPolicy(file).kind, 'video');
  assert.equal(filePreviewPolicy(file).maxBytes, 20 * 1024 ** 2);
  assert.equal(safeMedia({ ...file, name: 'clip.html' }), null);
  assert.equal(safeMedia({ ...file, mimeType: 'text/html' }), null);
  assert.equal(safeMedia({ name: 'track.mp3', mimeType: 'audio/mpeg' }).kind, 'audio');
});
