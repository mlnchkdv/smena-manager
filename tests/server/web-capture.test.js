import test from 'node:test';
import assert from 'node:assert/strict';
import { webCapture, bookmarkUrlKey } from '../../src/shared/web-capture.js';
test('web clips reject executable URLs, bound excerpts and normalize duplicates', () => {
  assert.throws(() => webCapture({ url: 'javascript:alert(1)' }));
  assert.throws(() => webCapture({ url: 'https://user:password@example.com' }));
  assert.equal(webCapture({ url: 'https://example.com', excerpt: 'x'.repeat(9000) }).excerpt.length, 8000);
  assert.equal(bookmarkUrlKey('https://example.com/?utm_source=test#section'), bookmarkUrlKey('https://example.com/'));
});
