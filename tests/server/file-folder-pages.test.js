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

test('tablet folder windows leave room for files and use the actual content width', () => {
  assert.equal(fileFolderPageSize({ width: 767, height: 900, contentWidth: 650 }), 2);
  assert.equal(fileFolderPageSize({ width: 1024, height: 768, contentWidth: 900 }), 3);
  assert.equal(fileFolderPageSize({ width: 1366, height: 768, contentWidth: 990 }), 3);
  assert.equal(fileFolderPageSize({ width: 1366, height: 768, contentWidth: 990 }, true), 4);
  assert.equal(fileFolderPageSize({ width: 1920, height: 1080, contentWidth: 1600 }), 8);
  assert.equal(fileFolderPageSize({ width: 390, height: 844, contentWidth: 350 }), 3);
  assert.equal(fileFolderPageSize({ width: 320, height: 567, contentWidth: 280 }), 2);
  assert.equal(fileFolderPageSize({ width: 767, height: 900, contentWidth: 0 }), 1);
});
