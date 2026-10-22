import test from 'node:test';
import assert from 'node:assert/strict';
import { multipartFilename } from '../../src/server/file-policy.js';
test('multipart filename decoding preserves UTF-8, actual Latin-1, ASCII and already decoded names', () => {
  for (const name of ['архив.txt', 'ОТЧЁТ.md', '中文.txt', '😀.png']) assert.equal(multipartFilename(Buffer.from(name, 'utf8').toString('latin1')), name);
  assert.equal(multipartFilename('отчёт.txt'), 'отчёт.txt');
  assert.equal(multipartFilename('café.txt'), 'café.txt');
  assert.equal(multipartFilename('plain.txt'), 'plain.txt');
});
