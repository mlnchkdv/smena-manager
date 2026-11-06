import test from 'node:test';
import assert from 'node:assert/strict';
import { fileFolderPageSize, fileFolderPageStart } from '../../src/shared/file-folder-pages.js';

test('folder pages fit short/mobile viewports and still reach every folder after a resize', () => {
  for (const compact of [false, true]) {
    for (const [width, height] of [
      [320, 567],
      [390, 844],
      [844, 390],
      [1366, 768],
      [1920, 1080],
    ]) {
      const limit = fileFolderPageSize({ width, height }, compact);
      assert.ok(limit <= (width <= 640 ? 3 : height <= 500 ? 4 : 16));
      const seen = new Set();
      for (let offset = 0; offset < 120; offset += limit) {
        const start = fileFolderPageStart(offset, 120, limit);
        for (let i = start; i < Math.min(120, start + limit); i++) seen.add(i);
      }
      assert.equal(seen.size, 120);
      assert.equal(fileFolderPageStart(119, 120, limit) % limit, 0);
      assert.equal(fileFolderPageStart(200, 0, limit), 0);
    }
  }
});
